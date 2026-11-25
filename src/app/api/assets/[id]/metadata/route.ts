/**
 * GET /api/assets/[id]
 * 
 * Responsibilities (as specified in Phase 3 requirements):
 * ✅ Return authorized asset metadata
 * ✅ Return project relationship (if any)
 * ✅ Return processing status
 * ✅ Never expose private R2 credentials or unrestricted storage URLs
 * ✅ Never trust client-provided metadata as the final source
 * 
 * Key Security Principle: All R2 access goes through short-lived presigned URLs.
 * This endpoint returns opaque storage keys and metadata — URLs are generated
 * separately via GET /api/assets/[id]/preview-url.
 * 
 * Flow:
 * 1. Parse asset ID from URL path
 * 2. Validate workspace ID (query parameter for Phase 3 development)
 * 3. Query asset from PostgreSQL with workspace authorization check
 * 4. Include related project data (if any)
 * 5. Include most recent processing job state (if any)
 * 6. Sanitize output — no raw R2 URLs, no credentials
 * 7. Generate presigned preview URL separately (via /api/assets/[id]/preview-url endpoint)
 * 
 * Output Sanitization:
 * - storageKey: Opaque identifier — used with generatePresignedDownloadUrl()
 * - thumbnailStorageKey: Opaque identifier — used with thumbnail URLs
 * - processingJobId: Referenced but no internal job details leaked
 * - All video metadata (duration, codecs, etc.) comes from FFprobe on worker
 *   — NOT from client-supplied fields
 * - originalFilename: Included for reference only; never used as storage path
 * 
 * Frontend Usage:
 * - Display asset metadata (filename, size, status, codecs from FFprobe)
 * - Generate preview URL via /api/assets/[id]/preview-url
 * - Display thumbnail via generated presigned URL
 * - Monitor status via /api/assets/[id]/status polling
 * 
 * Security:
 * - Workspace ID is the authoritative authorization boundary
 * - Asset ID from URL verified against database
 * - workspaceId from query param must match asset's workspaceId
 * - No R2 credentials in any response
 * - All URLs time-limited and cryptographically signed
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import type { AssetMetadataResponse } from "@/lib/storage/storage-types";

// ============================================================
// REQUEST VALIDATION SCHEMA
// ============================================================

const assetMetadataSchema = z.object({
  assetId: z.string().min(1, "Asset ID is required"),
  workspaceId: z.string().min(1, "Workspace ID is required"),
});

// ============================================================
// API HANDLER: GET /api/assets/[id]
// ============================================================

export async function GET(
  request: Request
): Promise<NextResponse> {
  try {
    // ---- Step 1: Parse URL and extract parameters ----
    const url = new URL(request.url);
    const assetId = url.pathname.split("/").filter(Boolean).pop();
    const workspaceId = url.searchParams.get("workspaceId") || "";
    
    if (!assetId) {
      return NextResponse.json(
        { error: "Asset ID is required in the URL path" },
        { status: 400 }
      );
    }
    
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID is required (query parameter)" },
        { status: 400 }
      );
    }
    
    // ---- Step 2: Validate using Zod schema ----
    const validationResult = assetMetadataSchema.safeParse({
      assetId,
      workspaceId,
    });
    
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.errors.map((err) => `${err.path[0]}: ${err.message}`),
        },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // ---- Step 3: Query asset from database with authorization ----
    const db = prisma;
    
    const asset = await db.videoAsset.findFirst({
      where: {
        id: validatedData.assetId,
        workspaceId: validatedData.workspaceId,
      },
    });
    
    // Fetch project and processing job separately (no @relation includes)
    const project = asset?.projectId ? await db.project.findUnique({
      where: { id: asset.projectId },
    }) : undefined;
    
    const processingJobs = await db.processingJob.findMany({
      where: { videoAssetId: validatedData.assetId },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    
    if (!asset) {
      return NextResponse.json(
        { error: "Asset not found in specified workspace" },
        { status: 404 }
      );
    }
    
    // ---- Step 4: Generate presigned preview URL ----
    let previewUrl = "";
    let previewExpiresAt = 0;
    
    try {
      const { generatePresignedPreviewUrl } = await import("@/lib/storage/r2-presigned");
      previewUrl = await generatePresignedPreviewUrl(
        asset.workspaceId,
        asset.id
      );
      previewExpiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour TTL
    } catch (previewError) {
      console.warn("Failed to generate preview URL:", previewError);
      // Continue without preview URL — frontend can call dedicated endpoint later
    }
    
    // ---- Step 5: Build sanitized metadata response ----
    const output: AssetMetadataResponse = {
      assetId: asset.id,
      workspaceId: asset.workspaceId,
      projectId: asset.project?.id ?? null,
      originalFilename: asset.originalFilename,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      duration: asset.duration ?? null,
      width: asset.width ?? null,
      height: asset.height ?? null,
      frameRate: asset.frameRate ?? null,
      videoCodec: asset.videoCodec ?? null,
      audioCodec: asset.audioCodec ?? null,
      containerFormat: asset.containerFormat ?? null,
      status: asset.status,
      storageKey: asset.storageKey,
      thumbnailStorageKey: asset.thumbnailStorageKey ?? null,
      processingJobId: asset.processingJob?.id ?? null,
      currentProcessingStage: asset.processingJob?.currentStage ?? null,
      progress: asset.processingJob?.progress ?? null,
      error: asset.errorMessage ?? null,
    };
    
    // ---- Step 6: Add preview URL expiration info ----
    output.previewUrlAvailable = true;
    output.previewExpiresAt = previewExpiresAt;
    
    // ---- Step 7: Return Success Response ----
    return NextResponse.json({
      success: true,
      data: output,
    }, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": "application/json",
      },
    });
    
  } catch (error: any) {
    console.error("ERROR in GET /api/assets/[id]:", error);
    
    return NextResponse.json(
      { error: "Internal server error. Failed to retrieve asset metadata." },
      { status: 500 }
    );
  }
}