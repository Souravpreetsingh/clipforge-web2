/// R2 Download Module — Presigned URL generation for object access
///
/// Provides short-lived presigned GET URLs for:
/// - Video preview/seeking
/// - Thumbnail display
/// - Asset verification (internal use only)
///
/// Bucket remains private at all times. No public read access enabled.
/// All URLs are cryptographically signed and expire after TTL.

import type { GetSignedUrlOutput } from "@aws-sdk/s3-request-presigner";
import { r2Client, generateR2PresignedDownloadUrl, generateR2PresignedPreviewUrl } from "./r2-client";
import type { VideoAsset } from "@/prisma/client";

// ============================================================
// PUBLIC API TYPES
// ============================================================

/**
 * Output from generating a preview URL for a video asset.
 * 
 * The frontend uses this URL to display a video preview or enable seeking.
 * The URL is short-lived and cryptographically signed.
 */
export interface AssetPreviewUrlOutput {
  /** Presigned GET URL for video preview */
  previewUrl: string;
  /** URL expiration time (Unix timestamp in seconds) */
  expiresAt: number;
  /** Asset ID for reference */
  assetId: string;
  /** Storage key for reference */
  storageKey: string;
}

/**
 * Output from generating a thumbnail URL for a video asset.
 * 
 * The frontend uses this URL to display the generated video thumbnail.
 */
export interface AssetThumbnailUrlOutput {
  /** Presigned GET URL for thumbnail JPEG */
  thumbnailUrl: string;
  /** URL expiration time (Unix timestamp in seconds) */
  expiresAt: number;
  /** Asset ID for reference */
  assetId: string;
  /** Storage key for reference */
  storageKey: string;
}

/**
 * Output from the asset metadata API.
 * 
 * Returned by GET /api/assets/[id] — never exposes private R2 credentials
 * or unrestricted storage URLs.
 */
export interface AssetMetadataOutput {
  /** Database-generated asset ID */
  assetId: string;
  /** Workspace identifier */
  workspaceId: string;
  /** Project ID (nullable if workspace-level asset) */
  projectId?: string | null;
  /** Original filename as provided by user */
  originalFilename: string;
  /** MIME type */
  mimeType: string;
  /** Actual file size from R2 verification (bytes) */
  fileSize: number;
  /** Video duration from FFprobe (seconds; null if not yet probed) */
  duration?: number | null;
  /** Video width in pixels from FFprobe */
  width?: number | null;
  /** Video height in pixels from FFprobe */
  height?: number | null;
  /** Frame rate in fps from FFprobe */
  frameRate?: number | null;
  /** Video codec from FFprobe */
  videoCodec?: string | null;
  /** Audio codec from FFprobe */
  audioCodec?: string | null;
  /** Container format from FFprobe */
  containerFormat?: string | null;
  /** Status of asset processing */
  status: string;
  /** R2 storage key (opaque; used with presigned URLs) */
  storageKey: string;
  /** Generated thumbnail storage key (nullable if not yet generated) */
  thumbnailStorageKey?: string | null;
  /** Processing job ID (nullable if no job queued) */
  processingJobId?: string | null;
  /** Current processing status (if job exists) */
  currentProcessingStage?: string | null;
  /** Progress percentage (0-100; if job exists) */
  progress?: number | null;
}

// ============================================================
// ASSET METADATA API LOGIC
// ============================================================

/**
 * Retrieve authorized asset metadata from the database.
 * 
 * Responsibilities:
 * ✅ Return authorized asset metadata
 * ✅ Return project relationship (if any)
 * ✅ Return processing status
 * ✅ Never expose private R2 credentials or unrestricted storage URLs
 * ✅ Never trust client-provided metadata as the final source
 * 
 * Security:
 * - Validates workspace ownership before returning any data
 * - Returns only sanitized metadata (no raw R2 URLs)
 * - Presigned URLs must be generated separately via /api/assets/[id]/preview-url
 * - All R2 keys are opaque identifiers; URLs are time-limited
 * 
 * @param assetId - The database asset ID
 * @param workspaceId - The workspace identifier (for authorization)
 * @returns Sanitized asset metadata suitable for frontend display
 * 
 * Throws if asset not found or unauthorized access attempted.
 */
export async function getAssetMetadata(
  assetId: string,
  workspaceId: string
): Promise<AssetMetadataOutput> {
  import { PrismaClient } from "@prisma/client";
  const prisma = new PrismaClient();
  
  // Query asset with workspace authorization check
  const asset = await prisma.videoAsset.findFirst({
    where: {
      id: assetId,
      workspaceId: workspaceId,
    },
  });
  
  // Fetch project separately if projectId is present
  const project = asset.projectId
    ? await prisma.project.findUnique({
        where: { id: asset.projectId },
      })
    : undefined;
  
  // Fetch processing job separately if it exists
  const processingJob = await prisma.processingJob.findFirst({
    where: { videoAssetId: assetId },
  });
  
  if (!asset) {
    throw new Error(
      `Asset "${assetId}" not found in workspace "${workspaceId}". ` +
      "Unauthorized access or invalid asset ID."
    );
  }
  
  // Build the output — never expose raw R2 URLs or credentials
  const output: AssetMetadataOutput = {
    assetId: asset.id,
    workspaceId: asset.workspaceId,
    projectId: project?.id,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    fileSize: asset.fileSize,
    status: asset.status,
    storageKey: asset.storageKey,
  };
  
  // Add optional processing job information if it exists
  if (processingJob) {
    output.processingJobId = processingJob.id;
    output.currentProcessingStage = processingJob.currentStage;
    output.progress = processingJob.progress;
    
    // Add video metadata fields if the job has completed and metadata is available
    // (In Phase 3, metadata comes from FFprobe during processing, not from client)
    if (processingJob.status === "COMPLETED") {
      // Metadata would be populated from FFprobe results — placeholder for Phase 4+
      output.duration = processingJob.currentStage 
        ? parseFloat(processingJob.currentStage) 
        : null;
    }
  }
  
  // Add thumbnail information if available
  if (asset.thumbnailStorageKey) {
    output.thumbnailStorageKey = asset.thumbnailStorageKey;
  }
  
  return output;
}

// ============================================================
// PREVIEW URL API LOGIC
// ============================================================

/**
 * Generate a short-lived presigned preview URL for a video asset.
 * 
 * Responsibilities:
 * ✅ Verify ownership
 * ✅ Generate a short-lived signed preview URL
 * ✅ Never make the bucket public
 * 
 * The frontend uses this URL for:
 * - Video preview display
 * - Timeline seeking (mock/placeholder in Phase 3)
 * - Player integration
 * 
 * Security:
 * - Validates workspace ownership before URL generation
 - URL expires after R2_DOWNLOAD_URL_TTL_SECONDS (default: 1 hour)
 * - URL is cryptographically signed — cannot be forged
 * - Bucket remains private throughout
 * 
 * @param assetId - The database asset ID
 * @param workspaceId - The workspace identifier (for authorization)
 * @param expiresInSeconds - Optional TTL override (defaults to config value)
 * @returns AssetPreviewUrlOutput with presigned URL and metadata
 * 
 * Throws on authorization failure.
 */
export async function getAssetPreviewUrl(
  assetId: string,
  workspaceId: string,
  expiresInSeconds?: number
): Promise<AssetPreviewUrlOutput> {
  // ---- Step 1: Ownership Validation ----
  import { PrismaClient } from "@prisma/client";
  const prisma = new PrismaClient();
  
  const asset = await prisma.videoAsset.findFirst({
    where: {
      id: assetId,
      workspaceId: workspaceId,
    },
  });
  
  if (!asset) {
    throw new Error(
      `Asset "${assetId}" not found in workspace "${workspaceId}". ` +
      "Unauthorized access attempted."
    );
  }
  
  // ---- Step 2: Generate Presigned URL ----
  const url = await generateR2PresignedPreviewUrl(
    workspaceId,
    asset.id,
    expiresInSeconds
  );
  
  const expiresAt = Date.now() / 1000 + (expiresInSeconds || R2_DOWNLOAD_URL_TTL_SECONDS);
  
  return {
    previewUrl: url,
    expiresAt: Math.floor(expiresAt),
    assetId: asset.id,
    storageKey: asset.storageKey,
  };
}

// ==========================================================//
// RETRY LOGIC
// ============================================================

/**
 * Re-process a video asset that previously failed or was cancelled.
 * 
 * Responsibilities:
 * ✅ Verify asset ownership
 * ✅ Verify retry eligibility (asset not currently processing)
 * ✅ Prevent duplicate active jobs
 * ✅ Create or requeue a valid processing job
 * 
 * @param assetId - The database asset ID
 * @param workspaceId - The workspace identifier (for authorization)
 * @returns Retry result with job information
 * 
 * Throws on authorization failure or invalid state.
 */
export async function retryProcessing(
  assetId: string,
  workspaceId: string
): Promise<{
  assetId: string;
  workspaceId: string;
  jobId: string;
  jobType: string;
  status: string;
}> {
  import { PrismaClient } from "@prisma/client";
  const prisma = new PrismaClient();
  
  // ---- Step 1: Ownership Validation ----
  const asset = await prisma.videoAsset.findFirst({
    where: {
      id: assetId,
      workspaceId: workspaceId,
    },
  });
  
  if (!asset) {
    throw new Error(
      `Asset "${assetId}" not found in workspace "${workspaceId}".`
    );
  }
  
  // ---- Step 2: Retry Eligibility Check ----
  // Prevent duplicate active jobs
  const existingActiveJob = await prisma.processingJob.findFirst({
    where: {
      videoAssetId: assetId,
      status: {
        in: ["QUEUED", "VALIDATING", "PROBING", "GENERATING_THUMBNAIL", "UPLOADING_THUMBNAIL"],
      },
    },
    orderBy: { createdAt: "desc" },
  });
  
  if (existingActiveJob) {
    throw new Error(
      `Asset "${assetId}" already has an active job (ID: ${existingActiveJob.id}) ` +
      `in status "${existingActiveJob.status}". ` +
      "Wait for completion or use a different retry strategy."
    );
  }
  
  // ---- Step 3: Create/Requeue Processing Job ----
  // Delete any completed/failed jobs older than a threshold to avoid clutter
  // (Simplified: we just create a new job; the worker handles idempotency)
  
  const jobType = "PROBING" as const; // Start from probing stage
  
  const newJob = await prisma.processingJob.create({
    data: {
      videoAssetId: assetId,
      workspaceId: workspaceId,
      jobType,
      status: "QUEUED" as const,
      progress: 0,
      currentStage: "INITIALIZED",
      attempts: 0, // Reset attempt counter for new job
    },
  });
  
  return {
    assetId: assetId,
    workspaceId: workspaceId,
    jobId: newJob.id,
    jobType: newJob.jobType,
    status: newJob.status,
  };
}

// Export all types and functions
export type {
  AssetPreviewUrlOutput,
  AssetThumbnailUrlOutput,
  AssetMetadataOutput,
};
export {
  getAssetMetadata,
  getAssetPreviewUrl,
  retryProcessing,
};