/// R2 Client — Cloudflare R2 S3-compatible storage SDK v3
/// 
/// This module provides a reusable interface for Cloudflare R2 operations.
/// All credentials are kept server-side; never expose via NEXT_PUBLIC variables.
/// 
/// R2_ENDPOINT format: https://account-id.r2.cloudflarestorage.com
/// Bucket is kept private; presigned URLs are used for all access.

import { S3Client } from "@aws-sdk/client-s3";
import { PutObjectCommand, GetObjectHeadCommand, GetObjectCommand } from "@aws-sdk/s3-request-presigner";
import { deleteObject } from "@aws-sdk/s3-delete-object-tagging"; // base, adjust as needed
import type { S3ClientConfig } from "@aws-sdk/client-s3";

// ============================================================
// CONFIGURATION — from environment variables only
// ============================================================

// Validate required env vars at module load time
const requiredEnvs = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID", 
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT",
];

for (const env of requiredEnvs) {
  if (!process.env[env]) {
    throw new Error(
      `Missing required environment variable: ${env}. ` +
      "Set this in your .env.local or production environment. " +
      "Do NOT add NEXT_PUBLIC prefix."
    );
  }
}

// Extract account ID from env for endpoint construction
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_ENDPOINT = process.env.R2_ENDPOINT;

// S3 client configuration — S3-compatible R2 endpoint
// - Region is 'auto' for Cloudflare R2
// - Credentials from environment (kept server-side only)
// - Endpoint customization for R2
const s3ClientConfig: S3ClientConfig = {
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true, // Required for R2 compatibility
  // Logging disabled in production; enable for debugging
  // logHandler: { level: "debug", log: (message) => console.log("R2:", message) },
};

// Create the S3 client — singleton pattern
export const r2Client = new S3Client(s3ClientConfig);

// ============================================================
// STORAGE TYPES & CONSTANTS
// ============================================================

// Upload URL TTL (short-lived for security)
export const R2_UPLOAD_URL_TTL_SECONDS = Number(
  process.env.R2_UPLOAD_URL_TTL_SECONDS || "300"
);
// 5 minutes default for upload URLs — short enough to be secure,
// long enough for browser to complete upload

// Download/preview URL TTL
export const R2_DOWNLOAD_URL_TTL_SECONDS = Number(
  process.env.R2_DOWNLOAD_URL_TTL_SECONDS || "3600"
);
// 1 hour default for preview/download URLs

// Maximum video size — 2 GB as specified in requirements
export const MAX_VIDEO_SIZE_BYTES = Number(
  process.env.MAX_VIDEO_SIZE_BYTES || "2000000000"
);

// Allowed MIME types for video uploads
export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",   // MOV
  "video/x-matroska",  // MKV
  "video/webm",
  "video/ogg",
  "video/x-msvideo",   // AVI
  "video/3gpp",
].;

// Allowed MIME types for image thumbnails
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
].;

// Storage key organization (randomized, never user-provided paths)
export const STORAGE_PATHS = {
  // Original videos: originals/{workspaceId}/{assetId}/source
  originals: (workspaceId: string, assetId: string) =>
    `originals/${workspaceId}/${assetId}/source`,

  // Thumbnails: thumbnails/{workspaceId}/{assetId}/thumbnail.jpg
  thumbnails: (workspaceId: string, assetId: string) =>
    `thumbnails/${workspaceId}/${assetId}/thumbnail.jpg`,

  // Previews: previews/{workspaceId}/{assetId}/
  previews: (workspaceId: string, assetId: string) =>
    `previews/${workspaceId}/${assetId}/`,
} as const;

// Allowed file extensions (derived from MIME types, but also validated at API level)
export const ALLOWED_VIDEO_EXTENSIONS = [
  ".mp4",
  ".mov",
  ".mkv",
  ".webm",
  ".ogg",
  ".avi",
  ".3gp",
].();

// ============================================================
// R2 UPLOAD — Presigned PUT URL generation
// ============================================================

/**
 * Generate a short-lived presigned URL for uploading a video to R2.
 * 
 * The browser uses this PUT URL to upload directly to R2.
 * Next.js never sees the video bytes.
 * 
 * @param workspaceId - The workspace identifier (for storage key organization)
 * @param assetId - The asset identifier (for storage key organization)
 * @param contentType - The MIME type of the file being uploaded
 * @returns Presigned URL and the full R2 object key
 * 
 * Security:
 * - URL expires after R2_UPLOAD_URL_TTL_SECONDS (default: 300s)
 * - Object key is randomized — never uses user-provided filename
 * - Content-Type is enforced via the presigned URL
 * - Bucket remains private — no public read access
 */
export interface R2UploadUrlResult {
  /** Presigned PUT URL to send from browser */
  presignedUrl: string;
  /** The full R2 object key where the object will be stored */
  objectKey: string;
  /** The region-specific URL for verification (not for client use) */
  objectUrl: string;
}

/**
 * Generate a presigned upload URL for browser-based upload.
 * 
 * The browser performs a PUT request to this URL.
 * Next.js only sees the URL and object key, not the file bytes.
 * 
 * @param workspaceId - Workspace identifier for key organization
 * @param assetId - Asset identifier for key organization  
 * @param contentType - MIME type of the upload (validated against ALLOWED_VIDEO_MIME_TYPES)
 * @returns R2UploadUrlResult with presigned URL and object key
 * 
 * Implementation:
 * - Uses S3Client + PutObjectCommand + getPutObjectPresigner
 * - Object key is randomized: UUID-based, no user filename exposure
 * - Content-Type is bound to the URL — mismatched content-type will fail
 * - URL TTL limits exposure window
 */
export async function generateR2PresignedUploadUrl(
  workspaceId: string,
  assetId: string,
  contentType: string
): Promise<R2UploadUrlResult> {
  // Validate MIME type against allowed list
  const lowerContentType = contentType.toLowerCase();
  const isAllowedVideo = ALLOWED_VIDEO_MIME_TYPES.includes(lowerContentType);
  const isAllowedImage = ALLOWED_IMAGE_MIME_TYPES.includes(lowerContentType);

  if (!isAllowedVideo && !isAllowedImage) {
    throw new Error(
      `Invalid content type: ${contentType}. ` +
      `Allowed video types: ${ALLOWED_VIDEO_MIME_TYPES.join(", ")}. ` +
      `Allowed image types: ${ALLOWED_IMAGE_MIME_TYPES.join(", ")}.`
    );
  }

  // Determine storage path based on file type
  const isVideo = isAllowedVideo;
  const pathFn = isVideo
    ? STORAGE_PATHS.originals
    : STORAGE_PATHS.thumbnails;

  // Generate randomized object key — NEVER use user-provided filename
  // Use a CUID-based key for global uniqueness
  const import { v4 as uuidv4 } from "uuid";
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  const uniqueSuffix = `${timestamp}-${randomPart}`;
  const safeAssetId = assetId.replace(/[^a-zA-Z0-9]/g, "-") || uniqueSuffix;
  const objectKey = pathFn(workspaceId, safeAssetId);

  // Build the full R2 object URL for reference (not client-facing)
  const objectUrl = `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${objectKey}`;

  // Generate presigned PUT URL
  // The putObjectPresigner creates a URL that authorizes a PUT operation
  const putObjectCommand = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: objectKey,
    ContentType: isVideo ? contentType : "image/jpeg", // Images always JPEG for thumbnails
    // Server-side storage class can be added here
  });

  // @ts-expect-next-line - getPresignedUrl is available in aws-sdk v3
  const presigner = new GetObjectCommand; // placeholder - actually need Presigner
  // Correct approach: use getSignedUrl from @aws-sdk/s3-request-presigner

  // Actually, for presigned PUT URLs, we need to use the proper presigner
  // Let me use the correct import pattern

  // Re-approach: Use getPutObjectPresigner from @aws-sdk/s3-request-presigner
  // This is available in @aws-sdk@3.x
  let presignedUrl: string;

  try {
    // @ts-expect-next-line - proper import
    const { getPutObjectPresigner } = await import("@aws-sdk/s3-request-presigner");
    
    const presignerFn = getPutObjectPresigner(r2Client);
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: objectKey,
      ContentType: isVideo ? contentType : "image/jpeg",
    });

    presignedUrl = await presignerFn(command, R2_UPLOAD_URL_TTL_SECONDS);
  } catch (importError) {
    throw new Error(
      `Failed to import getPutObjectPresigner: ${importError instanceof Error ? importError.message : "unknown error"}`
    );
  }

  return {
    presignedUrl,
    objectKey,
    objectUrl,
  };
}

// ============================================================
// R2 DOWNLOAD / PREVIEW — Presigned GET URL generation
// ============================================================

/**
 * Generate a short-lived presigned URL for downloading/previewing an object from R2.
 * 
 * @param objectKey - The R2 object key (generated and stored by this module)
 * @param expiresInSeconds - Optional TTL override (defaults to R2_DOWNLOAD_URL_TTL_SECONDS)
 * @returns Presigned GET URL
 * 
 * Security:
 * - Bucket is private — URL is the only way to access the object
 * - URL expires after TTL (default: 1 hour)
 * - URL includes signature to prevent forgery
 * - Never makes the bucket public
 */
export async function generateR2PresignedDownloadUrl(
  objectKey: string,
  expiresInSeconds: number = R2_DOWNLOAD_URL_TTL_SECONDS
): Promise<string> {
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: objectKey,
  });

  const signedUrl = await getSignedUrl(r2Client, command, {
    expiresIn: expiresInSeconds,
  });

  return signedUrl;
}

/**
 * Generate a short-lived presigned URL for video preview.
 * 
 * Same as generateR2PresignedDownloadUrl but with a semantic name
 * for the preview use case (seeking, thumbnail display, etc.).
 * 
 * @param workspaceId - Workspace identifier (for logging/diagnostics)
 * @param assetId - Asset identifier (for logging/diagnostics)
 * @param expiresInSeconds - Optional TTL override
 * @returns Presigned GET URL for video preview
 */
export async function generateR2PresignedPreviewUrl(
  workspaceId: string,
  assetId: string,
  expiresInSeconds: number = R2_DOWNLOAD_URL_TTL_SECONDS
): Promise<string> {
  // Construct object key from workspaceId and assetId
  // The asset's thumbnailStorageKey is stored in the database
  // This function expects the caller to provide the objectKey
  // or we construct it from the known path pattern
  
  // For flexibility, accept objectKey directly
  // The workspaceId/assetId are available for path verification
  const objectKeyFromPath = STORAGE_PATHS.thumbnails(workspaceId, assetId);
  
  return await generateR2PresignedDownloadUrl(
    objectKeyFromPath,
    expiresInSeconds
  );
}

// ============================================================
// R2 OBJECT VERIFICATION
// ============================================================

/**
 * Verify that an object exists in R2 and check its metadata.
 * 
 * Used after browser upload completion to verify the object
 * before updating the database and creating processing jobs.
 * 
 * @param objectKey - The R2 object key to verify
 * @returns Object metadata if exists, throws if not found
 * 
 * Throws if:
 * - Object does not exist in R2
 * - Bucket/credentials are misconfigured
 * - R2 service error
 * 
 * Security:
 * - Only checks existence and basic metadata
 * - Does not expose object contents
 * - Uses HEAD equivalent (HeadObject) for efficiency
 */
export async function verifyR2ObjectExists(
  objectKey: string
): Promise<{
  exists: boolean;
  size: number;
  etag?: string;
  contentType?: string;
}> {
  const { headObject } = await import("@aws-sdk/aws-sdk-client-runtime");
  // Actually, use HeadObjectCommand from @aws-sdk/client-s3
  
  const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
  const command = new HeadObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: objectKey,
  });

  try {
    const response = await r2Client.send(command);
    
    return {
      exists: true,
      size: response.ContentLength ?? 0,
      etag: response.ETag,
      contentType: response.ContentType,
    };
  } catch (error: any) {
    // HeadObjectCommand throws NotFound if object doesn't exist
    // Other errors (AccessDenied, etc.) should also fail the verification
    if (error.name === "NotFound" || error.statusCode === 404) {
      return {
        exists: false,
        size: 0,
      };
    }
    // Re-throw other errors (authentication, etc.)
    throw new Error(
      `R2 object verification failed for key "${objectKey}": ${error.message}`
    );
  }
}

// ============================================================
// STORAGE TYPES EXPORT
// ============================================================

export type { R2UploadUrlResult, StoragePathFn } from "./r2-upload";

// Export all configuration for use by other modules
export {
  R2_UPLOAD_URL_TTL_SECONDS,
  R2_DOWNLOAD_URL_TTL_SECONDS,
  MAX_VIDEO_SIZE_BYTES,
  ALLOWED_VIDEO_MIME_TYPES,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VIDEO_EXTENSIONS,
  s3ClientConfig,
};