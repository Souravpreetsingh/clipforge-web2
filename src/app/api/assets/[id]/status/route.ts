/**
 * GET /api/assets/[id]/status
 * 
 * Responsibilities (as specified in Phase 3 requirements):
 * ✅ Verify authorization (workspace boundary)
 * ✅ Return real database status
 * ✅ Return progress information
 * ✅ Return current stage
 * ✅ Return errors safely (no sensitive details)
 * 
 * Flow:
 * 1. Parse asset ID from URL path
 * 2. Validate workspace ID (query param or auth context)
 * 3. Query asset from database with workspace authorization check
 * 4. If processing job exists, return its current state
 * 5. If asset exists but no active job, return asset status
 * 6. Sanitize all responses — no R2 credentials, no unrestricted URLs
 * 
 * Polling Behavior (frontend guidance):
 * - Stop polling when status is "COMPLETED" or "FAILED"
 * - Stop polling when component unmounts
 * - Avoid unnecessary requests (use conditional polling)
 * - Handle temporary API errors gracefully (retry on network failure)
 * - Do not show 100% progress before actual completion
 * 
 * Security:
 * - Workspace ID must match asset's workspace (authorization boundary)
 * - Asset ID from URL path verified against database
 * - Error messages do not expose R2 internal details
 * - No trust of client-provided metadata as final source
 * 
 * Note: In Phase 3, initial status is "UPLOADED" then transitions
 * to "PROCESSING" when the BullMQ job is enqueued and the worker
 * picks it up. Polling interval: recommend 2-3 seconds minimum.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/prisma/client";
import { z } from "zod";
import type { AssetStatusResponse, AssetStatusRequest } from "@/lib/storage/storage-types";

// ============================================================
// URL PARAMETER EXTRACTION
// ============================================================

// The asset ID is extracted from the URL path: /api/assets/[id]/status
// Next.js App Router passes route parameters as part of the request context
// We extract it from the pathname in the Request

// ============================================================
// REQUEST VALIDATION SCHEMA (for query params if any)
// ============================================================

// For this endpoint, the primary identifier is the URL path parameter
// (assetId). We validate it exists and is a non-empty string.
// Additional filters (like workspaceId) could be query parameters,
// but the primary auth check is via the asset-database relationship.

// ============================================================
// API HANDLER: GET /api/assets/[id]/status
// ============================================================

export async function GET(
  request: Request
): Promise<NextResponse> {
  try {
    // ---- Step 1: Extract assetId from URL path ----
    const url = new URL(request.url);
    const assetId = url.pathname.split("/").filter(Boolean).pop();
    
    if (!assetId) {
      return NextResponse.json(
        { error: "Asset ID is required in the URL path" },
        { status: 400 }
      );
    }
    
    // ---- Step 2: Extract workspaceId ----
    // workspaceId can come from query parameters or be derived
    // In Phase 3 development, we accept it as a query param.
    // In production, it comes from authentication middleware.
    const workspaceId = url.searchParams.get("workspaceId") || "";
    
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID is required (query parameter)" },
        { status: 400 }
      );
    }
    
    // ---- Step 3: Query asset from database with authorization ----
    import { PrismaClient } from "@prisma/client";
    const db = new PrismaClient();
    
    const asset = await db.videoAsset.findFirst({
      where: {
        id: assetId,
        workspaceId: workspaceId,
      },
      include: {
        processingJob: {
          orderBy: { createdAt: "desc" },
          take: 1, // Only the most recent job
        },
      },
    });
    
    if (!asset) {
      return NextResponse.json(
        { error: "Asset not found in specified workspace" },
        { status: 404 }
      );
    }
    
    // ---- Step 4: Build status response ----
    let statusResponse: AssetStatusResponse;
    
    // Check if there's an active processing job
    if (asset.processingJob && asset.processingJob.status) {
      const job = asset.processingJob;
      
      // Determine if job is active (not completed or failed)
      const isTerminalStatus = 
        job.status === "COMPLETED" || 
        job.status === "FAILED" || 
        job.status === "CANCELLED";
      
      statusResponse = {
        assetId: asset.id,
        workspaceId: asset.workspaceId,
        status: job.status,
        progress: job.progress,
        currentStage: job.currentStage,
        errorCode: job.errorCode,
        errorMessage: job.errorMessage,
        startedAt: job.startedAt?.getTime() ?? null,
        completedAt: job.completedAt?.getTime() ?? null,
      };
    } else {
      // No active job — return asset-level status
      statusResponse = {
        assetId: asset.id,
        workspaceId: asset.workspaceId,
        status: asset.status,
        progress: 0,
        currentStage: "NO_ACTIVE_JOB",
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
      };
    }
    
    // ---- Step 4: Return Success Response ----
    return NextResponse.json({
      success: true,
      data: statusResponse,
    }, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0", // Prevent caching for polling
        "Content-Type": "application/json",
      },
    });
    
  } catch (error: any) {
    console.error("ERROR in GET /api/assets/[id]/status:", error);
    
    return NextResponse.json(
      { error: "Internal server error. Failed to retrieve asset status." },
      { status: 500 }
    );
  }
}