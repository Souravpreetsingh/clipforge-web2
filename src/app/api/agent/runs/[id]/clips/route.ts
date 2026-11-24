/* ClipForge AI — Phase 7 AI Agent Mode
 * API route: GET /api/agent/runs/[id]/clips
 * List all generated clips for an agent run (for review experience).
 */
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;

    const run = await prisma.agentRun.findUnique({
      where: { id },
      include: {
        clips: {
          orderBy: { rankingPosition: "asc" },
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
          error: clip.error,
        })),
        agentStatus: run.status,
        message: "Clips retrieved successfully.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Failed to fetch clips:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to fetch clips",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    await prisma.$disconnect();
  }
}