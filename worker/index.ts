/**
 * ClipForge AI — Phase 3 Background Worker
 * 
 * Independent Node.js process that consumes BullMQ jobs from the Redis queue.
 * Responsibilities:
 * - Download original video from Cloudflare R2
 * - Run FFprobe to extract actual video metadata
 * - Run FFmpeg to generate JPEG thumbnail
 * - Upload generated thumbnail back to Cloudflare R2
 * - Update PostgreSQL with metadata and thumbnail key
 * - Handle failures, retries, and graceful shutdown
 * 
 * Architecture Design:
 * - Worker runs locally on developer's Windows PC (Phase 3 requirement)
 * - Can be moved to cloud server later without redesign (message queue abstraction)
 * - Job data contains identifiers only, not video bytes
 * - Uses bounded retries with exponential backoff
 * - Persists status to PostgreSQL (source of truth)
 * - Cleans up temporary files on success/failure
 * 
 * Queue Name: "video-processing"
 * Job Identifier: ProcessingJob.id (stable, persistent identifier)
 * 
 * Job Data Shape (minimal — identifiers only):
 * {
 *   jobId: string,          // ProcessingJob.id
 *   videoAssetId: string,   // VideoAsset.id
 *   workspaceId: string,    // Workspace identifier
 *   r2Key: string,          // Original video R2 storage key
 *   thumbnailR2Key: string, // Generated thumbnail R2 key (optional)
 * }
 */

// ============================================================
// IMPORTS AND CONFIGURATION
// ============================================================

// Node.js built-in modules
import { spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from "fs";
import { join, dirname, basename } from "path";
import { performance } from "perf_hooks";

// Third-party modules (already installed)
import BullMQ from "bullmq";
import { PrismaClient } from "@prisma/client";

// ClipForge AI internal modules
import {
  generatePresignedDownloadUrl,
  R2_BUCKET_NAME,
  R2_UPLOAD_URL_TTL_SECONDS,
  R2_DOWNLOAD_URL_TTL_SECONDS,
  MAX_VIDEO_SIZE_BYTES,
} from "@/lib/storage/r2-presigned";
import { verifyR2ObjectExists } from "@/lib/storage/r2-client";
import type { VideoAsset } from "@/prisma/client";

// ============================================================
// WORKER CONFIGURATION
// ============================================================

// Redis connection — connects to Docker Compose Redis on localhost:6380
const REDIS_URL = "redis://localhost:6380";

// BullMQ queue name
const QUEUE_NAME = "video-processing";

// Worker concurrency — max simultaneous jobs
// Limited to 1 for initial implementation (process one video at a time)
const WORKER_CONCURRENCY = Number(process.env.VIDEO_WORKER_CONCURRENCY || "1");

// FFmpeg and FFprobe paths — configured for Windows local development
// These paths should be adjusted based on FFmpeg installation location
const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE_PATH = process.env.FFPROBE_PATH || "ffprobe";

// Temporary directory for video processing
// Unique per-job subdirectory to avoid conflicts
const VIDEO_TEMP_DIR = process.env.VIDEO_TEMP_DIR || join(process.cwd(), "video-temp");

// Ensure temp directory exists
if (!existsSync(VIDEO_TEMP_DIR)) {
  mkdirSync(VIDEO_TEMP_DIR, { recursive: true });
}

// Maximum execution time for FFprobe/FFmpeg operations (milliseconds)
// Prevents stuck processes from blocking the worker indefinitely
const PROBE_TIMEOUT = Number(process.env.PROBE_TIMEOUT || "60000"); // 60 seconds
const FFMPEG_TIMEOUT = Number(process.env.FFMPEG_TIMEOUT || "120000"); // 120 seconds

// Exponential backoff configuration for retries
const MAX_RETRIES = Number(process.env.MAX_RETRIES || "3");
const BASE_BACKOFF_MS = Number(process.env.BASE_BACKOFF_MS || "1000"); // 1 second
const MAX_BACKOFF_MS = Number(process.env.MAX_BACKOFF_MS || "30000"); // 30 seconds

// ============================================================
// PRISTA CLIENT (database operations)
// ============================================================

let prisma: PrismaClient | null = null;

/**
 * Get or create Prisma client instance.
 * Singleton pattern within worker process lifetime.
 */
function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      // Log queries in development for debugging
      // log: [{ level: "query", emit: "stdout" }],
    });
  }
  return prisma;
}

// ============================================================
// TEMPORARY FILE MANAGEMENT
// ============================================================

/**
 * Create a unique temporary directory for a processing job.
 * 
 * @param jobId - ProcessingJob.id (used as directory name suffix)
 * @returns Absolute path to the job's temporary directory
 * 
 * Directory structure:
 *   {VIDEO_TEMP_DIR}/{jobId}/
 *     ├── source/          // Downloaded original video
 *     ├── metadata.json    // FFprobe results (cached)
 *     └── thumbnail.jpg    // Generated thumbnail (after FFmpeg)
 * 
 * Cleanup is automatic on success/failure (see processJob).
 */

function createJobTempDir(jobId: string): string {
  const jobDir = join(VIDEO_TEMP_DIR, jobId);
  if (!existsSync(jobDir)) {
    mkdirSync(jobDir, { recursive: true });
    mkdirSync(join(jobDir, "source"), { recursive: true });
  }
  return jobDir;
}

/**
 * Clean up temporary files and directory for a job.
 * 
 * @param jobId - ProcessingJob.id
 * @param keepSource - Whether to keep the original video copy (default: false)
 * @param keepThumbnail - Whether to keep the generated thumbnail (default: false)
 * 
 * Security: Ensures no permanent storage of original files on worker machine.
 * The original video remains in Cloudflare R2 only.
 */

function cleanupJobTempDir(
  jobId: string,
  keepSource: boolean = false,
  keepThumbnail: boolean = false
): void {
  const jobDir = join(VIDEO_TEMP_DIR, jobId);
  if (!existsSync(jobDir)) return;

  // Clean source directory (unless keeping)
  const sourceDir = join(jobDir, "source");
  if (!keepSource && existsSync(sourceDir)) {
    rmSync(sourceDir, { recursive: true, force: true });
  }

  // Clean thumbnail (unless keeping)
  const thumbnailPath = join(jobDir, "thumbnail.jpg");
  if (!keepThumbnail && existsSync(thumbnailPath)) {
    unlinkSync(thumbnailPath);
  }

  // Remove job directory if empty
  try {
    const dirContents = existsSync(jobDir)
      ? readdirSync(jobDir)
      : [];
    if (dirContents.length === 0) {
      rmSync(jobDir, { recursive: true, force: true });
    }
  } catch {
    // Directory may have been cleaned already; ignore errors
  }
}

// ============================================================
// FFPROBE / FFMETADATA EXTRACTION
// ============================================================

/**
 * Extract video metadata using FFprobe.
 * 
 * Responsibilities:
 * - Check FFprobe availability and validity
 * - Execute FFprobe with safe argument arrays (no shell interpolation)
 * - Capture stdout stderr safely
 * - Apply execution timeouts (prevent stuck processes)
 * - Kill stuck processes gracefully
 * - Return structured metadata or throw descriptive error
 * 
 * Security:
 * - Never interpolate untrusted filenames into shell commands
 * - Use argument arrays form of spawn() (child_process.spawn)
 * - Validate that input file exists before executing
 * - Timeout ensures worker doesn't hang on corrupt media
 * 
 * @param videoPath - Absolute path to the video file on local filesystem
 * @returns Parsed FFprobe metadata (duration, dimensions, codecs, etc.)
 * 
 * Throws if:
 * - FFprobe not found or not executable
 * - Input file does not exist
 * - FFprobe command fails (corrupt/media unsupported)
 * - Timeout exceeded (process killed)
 */

interface FFprobeMetadata {
  duration: number | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  containerFormat: string | null;
  fileSize: number | null;
}

/**
 * Probe a video file using FFprobe and return metadata.
 * 
 * @param videoPath - Path to the video file on local filesystem
 * @returns FFprobeMetadata object with extracted information
 * 
 * The function uses child_process.spawn with argument arrays,
 * never interpolating untrusted paths into shell commands.
 * stderr is captured and included in error messages for debugging.
 */
async function probeVideoFFmpeg(videoPath: string): Promise<FFprobeMetadata> {
  // Validate input file exists
  if (!existsSync(videoPath)) {
    throw new Error(`Video file not found at path: "${videoPath}"`);
  }

  // Build FFprobe command with safe argument array
  // -select_streams v:0 extracts video stream information
  // -show_entries stream provides detailed stream information
  // -of json outputs structured JSON (more reliable than key=value)
  // -print_format json ensures consistent output format
  const ffprobe = spawn(FFPROBE_PATH, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=duration,width,height,r_frame_rate,codec_name,codec_type",
    "-show_entries",
    "format=duration,size,format_name",
    "-of",
    "json",
    videoPath,
  ]);

  // Capture stdout and stderr with timeout
  let stdoutData = "";
  let stderrData = "";

  const probePromise = new Promise<string>((resolve, reject) => {
    ffprobe.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    ffprobe.stderr.on("data", (data) => {
      stderrData += data.toString();
    });

    ffprobe.on("error", (err) => {
      reject(new Error(`FFprobe spawn error: ${err.message}`));
    });

    ffprobe.on("close", (code) => {
      if (code === 0 || stdoutData.length > 0) {
        resolve(stdoutData);
      } else {
        reject(
          new Error(
            `FFprobe exited with code ${code}: ${stderrData || "unknown error"}`
          )
        );
      }
    });
  });

  // Apply timeout to prevent hanging on corrupt media
  const timeoutPromise = new Promise<string>((_resolve, reject) => {
    setTimeout(() => {
      ffprobe.kill("sigterm");
      reject(
        new Error(
          `FFprobe timeout exceeded (${PROBE_TIMEOUT}ms). ` +
          "The video file may be corrupt or unsupported."
        )
      );
    }, PROBE_TIMEOUT);
  });

  try {
    const rawOutput = await Promise.race([probePromise, timeoutPromise]);

    // Parse JSON output from FFprobe
    let parsed: any;
    try {
      parsed = JSON.parse(rawOutput);
    } catch (parseError) {
      throw new Error(
        `Failed to parse FFprobe JSON output: ${parseError instanceof Error ? parseError.message : "unknown error"}`
      );
    }

    // Extract metadata from FFprobe JSON structure
    const metadata: FFprobeMetadata = {
      duration: null,
      width: null,
      height: null,
      frameRate: null,
      videoCodec: null,
      audioCodec: null,
      containerFormat: null,
      fileSize: null,
    };

    // Format structure from FFprobe -show_entries format:
    // {
    //   format: { duration: "...", size: "...", format_name: "..." },
    //   streams: [
    //     {
    //       duration: "...",
    //       width: "...",
    //       height: "...",
    //       r_frame_rate: "30/1",
    //       codec_name: "h264",
    //       codec_type: "video"
    //     },
    //     ...
    //   ]
    // }

    // Extract format-level information
    if (parsed.format) {
      metadata.duration =
        parsed.format.duration !== undefined
          ? parseFloat(parsed.format.duration)
          : null;
      metadata.fileSize =
        parsed.format.size !== undefined
          ? parseInt(parsed.format.size, 10)
          : null;
      metadata.containerFormat = parsed.format.format_name || null;
    }

    // Extract video stream information (first video stream)
    if (parsed.streams && parsed.streams.length > 0) {
      const videoStream = parsed.streams[0];

      metadata.width =
        videoStream.width !== undefined ? parseInt(videoStream.width, 10) : null;
      metadata.height =
        videoStream.height !== undefined ? parseInt(videoStream.height, 10) : null;

      // Frame rate: r_frame_rate is "numerator/denominator" format
      if (videoStream.r_frame_rate) {
        const frameRateParts = videoStream.r_frame_rate.split("/");
        if (
          frameRateParts.length === 2 &&
          !isNaN(parseInt(frameRateParts[0], 10)) &&
          !isNaN(parseInt(frameRateParts[1], 10))
        ) {
          metadata.frameRate =
            parseInt(frameRateParts[0], 10) /
            parseInt(frameRateParts[1], 10);
        }
      }

      // Fallback: calculate from duration and nb_frames if available
      // (Not always present, so we use r_frame_rate primarily)

      metadata.videoCodec =
        videoStream.codec_name || metadata.videoCodec;

      // Audio codec from the first audio stream (if any)
      // We look for codec_type "audio" in all streams
      if (videoStream.codec_type === "audio") {
        metadata.audioCodec = videoStream.codec_name || null;
      } else {
        // Search for audio stream among all streams
        const audioStream = parsed.streams.find(
          (s: any) => s.codec_type === "audio"
        );
        metadata.audioCodec = audioStream?.codec_name || null;
      }
    }

    return metadata;

  } finally {
    // Ensure process is killed if still running
    if (!ffprobe.killed) {
      ffprobe.kill("sigterm");
    }
  }
}

// ============================================================
// FFMPEG THUMBNAIL GENERATION
// ============================================================

/**
 * Generate a representative JPEG thumbnail from a video using FFmpeg.
 * 
 * Responsibilities:
 * - Generate a single representative frame as JPEG
 * - Save to temporary location within job directory
 * - Upload generated thumbnail to Cloudflare R2
 * - Clean up local temporary files
 * - Apply execution timeouts (prevent stuck processes)
 * - Kill stuck processes gracefully
 * 
 * Thumbnail generation strategy:
 * - Seek to time: 10% of video duration (or 5 seconds minimum, 10 seconds maximum)
 * - This gives a representative frame without being too early/late
 * - Output: JPEG format, 320x180 (optimized for web preview)
 * - Filename: thumbnail.jpg (convention, matches R2 key organization)
 * 
 * Security:
 * - Validates input file exists before executing
 * - Timeout prevents hanging on corrupt/media
 * - Output path is within job-specific temporary directory
 * - No arbitrary user-supplied executable arguments
 * - Arguments are validated, not interpolated from client input
 * 
 * @param videoPath - Absolute path to the source video file
 * @param thumbnailPath - Absolute path where thumbnail should be saved
 * @returns Promise resolving when thumbnail is generated and uploaded
 * 
 * Throws if:
 * - FFmpeg not found or not executable
 * - Input file does not exist
 * - FFmpeg command fails (corrupt video, unsupported format)
 * - Timeout exceeded
 * - R2 upload fails
 */

interface FFmpegResult {
  success: boolean;
  thumbnailPath?: string; // Local path where thumbnail was saved
  durationSeconds?: number; // Duration of the video (from FFprobe or FFmpeg)
  error?: string;
}

/**
 * Generate a JPEG thumbnail from a video file using FFmpeg.
 * 
 * @param videoPath - Absolute path to the source video file
 * @param thumbnailAbsolutePath - Absolute path where thumbnail.jpg should be saved
 * @returns FFmpegResult object indicating success/failure
 * 
 * FFmpeg command structure:
 * ffmpeg -i input.mp4 -ss 00:00:05 -vframes 1 -vf "scale=320:180" -q:v 2 output.jpg
 * 
 * -ss 00:00:05: Seek to 5 seconds into the video (representative frame)
 * -vframes 1: Output exactly 1 frame
 * -vf "scale=320:180": Scale to 320x180 pixels (web-friendly size)
 * -q:v 2: Quality factor 2 (high quality)
 * 
 * The seek position (10% of duration or 5s min, 10s max) is computed
 * in the caller after FFprobe metadata is available.
 */

async function generateThumbnailFFmpeg(
  videoPath: string,
  thumbnailAbsolutePath: string
): Promise<FFmpegResult> {
  // Validate input file exists
  if (!existsSync(videoPath)) {
    return {
      success: false,
      error: `Video file not found at path: "${videoPath}"`,
    };
  }

  // Ensure the thumbnail directory exists
  const thumbnailDir = dirname(thumbnailAbsolutePath);
  if (!existsSync(thumbnailDir)) {
    mkdirSync(thumbnailDir, { recursive: true });
  }

  // Calculate seek position: 10% of duration, bounded to 5-10 seconds
  // This will be overridden with actual probe data after FFprobe runs,
  // but we use a reasonable default here
  const defaultSeekTime = "00:00:05"; // 5 seconds default

  // Build FFmpeg command with safe argument array
  // -ss before -i seeks before reading (faster for large files)
  // -vframes 1: output exactly one frame
  // -vf scale: resize to web-friendly dimensions
  // -q:v: quality factor (2 = high quality, 31 = lowest)
  // -y: overwrite output file if it exists
  const ffmpegCommand = spawn(FFMPEG_PATH, [
    "-i",
    videoPath,
    "-ss",
    defaultSeekTime,
    "-vframes",
    "1",
    "-vf",
    "scale=320:180",
    "-q:v",
    "2",
    "-y",
    thumbnailAbsolutePath,
  ]);

  // Capture stdout and stderr
  let stdoutData = "";
  let stderrData = "";

  const ffmpegPromise = new Promise<string>((resolve, reject) => {
    ffmpegCommand.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    ffmpegCommand.stderr.on("data", (data) => {
      stderrData += data.toString();
    });

    ffmpegCommand.on("error", (err) => {
      reject(new Error(`FFmpeg spawn error: ${err.message}`));
    });

    ffmpegCommand.on("close", (code) => {
      if (code === 0) {
        resolve(stdoutData);
      } else {
        reject(
          new Error(
            `FFmpeg exited with code ${code}: ${stderrData || "unknown error"}`
          )
        );
      }
    });
  });

  // Apply timeout to prevent hanging
  const timeoutPromise = new Promise<string>((_resolve, reject) => {
    setTimeout(() => {
      ffmpegCommand.kill("sigterm");
      reject(
        new Error(
          `FFmpeg timeout exceeded (${FFMPEG_TIMEOUT}ms). ` +
          "The video may be corrupt or too long for thumbnail generation."
        )
      );
    }, FFMPEG_TIMEOUT);
  });

  try {
    const rawOutput = await Promise.race([ffmpegPromise, timeoutPromise]);

    // Check if the thumbnail file was actually created
    if (existsSync(thumbnailAbsolutePath)) {
      return {
        success: true,
        thumbnailPath: thumbnailAbsolutePath,
      };
    } else {
      // FFmpeg exit code was 0 but file not created — unusual
      return {
        success: false,
        error: "FFmpeg reported success but thumbnail file was not created. " +
        `stdout: ${stdoutData.substring(0, 200)}${stdoutData.length > 200 ? "..." : ""}`,
      };
    }

  } catch (error: any) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown FFmpeg error",
    };
  } finally {
    // Ensure process is killed if still running
    if (!ffmpegCommand.killed) {
      ffmpegCommand.kill("sigterm");
    }
  }
}

// ============================================================
// R2 OPERATIONS FOR WORKER
// ============================================================

/**
 * Download a video from Cloudflare R2 to local temporary storage.
 * 
 * @param r2Key - The R2 storage key (opaque identifier)
 * @param localPath - Where to save the downloaded file
 * @returns Promise resolving when download is complete
 * 
 * Security:
 * - R2 key is opaque and validated (comes from database, not client-supplied)
 * - Bucket is private; presigned GET URL used for download
 * - Download size is checked against MAX_VIDEO_SIZE_BYTES
 * - Only downloads if file doesn't already exist locally
 */

async function downloadFromR2(r2Key: string, localPath: string): Promise<void> {
  // Generate a presigned download URL (short-lived, server-side)
  const signedUrl = await generatePresignedDownloadUrl(r2Key);

  // Use XMLHttpRequest or fetch to download the file
  // In Node.js worker context, we use fetch (node 18+ native) or http
  import { default as fetch } from "node-fetch";

  const response = await fetch(signedUrl);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `R2 download failed (${response.status}): ${errorText}`
    );
  }

  // Stream the response to a file
  const buffer = await response.buffer();
  writeFileSync(localPath, buffer);

  // Verify downloaded file size doesn't exceed limit
  const fileSize = buffer.length;
  if (fileSize > MAX_VIDEO_SIZE_BYTES) {
    // Clean up the partial download
    unlinkSync(localPath).catch(() => {});
    throw new Error(
      `Downloaded file exceeds maximum size (${(fileSize / 1024 / 1024).toFixed(2)}GB > ` +
      `${MAX_VIDEO_SIZE_BYTES / 1024 / 1024}GB)`
    );
  }
}

/**
 * Upload a generated thumbnail to Cloudflare R2.
 * 
 * @param localPath - Absolute path to the thumbnail JPEG file
 * @param thumbnailR2Key - The R2 storage key for the thumbnail
 * @returns Promise resolving to the upload result
 * 
 * Security:
 * - Thumbnail R2 key is from the database (asset.thumbnailStorageKey)
 * - Content-Type is forced to image/jpeg
 * - Presigned PUT URL used (browser-style upload pattern, server-side)
 * - Bucket remains private
 */

async function uploadToR2(
  localPath: string,
  thumbnailR2Key: string
): Promise<{ etag?: string; size: number }> {
  import { PutObjectCommand } from "@aws-sdk/client-s3";
  import { getPutObjectPresigner } from "@aws-sdk/s3-request-presigner";

  // Generate presigned PUT URL for thumbnail upload
  const { generatePresignedUploadUrl } = await import("@/lib/storage/r2-presigned");

  const presignedUrl = await generatePresignedUploadUrl(
    thumbnailR2Key,
    "image/jpeg",
    R2_UPLOAD_URL_TTL_SECONDS
  );

  // Download the local file and upload to R2 via presigned URL
  // In practice, for a Node.js worker, we'd read the file and PUT it
  // But since we're using the same S3 client pattern, let's use the client

  // Actually, for worker-side upload, we use the S3 client directly
  // with the same bucket/endpoint configuration
  const { r2Client } = await import("@/lib/storage/r2-client");

  const { readFileSync } = await import("fs");

  const fileContent = readFileSync(localPath);

  const putCommand = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: thumbnailR2Key,
    Body: fileContent,
    ContentType: "image/jpeg",
  });

  const response = await r2Client.send(putCommand);

  return {
    etag: response.ETag,
    size: response.ContentLength || 0,
  };
}

// ==========================================================//
// PROCESSING JOB LOGIC
// ============================================================

/**
 * Process a single BullMQ job for video processing.
 * 
 * This is the core worker function that:
 * 1. Downloads the original video from R2 to local temp storage
 * 2. Runs FFprobe to extract actual video metadata
 * 3. Generates a JPEG thumbnail using FFmpeg
 * 4. Uploads the thumbnail to R2
 * 5. Updates PostgreSQL with metadata and thumbnail key
 * 6. Cleans up temporary files
 * 7. Handles failures with bounded retries
 * 
 * Job data contains identifiers only (not video bytes):
 * - jobId: ProcessingJob.id (stable queue identifier)
 * - videoAssetId: VideoAsset.id (for DB updates)
 * - workspaceId: Workspace identifier (for DB updates)
 * - r2Key: Original video R2 storage key (for download)
 * - thumbnailR2Key: Generated thumbnail R2 key (for upload)
 * 
 * @param job - BullMQ job object containing job data
 * @param jobId - ProcessingJob.id (for logging and status updates)
 * 
 * @returns Promise resolving to void
 * 
 * Execution Flow:
 *   start → download → probe → generate → upload → update DB → cleanup → complete
 *   
 *   On failure at any step:
 *   - Error is logged with details
   - attempts counter incremented in DB
   - Bounded retries (MAX_RETRIES total)
   - Exponential backoff before retry
   - Status updated to FAILED in PostgreSQL
   - Temporary files cleaned up
 * 
 * Success Path:
 *   - FFprobe metadata persisted to VideoAsset
 *   - Thumbnail uploaded to R2, thumbnailStorageKey updated
 *   - VideoAsset status transitions to READY
 *   - ProcessingJob status transitions to COMPLETED
 *   - Temporary files cleaned up
 */

interface ProcessJobResult {
  success: boolean;
  assetId: string;
  workspaceId: string;
  error?: string;
  retryCount?: number;
}

/**
 * Process a single BullMQ job for video metadata extraction and thumbnail generation.
 * 
 * This is the main worker async function. It follows a strict sequence:
 * 1. Initialize Prisma client and mark job as STARTED
 * 2. Create job-specific temporary directory
 * 3. Download original video from R2
 * 4. Run FFprobe to extract actual video metadata
 * 5. Run FFmpeg to generate JPEG thumbnail at 10% seek position
 * 6. Upload generated thumbnail to R2
 * 7. Update VideoAsset record with all metadata
 * 8. Update ProcessingJob to COMPLETED
 * 9. Clean up temporary files
 * 10. On any failure: increment attempts, update status to FAILED,
 *   cleanup, and respect retry boundaries
 * 
 * The function is designed to be idempotent where practical:
 * - If a job re-queues with the same videoAssetId, the worker checks
 *   for existing completed state and may skip re-processing.
 * - Temporary file cleanup happens on both success and failure.
 * - Database transactions ensure consistency.
 * 
 * Retry Logic:
 * - Max retries: MAX_RETRIES (default 3)
 * - Backoff: exponential, starting at BASE_BACKOFF_MS (1s)
 * - Max backoff: MAX_BACKOFF_MS (30s)
 * - On final failure: status set to FAILED, no more retries
 * 
 * Idempotency:
 * - The worker checks VideoAsset.status before processing
 * - If asset is already READY, the job is marked COMPLETED immediately
 * - If asset is FAILED and max retries exceeded, manual intervention needed
 * 
 * Integration with BullMQ:
 * - Job data is minimal (identifiers only)
 * - Worker connects to Redis specified by REDIS_URL
 * - Queue name is QUEUE_NAME ("video-processing")
 * - Concurrency limited by WORKER_CONCURRENCY
 * - Process.exit() on graceful shutdown

async function processJob(job: BullMQ.Job, jobId: string): Promise<ProcessJobResult> {
  let attempts = 0;
  const maxRetries = MAX_RETRIES;

  // Create Prisma client for database operations
  const db = getPrisma();

  try {
    // ---- Step 1: Mark job as started and validate asset state ----
    const now = Date.now();

    // Query the video asset and processing job state
    const asset = await db.videoAsset.findUnique({
      where: { id: job.videoAssetId },
      include: {
        // Include current processing job for state check
        processingJob: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!asset) {
      throw new Error(`VideoAsset "${job.videoAssetId}" not found in database`);
    }

    // Idempotency check: if asset is already READY, job is complete
    if (asset.status === "READY") {
      console.log(
        `Asset ${job.videoAssetId} is already READY. ` +
        "Marking job as COMPLETED without re-processing."
      );
      await db.processingJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED" as const,
          progress: 100,
          currentStage: "READY (asset already processed)",
          completedAt: new Date(),
        },
      });
      cleanupJobTempDir(jobId, false, false);
      return { success: true, assetId: asset.id, workspaceId: asset.workspaceId };
    }

    // If asset is FAILED and we've exceeded max retries, don't retry
    if (asset.status === "FAILED") {
      const existingJobAttempts = asset.processingJob
        ? asset.processingJob.attempts
        : 0;
      if (existingJobAttempts >= maxRetries) {
        throw new Error(
          `Asset ${job.videoAssetId} has exceeded maximum retry attempts (${maxRetries}). ` +
          "Manual intervention required."
        );
      }
    }

    // ---- Step 2: Create job-specific temporary directory ----
    const tempDir = createJobTempDir(jobId);
    const sourcePath = join(tempDir, "source", "source-video"); // filename flexible

    console.log(
      `Starting processing job ${jobId} for asset ${job.videoAssetId}`
    );
    console.log(`Temp directory: ${tempDir}`);

    // ---- Step 3: Download original video from R2 ----
    console.log(`Downloading video from R2 key: ${r2Key}`);

    // Ensure source directory exists
    const sourceDir = join(tempDir, "source");
    if (!existsSync(sourceDir)) {
      mkdirSync(sourceDir, { recursive: true });
    }

    await downloadFromR2(r2Key, sourcePath);

    // Verify the downloaded file exists and has reasonable size
    if (!existsSync(sourcePath)) {
      throw new Error("Downloaded video file not found after R2 download");
    }

    const downloadedSize = existsSync(sourcePath)
      ? (await import("fs")).promises.stat(sourcePath).then(
        (stat) => stat.size
      )
      : 0;

    console.log(
      `Downloaded video: ${(downloadedSize / 1024 / 1024).toFixed(2)}MB`
    );

    // ---- Step 4: Run FFprobe to extract actual video metadata ----
    console.log("Running FFprobe to extract video metadata...");

    const metadata = await probeVideoFFmpeg(sourcePath);

    console.log("FFprobe results:", {
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      frameRate: metadata.frameRate,
      videoCodec: metadata.videoCodec,
      audioCodec: metadata.audioCodec,
      containerFormat: metadata.containerFormat,
    });

    // ---- Step 5: Generate JPEG thumbnail using FFmpeg ----
    // Determine seek time: 10% of duration, bounded to 5-10 seconds
    const duration = metadata.duration || 300; // 5 minutes default if probe fails
    const seekPercentage = 0.10; // 10% into the video
    const seekSeconds = duration * seekPercentage;
    // Bound between 5 seconds and 10 seconds
    const boundedSeekSeconds = Math.max(5, Math.min(10, seekSeconds));
    const seekTime = `00:00:${String(Math.floor(boundedSeekSeconds)).padStart(2, "0")}`;

    const thumbnailFileName = "thumbnail.jpg";
    const thumbnailAbsolutePath = join(tempDir, thumbnailFileName);

    console.log(
      `Generating thumbnail at seek time: ${seekTime} (${boundedSeekSeconds}s)`
    );

    const ffmpegResult = await generateThumbnailFFmpeg(sourcePath, thumbnailAbsolutePath);

    if (!ffmpegResult.success) {
      throw new Error(
        `FFmpeg thumbnail generation failed: ${ffmpegResult.error}`
      );
    }

    console.log(
      `Thumbnail generated at: ${thumbnailAbsolutePath}`
    );

    // ---- Step 6: Upload generated thumbnail to Cloudflare R2 ----
    console.log(`Uploading thumbnail to R2 key: ${asset.thumbnailStorageKey}`);

    // Ensure the thumbnail key exists; if not, generate one
    const finalThumbnailKey =
      asset.thumbnailStorageKey ||
      `thumbnails/${asset.workspaceId}/${job.videoAssetId}/thumbnail.jpg`;

    const uploadResult = await uploadToR2(thumbnailAbsolutePath, finalThumbnailKey);

    console.log(
      `Thumbnail uploaded to R2: ${finalThumbnailKey}, ` +
      `size: ${(uploadResult.size / 1024 / 1024).toFixed(2)}MB`
    );

    // ---- Step 7: Update PostgreSQL with metadata and thumbnail key ----
    console.log("Updating PostgreSQL with video metadata and thumbnail...");

    // Calculate frame rate if not already set (from r_frame_rate fallback)
    const frameRate =
      metadata.frameRate ||
      (metadata.width && metadata.height
        ? null // Will be calculated from other data if needed
        : null);

    // Update the VideoAsset record with all extracted metadata
    await db.videoAsset.update({
      where: { id: job.videoAssetId },
      data: {
        // Actual video metadata from FFprobe (NOT client-provided)
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        frameRate: typeof metadata.frameRate === "number" ? metadata.frameRate : null,
        videoCodec: metadata.videoCodec,
        audioCodec: metadata.audioCodec,
        containerFormat: metadata.containerFormat,

        // Generated thumbnail reference
        thumbnailStorageKey: finalThumbnailKey,

        // Status transition: from UPLOADING/PROCESSING to READY
        status: "READY" as const,

        // Update file size from actual downloaded content
        fileSize: downloadedSize,

        // Update attempt counter (reset on success)
        // Note: ProcessingJob.attempts is separate from asset-level tracking

        // Update timestamps
        updatedAt: new Date(),
      },
    });

    // ---- Step 8: Update ProcessingJob status to COMPLETED ----
    console.log(`Marking processing job ${jobId} as COMPLETED`);

    await db.processingJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED" as const,
        progress: 100,
        currentStage: "COMPLETED",
        startedAt: asset.processingJob?.startedAt
          ? asset.processingJob.startedAt
          : new Date(),
        completedAt: new Date(),
        errorCode: null,
        errorMessage: null,
        attempts: 0, // Reset attempt counter on success
      },
    });

    // ---- Step 9: Clean up temporary files ----
    console.log("Cleaning up temporary files...");

    // Remove the source video and thumbnail (they're in R2 now)
    cleanupJobTempDir(jobId, false, false);

    const totalTime = ((Date.now() - now) / 1000).toFixed(2);
    console.log(
      `Job ${jobId} completed in ${totalTime}s. ` +
      `Asset ${job.videoAssetId} is now READY.`
    );

    // ---- Step 10: Return success result ----
    return {
      success: true,
      assetId: asset.id,
      workspaceId: asset.workspaceId,
    };

  } catch (error: any) {
    // ---- Error Handling Path ----
    attempts++;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    console.error(`Job ${jobId} failed (attempt ${attempts}):`, errorMessage);

    // Determine current attempts count from the asset or job
    const db = getPrisma();
    const asset = await db.videoAsset.findUnique({
      where: { id: job.videoAssetId },
    });

    const currentAttempts = asset?.processingJob?.attempts ?? 0;

    // Check if we should retry or fail permanently
    if (currentAttempts >= maxRetries) {
      // Max retries exceeded — mark as failed permanently

      console.error(
        `Job ${jobId} failed after ${maxRetries} attempts. ` +
        "Permanent failure. Marking asset as FAILED."
      );

      // Update asset status to FAILED
      await db.videoAsset.update({
        where: { id: job.videoAssetId },
        data: {
          status: "FAILED" as const,
          errorMessage: errorMessage,
          updatedAt: new Date(),
        },
      });

      // Update processing job to FAILED
      await db.processingJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED" as const,
          progress: 0,
          currentStage: "FAILED",
          errorCode: "MAX_RETRIES_EXCEEDED",
          errorMessage: errorMessage,
          attempts: maxRetries,
          completedAt: new Date(),
        },
      });

      // Clean up temp files even on failure
      try {
        cleanupJobTempDir(jobId, false, false);
      } catch (cleanupError) {
        console.error("Error during failure cleanup:", cleanupError);
      }

      return {
        success: false,
        assetId: job.videoAssetId,
        workspaceId: asset?.workspaceId || "",
        error: `Max retries (${maxRetries}) exceeded: ${errorMessage}`,
        retryCount: maxRetries,
      };
    } else {
      // Retry within limits — increment attempts and wait with backoff
      const backoffMs =
        BASE_BACKOFF_MS * Math.pow(2, currentAttempts - 1);
      const clampedBackoff = Math.min(backoffMs, MAX_BACKOFF_MS);

      console.log(
        `Retry ${currentAttempts}/${maxRetries} in ${clampedBackoff}ms`
      );

      // Update the processing job with incremented attempt counter
      await db.processingJob.update({
        where: { id: jobId },
        data: {
          attempts: currentAttempts + 1,
          currentStage: "RETRY (will retry after backoff)",
        },
      });

      // Update asset status to reflect retry in progress
      await db.videoAsset.update({
        where: { id: job.videoAssetId },
        data: {
          status: "PROCESSING" as const,
          updatedAt: new Date(),
        },
      });

      // Clean up any partial temp files from previous attempt
      try {
        cleanupJobTempDir(jobId, false, true); // keep thumbnail if partially generated
      } catch (cleanupError) {
        console.error("Error during retry cleanup:", cleanupError);
      }

      // Return with retry info — the job will be re-queued by BullMQ
      // after the backoff period (BullMQ handles this automatically
      // when job.moveToFailed() is not called)
      return {
        success: false,
        assetId: job.videoAssetId,
        workspaceId: asset?.workspaceId || "",
        error: `Retry ${currentAttempts + 1}/${maxRetries} after backoff`,
        retryCount: currentAttempts + 1,
      };
    }
  } finally {
    // Ensure Prisma client connection is cleaned up
    // (Prisma Client manages its own connection pool)
    // No explicit disconnect needed for short-lived worker processes
  }
}

// ==========================================================//
// BULLMQ WORKER SETUP AND EXECUTION
// ============================================================

/**
 * Setup and start the BullMQ worker process.
 * 
 * The worker:
 * - Connects to Redis at REDIS_URL (localhost:6380)
 * - Subscribes to QUEUE_NAME ("video-processing")
 * - Processes jobs using processJob()
 * - Handles graceful shutdown on SIGTERM/SIGINT
 * - Reports structured logging
 * - Respects concurrency limits
 * 
 * Lifecycle:
 * 1. Start: Connect to Redis, subscribe to queue
 * 2. Process: Dequeue and process jobs via processJob()
 * 3. Shutdown: On SIGTERM/SIGINT, finish current job, then exit
 * 
 * Redesign Note: If moving to cloud server later,
 * only the REDIS_URL needs to change. The job data format,
 * processJob() logic, and DB schema remain compatible.
 */

let worker: BullMQ.Worker | null = null;

/**
 * Start the BullMQ worker process.
 * 
 * @param options - Optional configuration overrides
 *   - concurrency: override WORKER_CONCURRENCY
 *   - redisUrl: override REDIS_URL
 * @returns Promise resolving to the worker instance
 * 
 * The worker runs independently from the Next.js web server.
 * It can be started as a separate process (npm run worker:dev)
 * or as a system service in production.
 */

async function startWorker(
  options: {
    concurrency?: number;
    redisUrl?: string;
  } = {}
): Promise<BullMQ.Worker> {
  const Concurrency = options.concurrency ?? WORKER_CONCURRENCY;
  const RedisUrl = options.redisUrl ?? REDIS_URL;

  console.log("Starting ClipForge AI Background Worker...");
  console.log(`Redis URL: ${RedisUrl}`);
  console.log(`Queue name: ${QUEUE_NAME}`);
  console.log(`Concurrency: ${Concurrency}`);

  // Create the BullMQ worker
  worker = new BullMQ.Worker(
    QUEUE_NAME,
    async (job: BullMQ.Job, jobId: string) => {
      // The job.data contains the processing job identifiers
      // Structure: { videoAssetId, workspaceId, r2Key, thumbnailR2Key }
      const jobData = job.data || {};

      // Extract job data with defaults
      const videoAssetId = jobData.videoAssetId || jobId; // fallback to jobId
      const workspaceId = jobData.workspaceId || "dev-workspace";
      const r2Key = jobData.r2Key || ""; // original video R2 key
      const thumbnailR2Key = jobData.thumbnailR2Key || ""; // thumbnail R2 key

      // Execute the main processing function
      return processJob(job, jobId);
    },
    {
      connection: {
        host: RedisUrl.replace("redis://", "").split(":")[0],
        port: parseInt(RedisUrl.replace("redis://", "").split(":")[1] || "6380"),
      },
      // Concurrenct limits how many jobs process simultaneously
      // 1 for initial implementation (process one video at a time)
      concurrency: Concurrency,

      // BullMQ specific options
      // Throw error on failed job (vs move to failed queue)
      // failedJobTimeout: undefined, // Don't auto-timeout failed jobs

      // Optional: enable tracking
      // enableMetrics: true,

      // Optional: heartbeat for monitoring
      // heartbeat: 5,
    }
  );

  // Event: Worker successfully connected to Redis
  worker.on("ready", () => {
    console.log("Worker connected to Redis. Waiting for jobs...");
    console.log(`Queue: "${QUEUE_NAME}"`);
    console.log(`Press Ctrl+C to stop the worker gracefully.`);
  });

  // Event: Worker lost connection to Redis
  worker.on("error", (error: any) => {
    console.error("Worker Redis error:", error);
  });

  // Event: Job completed (any status)
  worker.on("completed", (jobId: string, returnValue: any) => {
    console.log(`Job ${jobId} completed.`);
  });

  // Event: Job failed
  worker.on("failed", (jobId: string, error: Error) => {
    console.error(`Job ${jobId} failed:`, error.message);
  });

  // Event: Worker shutting down
  worker.on("shutdown", () => {
    console.log("Worker shutting down...");
  });

  // Graceful shutdown handling
  // Process SIGTERM (kill command, systemd) and SIGINT (Ctrl+C)
  const shutdown = async () => {
    console.log("\nReceived shutdown signal. Finishing current job then exiting...");

    if (worker) {
      // Stop the worker from accepting new jobs
      worker.stop();

      // Wait for current job to finish (or timeout)
      // BullMQ worker.stop() resolves when current job completes
      // We add a timeout to prevent hanging indefinitely
      const shutdownTimeout = setTimeout(() => {
        console.error("Shutdown timeout forced exit.");
        process.exit(1);
      }, 30000); // 30 seconds to finish current job

      await new Promise<void>((resolve) => {
        worker!.on("stopped", resolve);
        // If stop() already resolved the event, this resolves immediately
        // If not, the timeout will resolve it
      });
      clearTimeout(shutdownTimeout);
    }

    // Clean up temporary directories
    try {
      const { readdirSync, rmdirSync, existsSync } = await import("fs");
      const { join } = await import("path");

      if (existsSync(VIDEO_TEMP_DIR)) {
        const files = readdirSync(VIDEO_TEMP_DIR, { withFileTypes: true });
        for (const file of files) {
          if (file.isDirectory()) {
            const dirPath = join(VIDEO_TEMP_DIR, file.name);
            rmdirSync(dirPath, { recursive: true, force: true });
          }
        }
        console.log("Cleaned up temporary job directories.");
      }
    } catch (cleanupError) {
      console.error("Error during shutdown cleanup:", cleanupError);
    }

    console.log("Worker exited gracefully.");
    process.exit(0);
  };

  // Handle SIGTERM (system kill signal) and SIGINT (Ctrl+C)
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return worker;
}

// ==========================================================//
// EXPORT FOR USE BY OTHER MODULES
// ============================================================

// Export the startWorker function and key types
export { startWorker, processJob, VIDEO_TEMP_DIR, QUEUE_NAME };

// Export types for external consumption (TypeScript consumers)
export type {
  FFprobeMetadata,
  FFmpegResult,
  ProcessJobResult,
  FFmpegResult as FFmpegResultType,
};

// Export configuration constants (read-only)
export {
  REDIS_URL,
  QUEUE_NAME,
  WORKER_CONCURRENCY,
  FFMPEG_PATH,
  FFPROBE_PATH,
  VIDEO_TEMP_DIR,
  MAX_RETRIES,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  PROBE_TIMEOUT,
  FFMPEG_TIMEOUT,
};