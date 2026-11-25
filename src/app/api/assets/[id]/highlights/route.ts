/**
 * ClipForge AI — Phase 4: GET /api/assets/[id]/highlights
 *
 * Get highlight candidates for a video asset.
 *
 * If the asset has a completed transcript, generates highlight candidates
 * using the HighlightEngine. If no transcript exists, returns an error
 * directing the user to initiate transcription first.
 *
 * @route GET /api/assets/[id]/highlights
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const workspaceId = new URL(request.url).searchParams.get("workspaceId") || "";

    // Query any completed transcript for this asset
    const transcript = await prisma.transcript.findFirst({
      where: {
        videoAssetId: id,
        status: "COMPLETED",
      },
    });

    // Fetch transcript segments separately (no @relation include)
    const transcriptSegments = await prisma.transcriptSegment.findMany({
      where: { transcriptId: transcript?.id },
    });

    if (transcript && transcriptSegments && transcriptSegments.length > 0) {
      const { HighlightEngine } = await import("@/lib/ai/highlight-engine");
      const engine = new HighlightEngine();

      const candidates = engine.analyze({
        fullText: transcript.fullText || "",
        segments: transcriptSegments,
        language: transcript.language || "en",
        duration: transcript.duration,
      });

      // Ownership validation: verify asset belongs to workspace
      const asset = await prisma.videoAsset.findFirst({
        where: {
          id: id,
          workspaceId: workspaceId,
        },
      });

      if (!asset) {
        return NextResponse.json(
          { error: "Video asset not found in specified workspace" },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          assetId: asset.id,
          workspaceId: asset.workspaceId,
          transcriptId: transcript.id,
          totalSegmentsAnalyzed: transcriptSegments.length,
          candidates,
          message: `Analyzed ${transcriptSegments.length} transcript segments. ${candidates.length} highlight candidates generated.`,
        },
        { status: 200 }
      );
    }

    // No completed transcript found — direct user to initiate transcription
    const asset = await prisma.videoAsset.findFirst({
      where: {
        id: id,
        workspaceId: workspaceId,
      },
    });

    if (!asset) {
      return NextResponse.json(
        { error: "Video asset not found in specified workspace" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        assetId: asset.id,
        workspaceId: asset.workspaceId,
        transcriptId: null,
        candidates: null,
        totalSegmentsAnalyzed: 0,
        message:
          "No completed transcript found. Initiate transcription first via POST /api/ai/transcribe.",
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error("Error fetching highlight candidates:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch highlight candidates",
        message: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}