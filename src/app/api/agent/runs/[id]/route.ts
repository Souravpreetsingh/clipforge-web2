/* ClipForge AI — Phase 7 AI Agent Mode
 * API route: GET /api/agent/runs/[id]
 * Get a specific agent run with its details and clips.
 */
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const run = await prisma.agentRun.findUnique({
      where: { id },
      include: {
        clips: {
          orderBy: { rankingPosition: "asc" },
        },
        _count: {
          select: { clips: true },
        },
      },
    });

    if (!run) {
      return new Response(
        JSON.stringify({ error: `Agent run "${id}" not found` }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        agentRun: {
          id: run.id,
          workspaceId: run.workspaceId,
          runType: run.runType,
          status: run.status,
          progress: run.progress,
          currentStage: run.currentStage,
          configuration: run.configuration,
          source: run.source,
          clipCount: run.clipCount,
          clips: run.clips.map((clip) => ({
            id: clip.id,
            rankingPosition: clip.rankingPosition,
            startTimestamp: clip.startTimestamp,
            endTimestamp: clip.endTimestamp,
            duration: clip.duration,
            suggestedTitle: clip.suggestedTitle,
            suggestedDescription: clip.suggestedDescription || "",
            highlightCategory: clip.highlightCategory,
            overallScore: clip.overallScore,
            qualityScore: clip.qualityScore,
            status: clip.status,
            userApproval: clip.userApproval,
            createdAt: clip.createdAt,
            updatedAt: clip.updatedAt,
          })),
          createdAt: run.createdAt,
          completedAt: run.completedAt,
          error: run.error,
        },
        message: "Agent run retrieved successfully.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Failed to fetch agent run:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to fetch agent run",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    await prisma.$disconnect();
  }
}