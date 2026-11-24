/* ClipForge AI — Phase 7 AI Agent Mode
 * API route: POST /api/agent/runs/[id]/resume
 * Resume a paused agent run.
 * Target status determines where to resume from.
 */
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const { targetStatus } = await request.json();

    if (!targetStatus) {
      return new Response(
        JSON.stringify({ error: "targetStatus is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const stateMachine = new (await import("@/lib/agent/state-machine")).AgentStateMachine(
      prisma,
      id
    );

    await stateMachine.resume(targetStatus as any);

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
        message: `Agent run resumed targeting status: ${targetStatus}.`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Failed to resume agent run:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to resume agent run",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    await prisma.$disconnect();
  }
}