/// R2 Presigned URLs Module — Short-lived signed URL generation
///
/// Centralized presigned URL generation for all R2 operations.
/// Provides a single source of truth for URL TTL, endpoint configuration,
/// and signatory patterns. All URLs are server-side generated; never client-generated.

import { r2Client } from "./r2-client";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl, getPutObjectPresigner } from "@aws-sdk/s3-request-presigner";
import type { S3Client } from "@aws-sdk/client-s3";

// ============================================================
// CONFIGURATION & CONSTANTS
// ============================================================

// URL TTL values — sourced from environment (with defaults)
export const R2_UPLOAD_URL_TTL = Number(
  process.env.R2_UPLOAD_URL_TTL_SECONDS || "300"
);
// 5 minutes for upload URLs — limits exposure window

export const R2_DOWNLOAD_URL_TTL = Number(
  process.env.R2_DOWNLOAD_URL_TTL_SECONDS || "3600"
);
// 1 hour for download/preview URLs

// Bucket name — from environment
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

/**
 * Validate that required R2 configuration is present.
 * Called at module import time.
 */
function validateR2Config(): void {
  if (!R2_BUCKET_NAME) {
    throw new Error(
      "R2_BUCKET_NAME environment variable is not set. " +
      "Configure .env.local with R2_BUCKET_NAME=your-bucket-name"
    );
  }
}

// Validate on import
validateR2Config();

// ============================================================
// PREIGNED GET URL — Download/Preview
// ============================================================

/**
 * Generate a presigned GET URL for downloading or previewing an R2 object.
 * 
 * @param bucketName - R2 bucket name (uses configured default if omitted)
 * @param key - The R2 object key (opaque, randomized identifier)
 * @param expiresInSeconds - Optional TTL override (defaults to R2_DOWNLOAD_URL_TTL)
 * @returns Presigned URL string
 * 
 * Security:
 * - Bucket is never exposed as public
 * - URL includes AWS signature for authenticity
 * - URL expires after TTL, preventing long-term unauthorized access
 * - Must be used in conjunction with workspace authorization (separate from URL)
 */
export async function generatePresignedDownloadUrl(
  key: string,
  expiresInSeconds: number = R2_DOWNLOAD_URL_TTL
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });

  const signedUrl = await getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });

  return signedUrl;
}

/**
 * Generate a presigned preview URL for a video asset.
 * 
 * Convenience wrapper that constructs the appropriate object key
 * from workspace and asset identifiers, then generates the URL.
 * 
 * @param workspaceId - Workspace identifier (for key construction)
 * @param assetId - Asset identifier (for key construction)
 * @param expiresInSeconds - Optional TTL override
 * @returns Presigned URL string for video preview
 */
export async function generatePresignedPreviewUrl(
  workspaceId: string,
  assetId: string,
  expiresInSeconds: number = R2_DOWNLOAD_URL_TTL
): Promise<string> {
  // Construct the thumbnail key following the organizational pattern
  // thumbnails/{workspaceId}/{assetId}/thumbnail.jpg
  const import { v4 as uuidv4 } = "uuid";
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const cleanAssetId = assetId.replace(/[^a-zA-Z0-9]/g, "") || uuidv4().toString().replace(/-/g, "").substring(0, 12);
  const key = `thumbnails/${workspaceId}/${cleanAssetId}/thumbnail.jpg`;
  
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });

  const signedUrl = await getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });

  return signedUrl;
}

// ============================================================
// PREIGNED PUT URL — Upload
// ============================================================

/**
 * Generate a presigned PUT URL for uploading an object to R2.
 * 
 * This is the primary upload method: browser PUTs directly to R2,
 * Next.js never handles video bytes.
 * 
 * @param key - The R2 object key where the object will be stored
 * @param contentType - The MIME type of the uploading file
 * @param expiresInSeconds - Optional TTL override (defaults to R2_UPLOAD_URL_TTL)
 * @returns Presigned PUT URL string
 * 
 * Security & Design:
 * - Content-Type is bound to the URL — mismatched content type will fail upload
 * - URL expires after R2_UPLOAD_URL_TTL_SECONDS (default: 300s)
 * - Bucket remains private — no public read access
 * - Object key is opaque and randomized (set by caller, not user-supplied)
 * - Idempotent: same key + same URL re-uploads overwrites previous object
 * - Used by: initiateUpload() in r2-upload.ts
 */
export async function generatePresignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds: number = R2_UPLOAD_URL_TTL
): Promise<string> {
  // Validate content type is an allowed video type
  const lowerContentType = contentType.toLowerCase();
  const allowedVideo = [
    "video/mp4",
    "video/quicktime",
    "video/x-matroska",
    "video/webm",
    "video/ogg",
    "video/x-msvideo",
    "video/3gpp",
  ].includes(lowerContentType);
  
  const allowedImage = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ].includes(lowerContentType);
  
  if (!allowedVideo && !allowedImage) {
    throw new Error(
      `Invalid content type: ${contentType}. ` +
      `Allowed video: ${["video/mp4", "video/quicktime", "video/webm"].join(", ")}. ` +
      `Allowed image: ${["image/jpeg", "image/png"].join(", ")}.`
    );
  }
  
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const presignedUrl = await getPutObjectPresigner(r2Client)(command, expiresInSeconds);

  return presignedUrl;
}

// ==========================================================//
// EXPORT ALL TYPE-DEFINE CONSTANTS
// ==========================================================//

// Re-export TTL constants for use by other modules
export {
  R2_UPLOAD_URL_TTL,
  R2_DOWNLOAD_URL_TTL,
};