/// R2 Delete Module — Safe object deletion from Cloudflare R2
///
/// Handles deletion of video originals and generated thumbnails.
/// All operations require authorization validation.
/// Never allows deletion of objects without proper workspace verification.

import { r2Client } from "./r2-client";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import type { VideoAsset } from "@/prisma/client";
import { PrismaClient } from "@prisma/client";

// ============================================================
// DELETION TYPES
// ============================================================

/**
 * Output from a successful R2 deletion operation.
 */
export interface R2DeleteOutput {
  /** The object key that was deleted */
  deletedKey: string;
  /** Whether a thumbnail was also deleted */
  thumbnailDeleted?: boolean;
  /** Timestamp of deletion (ISO string) */
  deletedAt: string;
}

// ============================================================
// AUTHORIZED DELETION LOGIC
// ============================================================

/**
 * Delete a video asset's original from R2 and update database.
 * 
 * Responsibilities:
 * - Verify workspace ownership before deletion
 * - Delete the original video object from R2
 * - Delete the associated thumbnail from R2 (if it exists)
 * - Update asset status in PostgreSQL to DELETED/DELETING
 * - Handle gracefully if R2 object doesn't exist (already deleted)
 * 
 * Security:
 * - Validates workspaceId matches the asset's workspace
 * - Never accepts deletion request based solely on object key
 * - Returns success even if object already gone (idempotent)
 * - Cascading: both original and thumbnail cleaned up
 * 
 * @param assetId - The database asset ID
 * @param workspaceId - The workspace identifier (for authorization)
 * @returns R2DeleteOutput with deletion confirmation
 * 
 * Throws on authorization failure or unexpected R2 errors.
 */
export async function deleteAssetFromR2(
  assetId: string,
  workspaceId: string
): Promise<R2DeleteOutput> {
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
      `Asset "${assetId}" not found in workspace "${workspaceId}". ` +
      "Unauthorized deletion attempted."
    );
  }
  
  // Record the keys before deletion for output
  const originalKey = asset.storageKey;
  const thumbnailKey = asset.thumbnailStorageKey;
  
  // ---- Step 2: Delete Original from R2 ----
  try {
    const { deleteObject } = await import("@aws-sdk/s3-delete-object");
    const deleteCmd = new deleteObject({
      Bucket: "placeholder", // R2 client uses configured bucket
      Key: originalKey,
    });
    await r2Client.send(deleteCmd);
    const originalDeleted = true;
    
    // ---- Step 3: Delete Thumbnail from R2 (if it exists) ----
    let thumbnailDeleted = false;
    if (thumbnailKey) {
      try {
        const { deleteObject } = await import("@aws-sdk/s3-delete-object");
        const thumbDeleteCmd = new deleteObject({
          Bucket: "placeholder",
          Key: thumbnailKey,
        });
        await r2Client.send(thumbDeleteCmd);
        thumbnailDeleted = true;
      } catch (thumbError) {
        // Thumbnail may not exist — that's OK, continue
        console.warn(
          `Thumbnail deletion skipped for key "${thumbnailKey}": ${thumbError instanceof Error ? thumbError.message : "unknown error"}`
        );
      }
    }
    
    // ---- Step 4: Update Asset Status in PostgreSQL ----
    await prisma.videoAsset.update({
      where: { id: assetId },
      data: {
        status: "DELETING" as const,
        // Optionally clear storage keys after deletion
        storageKey: null,
        thumbnailStorageKey: null,
      },
    });
    
    // ---- Step 5: Return Output ----
    return {
      deletedKey: originalKey,
      thumbnailDeleted,
      deletedAt: new Date().toISOString(),
    };
    
  } catch (error: any) {
    // Handle specific R2 errors
    if (error.name === "NoSuchKey" || error.statusCode === 404) {
      // Object already deleted — still update DB status for consistency
      await prisma.videoAsset.update({
        where: { id: assetId },
        data: {
          status: "DELETED" as const,
          storageKey: null,
          thumbnailStorageKey: null,
        },
      });
      
      return {
        deletedKey: originalKey,
        thumbnailDeleted: false,
        deletedAt: new Date().toISOString(),
      };
    }
    
    throw new Error(
      `R2 deletion failed for key "${originalKey}": ${error.message}`
    );
  }
}

// ==========================================================//
// EXPORT
// ==========================================================//

export type { R2DeleteOutput };
export { deleteAssetFromR2 };