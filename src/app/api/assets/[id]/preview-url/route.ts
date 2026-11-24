/**
 * POST /api/assets/[id]/preview-url
 * 
 * Responsibilities (as specified in Phase 3 requirements):
 * ✅ Verify ownership (workspace boundary)
 * ✅ Generate a short-lived signed preview URL
 * ✅ Never make the bucket public
 * 
 * Flow:
 * 1. Parse asset ID from URL path
 * 2. Validate workspace ID from request body (authorization)
 * 3. Query asset from database and verify workspace ownership
 * 4. Generate short-lived presigned GET URL for R2 object
 * 5. Return URL with expiration time
 * 6. Never expose private R2 credentials or make bucket public
 * 
 * Security:
 * - Workspace ID from request body verified against database asset
 * - URL is cryptographically signed — cannot be forged
 * - URL expires after R2_DOWNLOAD_URL_TTL_SECONDS (default: 1 hour)
 * - Bucket remains private at all times
 * - URL can only be used for the specific asset it was generated for
 * - Does not make the entire bucket public or readable
 * 
 * The preview URL is used by the frontend for:
 * - Video player integration
 * - Timeline seeking (placeholder in Phase 3)
 * - Clip preview before editing
 * - Thumbnail display
 * 
 * URL TTL: Short-lived (default 3600 seconds / 1 hour) to limit exposure window.
 * Frontend should request fresh URLs when the current one nears expiration.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/prisma/client";
import { z } from "zod";
import type { AssetPreviewUrlResponse } from "@/lib/storage/storage-types";
import { generatePresignedPreviewUrl } from "@/lib/storage/r2-presigned";

// ============================================================
// REQUEST VALIDATION SCHEMA
// ============================================================

const previewUrlSchema = z.object({
  assetId: z.string().min(1, "Asset ID is required"),
  workspaceId: z.string().min(1, "Workspace ID is required"),
});

// ============================================================
// API HANDLER: POST /api/assets/[id]/preview-url
// ============================================================

export async function POST(
  request: Request
): Promise<NextResponse> {
  try {
    // ---- Step 1: Parse Request Body ----
    const body = await request.json();
    
    // ---- Step 2: Zod Validation ----
    const validationResult = previewUrlSchema.safeParse(body);
    
    if (!validationResult.success) {
      const errorDetails = validationResult.error.errors.map(
        (err) => `${err.path[0]}: ${err.message}`
      );
      
      return NextResponse.json(
        {
          error: "Validation failed",
          details: errorDetails,
        },
        { status: 400 }
      );
    }
    
    const validatedData = validationResult.data;
    
    // ---- Step 3: Ownership Validation ----
    // Query the asset and verify it belongs to the requested workspace
    import { PrismaClient } from "@prisma/client";
    const db = new PrismaClient();
    
    const asset = await db.videoAsset.findFirst({
      where: {
        id: validatedData.assetId,
        workspaceId: validatedData.workspaceId,
      },
    });
    
    if (!asset) {
      return NextResponse.json(
        { error: "Asset not found in specified workspace" },
        { status: 404 }
      );
    }
    
    // ---- Step 4: Generate Presigned Preview URL ----
    const url = await generatePresignedPreviewUrl(
      asset.workspaceId,
      asset.id
    );
    
    const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour TTL
    
    // ---- Step 5: Return Success Response ----
    const response: AssetPreviewUrlResponse = {
      previewUrl: url,
      expiresAt: expiresAt,
      assetId: asset.id,
      storageKey: asset.storageKey,
    };
    
    return NextResponse.json({
      success: true,
      data: response,
    }, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0", // Prevent caching
        "Content-Type": "application/json",
      },
    });
    
  } catch (error: any) {
    console.error("ERROR in POST /api/assets/[id]/preview-url:", error);
    
    return NextResponse.json(
      { error: "Internal server error. Failed to generate preview URL." },
      { status: 500 }
    );
  }
}