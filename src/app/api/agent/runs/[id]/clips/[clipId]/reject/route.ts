/* ClipForge AI — Phase 7 AI Agent Mode
 * API route: POST /api/agent/runs/[id]/clips/[clipId]/reject
 * Reject a generated clip.
 * Clip is marked as rejected; if any clip is rejected, the agent run fails.
 */
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(request: NextRequest, { params }: { params: { id: string; clipId: string } }) {
  try {
    const { id, clipId } = params;

    // Update the clip selection to rejected
    const updatedClip = await prisma.agentClipSelection.update({
      where: { id: clipId },
      data: {
        userApproval: "REJECT",
        status: "REJECTED" as const,
        updatedAt: new Date(),
      },
    });

    // In approval mode, rejecting any clip causes the agent run to fail
    // (Rejected clips remain unpublished)
    await prisma.agentRun.update({
      where: { id },
      data: {
        status: "FAILED" as const,
        currentStage: "failed",
        error: "User rejected one or more generated Shorts. Agent run cancelled.",
        errorCode: "USER_REJECTION",
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        clip: {
          id: updatedClip.id,
          status: updatedClip.status,
          userApproval: updatedClip.userApproval,
        },
        message: "Clip rejected. Agent run failed as per approval mode rules.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Failed to reject clip:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to reject clip",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    await prisma.$disconnect();
  }
}