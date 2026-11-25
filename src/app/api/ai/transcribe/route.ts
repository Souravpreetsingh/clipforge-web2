/**
 * ClipForge AI — Phase 4: POST /api/ai/transcribe
 *
 * Initiate transcription of a video asset.
 *
 * Workflow:
 * 1. Validate ownership/workspace access
 * 2. Check asset exists and is in a valid state for transcription
 * 3. Create BullMQ job for transcription processing
 * 4. Return job ID for status polling
 *
 * The actual transcription processing happens in the BullMQ worker.
 * This endpoint only enqueues the job.
 *
 * @route POST /api/ai/transcribe
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getServerSession } from "next-auth";

// Validation schema for transcription request
const initiateTranscribeSchema = z.object({
  assetId: z.string().describe("VideoAsset ID to transcribe"),
  workspaceId: z.string().describe("Workspace ID for ownership validation"),
  language: z.string()
    .optional()
    .describe("Language code for transcription (e.g., 'en', 'es', 'fr')"),
  provider: z.string()
    .optional()
    .describe("AI provider: 'openai', 'assemblyai', or 'mock'"),
  model: z.string()
    .optional()
    .describe("Whisper model name (e.g., 'whisper-1')"),
});

export async function POST(request: Request) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validation = initiateTranscribeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid request data",
          details: validation.error.format(),
        },
        { status: 400 }
      );
    }

    const { assetId, workspaceId, language, provider, model } = validation.data;

    // Ownership validation: verify asset exists and belongs to workspace
    const asset = await prisma.videoAsset.findFirst({
      where: {
        id: assetId,
        workspaceId: workspaceId,
      },
    });

    if (!asset) {
      return NextResponse.json(
        { error: "Video asset not found in specified workspace" },
        { status: 404 }
      );
    }

    // Fetch the most recent processing job separately (no @relation include)
    const processingJobs = await prisma.processingJob.findMany({
      where: { videoAssetId: assetId },
      orderBy: { createdAt: "desc" },
      take: 1,
    });

    // Check asset state — cannot transcribe if already READY without new job
    if (asset.status === "READY") {
      // Asset is already processed; check if there's already a transcript
      const existingTranscript = await prisma.transcript.findFirst({
        where: {
          videoAssetId: assetId,
          language: language || "en",
          status: "COMPLETED",
        },
      });

      if (existingTranscript) {
        return NextResponse.json(
          {
            error: "Transcript already exists for this asset.",
            existingTranscriptId: existingTranscript.id,
          },
          { status: 409 }
        );
      }
    }

    // Create AI processing run record to track this transcription job
    const processingRun = await prisma.aiProcessingRun.create({
      data: {
        videoAssetId: assetId,
        workspaceId: workspaceId,
        runType: "TRANSCRIPTION",
        provider: provider || (process.env.AI_PROVIDER || "mock"),
        modelName: model || process.env.OPENAI_WHISPER_MODEL || "whisper-1",
        status: "QUEUED",
        progress: 0,
        currentStage: "INITIALIZED",
      },
    });

    // Enqueue BullMQ job for transcription processing
    // The job data contains identifiers only (not video bytes)
    const { Queue } = await import("bullmq");
    const { startWorker } = await import("@/worker/index");

    // Create the queue and enqueue job
    const videoProcessingQueue = new Queue("video-processing", {
      connection: {
        host: "localhost",
        port: 6380,
      },
    });

    // Enqueue transcription job
    await videoProcessingQueue.add("process-job", {
      jobType: "TRANSCRIPTION",
      videoAssetId: assetId,
      workspaceId: workspaceId,
      r2Key: asset.storageKey || "",
      thumbnailR2Key: asset.thumbnailStorageKey || "",
    }, {
      jobId: processingRun.id, // Use the processing run ID as the stable job identifier
    });

    // Update processing run status
    await prisma.aiProcessingRun.update({
      where: { id: processingRun.id },
      data: {
        status: "IN_PROGRESS",
        currentStage: "AUDIO_EXTRACTING",
        progress: 10,
      },
    });

    return NextResponse.json(
      {
        jobId: processingRun.id,
        assetId: asset.id,
        workspaceId: asset.workspaceId,
        status: "QUEUED",
        runType: "TRANSCRIPTION",
        progress: 10,
        currentStage: "AUDIO_EXTRACTING",
        message: "Transcription job enqueued successfully. Use GET /api/ai/jobs/[id] to poll status.",
      },
      { status: 202 }
    );

  } catch (error: any) {
    console.error("Error initiating transcription:", error);

    return NextResponse.json(
      {
        error: "Failed to initiate transcription",
        message: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}