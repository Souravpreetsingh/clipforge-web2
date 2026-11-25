/**
 * ClipForge AI — Phase 4: GET /api/ai/jobs/[id]
 *
 * Check AI processing job status.
 *
 * The BullMQ worker updates the AIProcessingRun record in PostgreSQL
 * as it progresses through stages. This endpoint queries that record
 * to provide real-time status to the frontend.
 *
 * @route GET /api/ai/jobs/[id]
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const workspaceId = new URL(request.url).searchParams.get("workspaceId") || "";

    // Query the AI processing run record
    const run = await prisma.aiProcessingRun.findUnique({
      where: { id: id },
    });

    if (!run) {
      return NextResponse.json(
        { error: "AI processing job not found" },
        { status: 404 }
      );
    }

    // Check ownership/workspace access
    if (run.workspaceId !== workspaceId) {
      return NextResponse.json(
        { error: "Access denied: workspace ID mismatch" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        jobId: run.id,
        assetId: run.videoAssetId,
        workspaceId: run.workspaceId,
        runType: run.runType,
        status: run.status,
        progress: run.progress,
        currentStage: run.currentStage,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        errorCode: run.errorCode,
        errorMessage: run.errorMessage,
        transcriptionDuration: run.transcriptionDuration,
        highlightDuration: run.highlightDuration,
        clipCount: run.clipCount,
        message: getJobStatusMessage(run.status, run.currentStage),
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error("Error fetching AI job status:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch AI job status",
        message: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}

/** Human-readable status message */
function getJobStatusMessage(
  status: string,
  currentStage?: string
): string {
  const statusMessages: Record<string, string> = {
    QUEUED: "Job is queued waiting to start",
    IN_PROGRESS: "Job is currently processing",
    COMPLETED: "Job completed successfully",
    FAILED: "Job failed",
  };

  return statusMessages[status] || currentStage || "Unknown status";
}