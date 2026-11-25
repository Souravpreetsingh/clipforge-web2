/* ClipForge AI — Phase 7 AI Agent Mode
 * API route: POST /api/agent/runs/[id]/publish
 * Publish approved clips to YouTube.
 * Mode-dependent behavior:
 *  - APPROVAL_REQUIRED: Agent stops; user must explicitly initiate publishing
 *  - AUTOMATIC_PUBLISHING: Agent publishes according to config (daily limits, etc.)
 */
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PublishingController } from "@/lib/agent/publishing-controller";

const prisma = new PrismaClient();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { mode } = body; // "approval_required" or "automatic"

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

    const controller = new PublishingController(prisma);

    // Delegate to the appropriate mode handler
    let result: any;

    if (mode === "automatic") {
      result = await controller.modeAutomaticOptIn(
        id,
        body?.userConfirmation === true, // explicit confirmation
        body?.configuration
      );
    } else {
      // Default to approval mode
      result = await controller.modeApprovalRequired(id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
        message: result.message || "Publish operation completed.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Failed to process publish request:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to process publish request",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    await prisma.$disconnect();
  }
}