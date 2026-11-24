/**
 * POST /api/uploads/complete
 * 
 * Responsibilities (as specified in Phase 3 requirements):
 * ✅ Validate asset ownership (workspace boundary)
 * ✅ Verify upload authorization
 * ✅ Verify object exists in R2
 * ✅ Verify uploaded size (actual vs reported, with tolerance)
 * ✅ Update asset status to UPLOADED
 * ✅ Create ProcessingJob record
 * ✅ Enqueue background processing (BullMQ)
 * ✅ Return actual job and asset identifiers
 * 
 * Flow:
 * 1. Parse and validate request body
 * 2. Query asset from database and verify workspace ownership
 * 3. Verify R2 object exists at the stored key
 * 4. Check actual object size vs reported size (tolerance allowed)
 * 5. Update asset status from UPLOADING to UPLOADED
 * 6. Update actual file size from R2 verification
 * 7. Create ProcessingJob in PostgreSQL
 * 8. Enqueue BullMQ job (worker will process it)
 * 9. Return job and asset identifiers to frontend
 * 
 * Security:
 * - Workspace ID from request body verified against database
 * - R2 object key from database (not client-supplied)
 * - Size comparison with tolerance prevents rejecting on minor differences
 * - Job creation is idempotent (worker handles deduplication)
 * - Error details sanitized (no R2 internal details exposed)
 * 
 * Note: The actual video metadata (duration, resolution, codecs)
 * comes from FFprobe running on the worker, NOT from the browser.
 * The browser only reports file size; metadata is extracted later.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/prisma/client";
import { z } from "zod";
import { completeUpload } from "@/lib/storage/r2-upload";
import type { UploadCompleteRequest, UploadCompleteResponse } from "@/lib/storage/storage-types";

// ============================================================
// REQUEST VALIDATION SCHEMA
// ============================================================

const completeUploadSchema = z.object({
  assetId: z.string().min(1, "Asset ID is required"),
  workspaceId: z.string().min(1, "Workspace ID is required"),
  reportedSize: z.number()
    .int("Reported size must be an integer")
    .positive("Reported size must be positive"),
});

// ============================================================
// API HANDLER: POST /api/uploads/complete
// ============================================================

export async function POST(
  request: Request
): Promise<NextResponse> {
  try {
    // ---- Step 1: Parse Request Body ----
    const body = await request.json();
    
    // ---- Step 2: Zod Validation ----
    const validationResult = completeUploadSchema.safeParse(body);
    
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
    
    const validatedData = validationResult.data as z.infer<typeof completeUploadSchema>;
    
    // ---- Step 3: Complete Upload Workflow ----
    const result = await completeUpload(
      validatedData.assetId,
      validatedData.workspaceId,
      validatedData.reportedSize
    );
    
    // ---- Step 4: Return Success Response ----
    return NextResponse.json({
      success: true,
      data: result,
    }, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": "application/json",
      },
    });
    
  } catch (error: any) {
    console.error("ERROR in POST /api/uploads/complete:", error);
    
    // Handle specific error types
    if (error.message?.includes("not found in workspace")) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 }
      );
    }
    
    if (error.message?.includes("object not found in R2")) {
      return NextResponse.json(
        { error: "Upload verification failed. The video may not have fully uploaded to storage." },
        { status: 400 }
      );
    }
    
    if (error.message?.includes("already has an active job")) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 } // Conflict — job already exists
      );
    }
    
    // Generic error
    return NextResponse.json(
      { error: "Internal server error. Upload completion failed." },
      { status: 500 }
    );
  }
}