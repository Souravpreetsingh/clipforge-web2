/* ClipForge AI — Phase 7 AI Agent Mode
 * API route: POST /api/agent/runs/[id]/cancel
 * Cancel an agent run.
 * Triggers cleanup: stop in-progress jobs, clean temp files, update DB state.
 */
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const { reason } = await request.json();

    const stateMachine = new (await import("@/lib/agent/state-machine")).AgentStateMachine(
      prisma,
      id
    );

    await stateMachine.cancel(reason || "User-cancelled agent run");

    const updatedRun = await prisma.agentRun.findUnique({
      where: { id },
    });

    return new Response(
      JSON.stringify({
        success: true,
        agentRun: {
          id: updatedRun!.id,
          workspaceId: updatedRun!.workspaceId,
          status: updatedRun!.status,
          currentStage: updatedRun!.currentStage,
        },
        message: "Agent run cancelled successfully.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Failed to cancel agent run:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to cancel agent run",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    await prisma.$disconnect();
  }
}