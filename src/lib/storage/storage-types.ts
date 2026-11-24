/// R2 Storage Types — Shared type definitions for the storage module
///
/// This file centralizes all type definitions used across the
/// Cloudflare R2 storage module, ensuring consistent type safety
/// across client upload, download, deletion, and verification operations.

import type { R2UploadUrlResult } from "./r2-client";

// ============================================================
// CORE TYPE DEFINITIONS
// ============================================================

/**
 * Represents a complete R2 upload workflow result.
 * 
 * Used by:
 * - API route handlers (POST /api/uploads/initiate)
 * - Frontend upload component (display progress, complete upload)
 * - Storage module internal functions
 */
export interface R2UploadWorkflow {
  /** Database asset ID (primary key) */
  assetId: string;
  /** Randomized R2 storage key (opaque identifier) */
  storageKey: string;
  /** Presigned PUT URL for browser-based upload */
  presignedUrl: string;
  /** The R2 object key (matches storageKey structure) */
  objectKey: string;
  /** Original filename as provided by user (for reference only) */
  originalFilename: string;
  /** MIME type of the uploaded file */
  mimeType: string;
  /** File size in bytes (as verified by R2 HEAD object) */
  fileSize: number;
  /** Upload status progression */
  status: "INITIATED" | "UPLOADING" | "VERIFIED" | "UPLOADED" | "FAILED";
  /** Optional error message if status is FAILED */
  error?: string | null;
}

/**
 * Represents a presigned download/preview URL result.
 * 
 * Used by:
 * - GET /api/assets/[id]/preview-url API endpoint
 * - Frontend video player integration
 * - Thumbnail display in UI
 */
export interface R2PresignedUrlResult {
  /** The presigned URL string */
  url: string;
  /** URL expiration timestamp (Unix seconds) */
  expiresAt: number;
  /** Associated asset ID for reference */
  assetId: string;
  /** Associated storage key for reference */
  storageKey: string;
  /** URL type: "upload" | "download" | "preview" */
  urlType: "upload" | "download" | "preview";
  /** Optional: thumbnail-specific metadata */
  thumbnail?: {
    /** Original video asset ID */
    assetId: string;
    /** Whether thumbnail has been generated */
    generated: boolean;
  };
}

/**
 * Represents R2 object verification result.
 * 
 * Used after browser upload completion to verify object existence
 * and metadata before updating database status.
 */
export interface R2ObjectVerification {
  /** Whether the object exists in R2 */
  exists: boolean;
  /** Actual file size in bytes (from R2 HEAD request) */
  size: number;
  /** ETag of the object (if available) */
  etag?: string | null;
  /** Content-Type of the object (if available) */
  contentType?: string | null;
  /** Optional: video metadata if already probed */
  videoMetadata?: {
    duration: number | null;
    width: number | null;
    height: number | null;
    frameRate: number | null;
    videoCodec: string | null;
    audioCodec: string | null;
    containerFormat: string | null;
  } | null;
}

/**
 * Represents a complete asset metadata response.
 * 
 * Returned by GET /api/assets/[id] — never exposes private R2 credentials
 * or unrestricted storage URLs. All R2 access goes through presigned URLs.
 */
export interface AssetMetadataResponse {
  /** Database-generated asset ID */
  assetId: string;
  /** Workspace identifier (authorization boundary) */
  workspaceId: string;
  /** Project ID (nullable if workspace-level asset, set in Phase 4+) */
  projectId?: string | null;
  /** Original filename as provided by the user */
  originalFilename: string;
  /** MIME type as reported by client / validated */
  mimeType: string;
  /** Actual file size in bytes (from R2 verification) */
  fileSize: number;
  /** Video duration in seconds from FFprobe (null if not yet probed) */
  duration: number | null;
  /** Video width in pixels from FFprobe (null if not yet probed) */
  width: number | null;
  /** Video height in pixels from FFprobe (null if not yet probed) */
  height: number | null;
  /** Frame rate in fps from FFprobe (null if not yet probed) */
  frameRate: number | null;
  /** Video codec string from FFprobe (null if not yet probed) */
  videoCodec: string | null;
  /** Audio codec string from FFprobe (null if not yet probed) */
  audioCodec: string | null;
  /** Container format from FFprobe (null if not yet probed) */
  containerFormat: string | null;
  /** Current asset status */
  status: "UPLOADING" | "UPLOADED" | "PROCESSING" | "READY" | "FAILED" | "DELETING" | "DELETED";
  /** R2 storage key (opaque identifier; used with presigned URLs) */
  storageKey: string;
  /** Generated thumbnail storage key (null if not yet generated) */
  thumbnailStorageKey: string | null;
  /** Processing job ID if a job is queued (null otherwise) */
  processingJobId: string | null;
  /** Current processing stage (e.g., "PROBING", "GENERATING_THUMBNAIL") */
  currentProcessingStage: string | null;
  /** Progress percentage 0-100 (if job exists) */
  progress: number | null;
  /** Error message if status is FAILED (null otherwise) */
  error: string | null;
}

/**
 * Represents a processing job state for frontend display.
 * 
 * Used by GET /api/uploads/[id]/status and processing screen components.
 */
export interface ProcessingJobState {
  /** Job ID (also the BullMQ queue job identifier) */
  jobId: string;
  /** Job type (e.g., "PROBING", "GENERATING_THUMBNAIL") */
  jobType: string;
  /** Current job status */
  status: "QUEUED" | "VALIDATING" | "PROBING" | "GENERATING_THUMBNAIL" | "UPLOADING_THUMBNAIL" | "COMPLETED" | "FAILED" | "CANCELLED";
  /** Progress percentage 0-100 */
  progress: number;
  /** Current processing stage description */
  currentStage: string;
  /** Number of retry attempts (bounded) */
  attempts: number;
  /** Error code if job failed (nullable) */
  errorCode?: string | null;
  /** Human-readable error message if job failed */
  errorMessage?: string | null;
  /** When the job started (Unix timestamp) */
  startedAt: number | null;
  /** When the job completed (Unix timestamp, null if not completed) */
  completedAt: number | null;
  /** When the job was created (Unix timestamp) */
  createdAt: number;
}

/**
 * Represents a video asset state for dashboard/frontend display.
 * 
 * Used by GET /api/assets/[id] and clip library components.
 */
export interface AssetState {
  /** Asset database ID */
  assetId: string;
  /** Workspace identifier */
  workspaceId: string;
  /** Project ID (nullable) */
  projectId: string | null;
  /** Original filename */
  originalFilename: string;
  /** Current status */
  status: "UPLOADING" | "UPLOADED" | "PROCESSING" | "READY" | "FAILED" | "DELETING" | "DELETED";
  /** Video metadata from FFprobe */
  duration: number | null;
  /** Video width in pixels */
  width: number | null;
  /** Video height in pixels */
  height: number | null;
  /** Frame rate in fps */
  frameRate: number | null;
  /** Video codec */
  videoCodec: string | null;
  /** Audio codec */
  audioCodec: string | null;
  /** Container format */
  containerFormat: string | null;
  /** R2 storage key */
  storageKey: string;
  /** Thumbnail storage key (null if not yet generated) */
  thumbnailStorageKey: string | null;
  /** Processing job ID (nullable) */
  processingJobId: string | null;
  /** Processing progress (0-100, null if no active job) */
  progress: number | null;
  /** Current processing stage (null if no active job) */
  currentStage: string | null;
}

/**
 * Upload initiation request schema (Zod-validated input).
 * 
 * Used by POST /api/uploads/initiate — all inputs validated server-side.
 */
export interface UploadInitiateRequest {
  /** User-provided original filename (e.g., "my-video.mp4") */
  originalFilename: string;
  /** MIME type as provided by client (e.g., "video/mp4") */
  mimeType: string;
  /** File size in bytes as reported by client */
  fileSize: number;
  /** Optional target project ID (null for workspace-level asset) */
  projectId?: string | null;
  /** Workspace ID for authorization and storage key organization */
  workspaceId: string;
}

/**
 * Upload initiation response schema.
 * 
 * Returned by POST /api/uploads/initiate after successful VideoAsset creation
 * and presigned URL generation.
 */
export interface UploadInitiateResponse {
  /** Database-generated asset ID */
  assetId: string;
  /** Randomized R2 storage key */
  storageKey: string;
  /** Presigned upload URL for browser to use */
  presignedUrl: string;
  /** R2 object key for reference */
  objectKey: string;
  /** Upload metadata available after FFprobe */
  availableMetadata: {
    mimeType: string;
    fileSize: number;
    contentType: string;
  };
  /** Upload form fields/headers needed by browser */
  uploadHeaders: {
    contentType: string;
  };
}

/**
 * Upload completion verification request.
 * 
 * Sent to POST /api/uploads/complete after browser finishes upload.
 */
export interface UploadCompleteRequest {
  /** The database asset ID */
  assetId: string;
  /** The workspace ID (for ownership verification) */
  workspaceId: string;
  /** File size reported by browser/client (for comparison with R2 actual) */
  reportedSize: number;
}

/**
 * Upload completion response.
 * 
 * Returned by POST /api/uploads/complete after R2 verification,
 * database update, and job enqueue.
 */
export interface UploadCompleteResponse {
  /** The asset ID */
  assetId: string;
  /** The workspace ID */
  workspaceId: string;
  /** Updated asset status */
  status: string;
  /** The BullMQ queue job ID (stable identifier) */
  jobId: string;
  /** The job type/phase */
  jobType: string;
}

/**
 * Status query request (query params for GET /api/uploads/[id]/status).
 * 
 * Minimal request — just asset ID in the URL path.
 */
export interface AssetStatusRequest {
  /** Asset ID (from URL path) */
  assetId: string;
}

/**
 * Status query response.
 * 
 * Returned by GET /api/uploads/[id]/status with real database status.
 */
export interface AssetStatusResponse {
  /** The asset ID */
  assetId: string;
  /** The workspace ID */
  workspaceId: string;
  /** Current database status */
  status: string;
  /** Progress percentage 0-100 */
  progress: number;
  /** Current processing stage */
  currentStage: string;
  /** Error code if failed (nullable) */
  errorCode?: string | null;
  /** Human-readable error message if failed (nullable) */
  errorMessage?: string | null;
  /** When the job started (Unix timestamp, null if not started) */
  startedAt: number | null;
  /** When the job completed (Unix timestamp, null if not completed) */
  completedAt: number | null;
}

/**
 * Retry request for asset processing.
 * 
 * Sent to POST /api/assets/[id]/retry when user wants to re-process a failed/finished asset.
 */
export interface AssetRetryRequest {
  /** The asset ID */
  assetId: string;
  /** The workspace ID (for ownership verification) */
  workspaceId: string;
}

/**
 * Retry response.
 * 
 * Returned by POST /api/assets/[id]/retry after job re-queue.
 */
export interface AssetRetryResponse {
  /** The asset ID */
  assetId: string;
  /** The workspace ID */
  workspaceId: string;
  /** The new/reequeued job ID */
  jobId: string;
  /** The job type */
  jobType: string;
  /** Initial status */
  status: string;
}

/**
 * Preview URL request.
 * 
 * Sent to POST /api/assets/[id]/preview-url.
 */
export interface AssetPreviewUrlRequest {
  /** The asset ID (from URL path) */
  assetId: string;
  /** The workspace ID (for authorization) */
  workspaceId: string;
  /** Optional TTL override in seconds */
  expiresInSeconds?: number;
}

/**
 * Preview URL response.
 * 
 * Returned by POST /api/assets/[id]/preview-url with short-lived signed URL.
 */
export interface AssetPreviewUrlResponse {
  /** The presigned GET URL for video preview */
  previewUrl: string;
  /** URL expiration time (Unix timestamp in seconds) */
  expiresAt: number;
  /** The asset ID */
  assetId: string;
  /** The storage key */
  storageKey: string;
}

/**
 * Re-export R2UploadUrlResult from r2-client for convenience.
 * 
 * Used by API handlers and types that need the full upload URL result.
 */
export type { R2UploadUrlResult };

// ============================================================
// ENUM DEFINITIONS ( documented for reference )
// ============================================================

/**
 * Asset processing status states.
 * 
 * These enum values map to the ProcessingJob.status and VideoAsset.status fields.
 * Transitions are managed by the worker and API handlers.
 * 
 * Valid states:
 * - UPLOADING: Browser is uploading to R2 (not yet verified)
 * - UPLOADED: Object verified in R2, awaiting processing job enrollment
 * - PROCESSING: Worker is actively processing (FFprobe, FFmpeg)
 * - READY: Processing complete, asset ready for clip generation
 * - FAILED: Processing failed after max retries; can be retried by user
 * - DELETING: User/initiator requested deletion (in progress)
 * - DELETED: Deletion confirmed, asset removed from DB and R2
 * 
 * Job state values (ProcessingJob.jobType):
 * - PROBING: FFprobe extracting metadata
 * - GENERATING_THUMBNAIL: FFmpeg generating JPEG thumbnail
 * - UPLOADING_THUMBNAIL: Uploading generated thumbnail to R2
 * - VALIDATING: Pre-probe validation (input checks)
 * - QUEUED: Job waiting in BullMQ queue
 * - COMPLETED: All stages finished successfully
 * - FAILED: One or more stages failed after retries
 * - CANCELLED: Job cancelled (not yet implemented in Phase 3)
 * 
 * Job state values (ProcessingJob.status):
 * - QUEUED: Waiting in BullMQ queue
 * - VALIDATING: Input validation stage
 * - PROBING: FFprobe running
 * - GENERATING_THUMBNAIL: FFmpeg generating thumbnail
 * - UPLOADING_THUMBNAIL: Thumbnail uploading to R2
 * - COMPLETED: All stages done
 * - FAILED: Stage failed
 * - CANCELLED: Cancelled (Phase 4+)
 */

/**
 * R2 storage key path organization.
 * 
 * All storage keys follow this pattern — user-supplied filenames are NEVER used:
 * - Originals: originals/{workspaceId}/{assetId}/source
 * - Thumbnails: thumbnails/{workspaceId}/{assetId}/thumbnail.jpg
 * - Previews: previews/{workspaceId}/{assetId}/
 * 
 * The assetId here is the PostgreSQL-generated UUID, not user-supplied.
 * This provides both organization and security (randomized paths).
 */

/**
 * Content type allowlists (defined in r2-client.ts, referenced here).
 * 
 * Video MIME types allowed for upload:
 * - video/mp4
 * - video/quicktime (MOV)
 * - video/x-matroska (MKV)
 * - video/webm
 * - video/ogg
 * - video/x-msvideo (AVI)
 * - video/3gpp
 * 
 * Image MIME types allowed for thumbnails:
 * - image/jpeg
 * - image/png
 * - image/webp
 * - image/gif
 * 
 * All MIME types are validated both at the API route level
 * and in the browser before upload initiation.
 */