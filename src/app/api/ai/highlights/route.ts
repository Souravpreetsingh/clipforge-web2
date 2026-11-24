/**
 * ClipForge AI — Phase 4: POST /api/ai/highlights
 *
 * Generate highlight candidates from a transcribed asset.
 *
 * Workflow:
 * 1. Validate ownership/workspace access
 * 2. Check that transcript exists and is COMPLETED
 * 3. Run highlight analysis on transcript segments
 * 4. Return ranked highlight candidates with scores and categories
 *
 * The actual analysis happens using the HighlightEngine with
 * configurable scoring weights.
 *
 * @route POST /api/ai/highlights
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function POST(
  request: Request,
  { params }: { params: { workspaceId: string } }
) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validation = z.object({
      assetId: z.string().describe("VideoAsset ID to analyze"),
      workspaceId: z.string().describe("Workspace ID for ownership validation"),
      customConfig: z
        .object({
          hookStrength: z.number().optional(),
          informationValue: z.number().optional(),
          emotionalEngagement: z.number().optional(),
          selfContainedContext: z.number().optional(),
          narrativeCompleteness: z.number().optional(),
          replayPotential: z.number().optional(),
          durationSuitability: z.number().optional(),
        })
        .optional(),
    }).parse(body);

    const { assetId, workspaceId, customConfig } = validation.data;

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

    // Check that asset has a completed transcript
    const transcript = await prisma.transcript.findFirst({
      where: {
        videoAssetId: assetId,
        language: asset.language, // Use asset's language or default
        status: "COMPLETED",
      },
    });

    // Fetch transcript segments separately (no @relation include)
    const transcriptSegments = await prisma.transcriptSegment.findMany({
      where: { transcriptId: transcript?.id },
    });

    if (!transcript || !transcriptSegments || transcriptSegments.length === 0) {
      return NextResponse.json(
        {
          error: "No completed transcript found for this asset. " +
          "Initiate transcription first via POST /api/ai/transcribe.",
        },
        { status: 409 }
      );
    }

    // Run highlight analysis using the HighlightEngine
    const { HighlightEngine } = await import("@/lib/ai/highlight-engine");
    const engine = new HighlightEngine(customConfig?.customConfig);

    const candidates = engine.analyze({
      fullText: transcript.fullText || "",
      segments: transcriptSegments,
      language: transcript.language || "en",
      duration: transcript.duration,
    }, customConfig?.customConfig);

    // Return the ranked candidates
    return NextResponse.json(
      {
        assetId: asset.id,
        workspaceId: asset.workspaceId,
        transcriptId: transcript.id,
        totalSegmentsAnalyzed: transcriptSegments.length,
        candidates,
        scoringConfig: {
          hookStrength: engine.config.hookStrength,
          informationValue: engine.config.informationValue,
          emotionalEngagement: engine.config.emotionalEngagement,
          selfContainedContext: engine.config.selfContainedContext,
          narrativeCompleteness: engine.config.narrativeCompleteness,
          replayPotential: engine.config.replayPotential,
          durationSuitability: engine.config.durationSuitability,
        },
        message: `Analyzed ${transcriptSegments.length} transcript segments. ${candidates.length} highlight candidates generated.`,
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error("Error generating highlights:", error);

    return NextResponse.json(
      {
        error: "Failed to generate highlight candidates",
        message: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}