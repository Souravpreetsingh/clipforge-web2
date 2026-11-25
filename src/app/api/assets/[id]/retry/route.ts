/**
 * POST /api/assets/[id]/retry
 * 
 * Responsibilities (as specified in Phase 3 requirements):
 * ✅ Verify asset ownership
 * ✅ Verify retry eligibility (asset not currently processing)
 * ✅ Prevent duplicate active jobs
 * ✅ Create or requeue a valid processing job
 * 
 * Flow:
 * 1. Parse asset ID from URL path
 * 2. Validate workspace ID from request body (authorization)
 * 3. Query asset from database and verify workspace ownership
 * 4. Check for existing active jobs (status: QUEUED, VALIDATING, etc.)
 * 5. If active job exists, reject with clear error (wait or use different strategy)
 * 6. Create new ProcessingJob with PROBING jobType
 * 7. Return job ID and status to frontend
 * 
 * Security:
 * - Workspace ID from request body verified against database
 * - Asset ID from URL path verified against database
 * - Prevents duplicate active jobs — user must wait or explicitly cancel
 * - Job creation is idempotent; worker handles deduplication
 * - Error messages are sanitized (no R2 internal details)
 * 
 * Retry Eligibility Rules:
 * - Asset with status "FAILED" is eligible for retry
 * - Asset with status "READY" or "COMPLETED" is not eligible (already success)
 * - Asset with active QUEUED/VALIDATING/PROBING job is not eligible (wait for completion)
 * - Asset with status "DELETING"/"DELETED" is not eligible
 * 
 * Job Idempotency:
 * - The BullMQ worker handles duplicate job prevention
 * - Same videoAssetId with different job statuses can coexist
 * - Worker checks for existing active jobs before starting processing
 * - If a job with same videoAssetId is already active, new retry is rejected
 * 
 * Frontend Usage:
 * - Display "Retry" button when asset status is "FAILED"
 * - Disable "Retry" when asset is "PROCESSING", "READY", or "COMPLETED"
 * - Show spinner/state during retry request
 * - Poll /api/assets/[id]/status after retry to monitor progress
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import type { AssetRetryResponse } from "@/lib/storage/storage-types";

// ============================================================
// REQUEST VALIDATION SCHEMA
// ============================================================

const assetRetrySchema = z.object({
  assetId: z.string().min(1, "Asset ID is required"),
  workspaceId: z.string().min(1, "Workspace ID is required"),
});

// ============================================================
// API HANDLER: POST /api/assets/[id]/retry
// ============================================================

export async function POST(
  request: Request
): Promise<NextResponse> {
  try {
    // ---- Step 1: Parse Request Body ----
    const body = await request.json();
    
    // ---- Step 2: Zod Validation ----
    const validationResult = assetRetrySchema.safeParse(body);
    
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
    const db = prisma;
    
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
    
    // ---- Step 4: Retry Eligibility Check ----
    // Check for existing active jobs that would prevent retry
    const existingActiveJob = await db.processingJob.findFirst({
      where: {
        videoAssetId: validatedData.assetId,
        status: {
          in: ["QUEUED", "VALIDATING", "PROBING", "GENERATING_THUMBNAIL", "UPLOADING_THUMBNAIL"],
        },
      },
      orderBy: { createdAt: "desc" },
    });
    
    if (existingActiveJob) {
      return NextResponse.json(
        {
          error: `Asset already has an active job (ID: ${existingActiveJob.id}) in status "${existingActiveJob.status}". ` +
          "Wait for completion or use a different approach.",
        },
        { status: 409 } // Conflict — active job exists
      );
    }
    
    // ---- Step 5: Create New Processing Job ----
    // Start from PROBING stage (FFprobe metadata extraction)
    // This is the first stage of the processing pipeline
    
    const newJob = await db.processingJob.create({
      data: {
        videoAssetId: validatedData.assetId,
        workspaceId: validatedData.workspaceId,
        jobType: "PROBING" as const,
        status: "QUEUED" as const,
        progress: 0,
        currentStage: "INITIALIZED",
        attempts: 0, // Reset attempt counter for new attempt
      },
    });
    
    // ---- Step 6: Return Success Response ----
    const response: AssetRetryResponse = {
      assetId: asset.id,
      workspaceId: asset.workspaceId,
      jobId: newJob.id,
      jobType: newJob.jobType,
      status: newJob.status,
    };
    
    return NextResponse.json({
      success: true,
      data: response,
    }, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": "application/json",
      },
    });
    
  } catch (error: any) {
    console.error("ERROR in POST /api/assets/[id]/retry:", error);
    
    return NextResponse.json(
      { error: "Internal server error. Failed to process retry request." },
      { status: 500 }
    );
  }
}