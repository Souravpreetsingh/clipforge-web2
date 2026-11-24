/* ClipForge AI — Phase 7 AI Agent Mode
 * API route: POST /api/agent/runs/[id]/clips/[clipId]/approve
 * Approve a generated clip.
 * Updates clip status and checks if all clips are approved.
 */
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(request: NextRequest, { params }: { params: { id: string; clipId: string } }) {
  try {
    const { id, clipId } = params;

    // Update the clip selection to approved
    const updatedClip = await prisma.agentClipSelection.update({
      where: { id: clipId },
      data: {
        userApproval: "APPROVE",
        status: "APPROVED" as const,
        updatedAt: new Date(),
      },
    });

    // Check how many clips are now approved
    const agentRun = await prisma.agentRun.findUnique({
      where: { id },
      include: { clips: true },
    });

    if (!agentRun) {
      return new Response(
        JSON.stringify({ error: `Agent run "${id}" not found` }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const totalClips = agentRun.clipCount?.total || 0;
    const approvedCount = agentRun.clips.filter(
      (c: any) => c.status === "APPROVED"
    ).length;

    // If all clips are approved, transition to APPROVED state
    let newStatus: "APPROVED" | "REVIEW_REQUIRED" = "REVIEW_REQUIRED";

    if (approvedCount >= totalClips && totalClips > 0) {
      newStatus = "APPROVED";
      await prisma.agentRun.update({
        where: { id },
        data: {
          status: "APPROVED" as const,
          currentStage: "approved",
          updatedAt: new Date(),
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        clip: {
          id: updatedClip.id,
          status: updatedClip.status,
          userApproval: updatedClip.userApproval,
        },
        agentStatus: newStatus,
        totalClips,
        approvedCount,
        message: approvedCount >= totalClips && totalClips > 0
          ? "All clips approved. Agent run advanced to APPROVED state."
          : "Clip approved. Waiting for remaining clips.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Failed to approve clip:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to approve clip",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    await prisma.$disconnect();
  }
}