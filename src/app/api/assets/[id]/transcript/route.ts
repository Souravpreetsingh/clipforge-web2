/**
 * ClipForge AI — Phase 4: GET /api/assets/[id]/transcript
 *
 * Get transcript with segments for a video asset.
 *
 * Returns the full transcript text, individual segments with timestamps,
 * and metadata about the transcription run.
 *
 * @route GET /api/assets/[id]/transcript
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: { workspaceId: string; id: string } }
) {
  try {
    // Query the transcript for this asset
    const transcript = await prisma.transcript.findFirst({
      where: {
        videoAssetId: params.id,
        language: "en", // Default to English; in production would accept lang query param
      },
      include: {
        segments: {
          orderBy: { startTimestamp: "asc" },
        },
      },
    });

    if (!transcript) {
      return NextResponse.json(
        { error: "No transcript found for this asset" },
        { status: 404 }
      );
    }

    // Ownership validation: verify asset belongs to workspace
    const asset = await prisma.videoAsset.findFirst({
      where: {
        id: params.id,
        workspaceId: params.workspaceId,
      },
    });

    if (!asset) {
      return NextResponse.json(
        { error: "Video asset not found in specified workspace" },
        { status: 404 }
      );
    }

    // Reconstitute full transcript text from segments
    const fullText = transcript.segments
      .map((seg: any) => seg.text)
      .filter((t: string) => t.length > 0)
      .join(" ");

    return NextResponse.json(
      {
        transcriptId: transcript.id,
        assetId: asset.id,
        workspaceId: asset.workspaceId,
        language: transcript.language,
        duration: transcript.duration,
        status: transcript.status,
        startedAt: transcript.startedAt,
        completedAt: transcript.completedAt,
        fullText: fullText.trim(),
        segmentCount: transcript.segments.length,
        segments: transcript.segments.map((seg: any) => ({
          start: seg.startTimestamp,
          end: seg.endTimestamp,
          text: seg.text,
          speaker: seg.speaker,
          confidence: seg.confidence,
        })),
        message: transcript.status === "COMPLETED"
          ? "Transcript successfully retrieved"
          : "Transcript is still processing",
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error("Error fetching transcript:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch transcript",
        message: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}