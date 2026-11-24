/* ClipForge AI — Phase 7 AI Agent Mode
 * API route: GET /api/agent/settings
 * Get agent configuration for a workspace.
 * PATCH /api/agent/settings - Update agent configuration.
 */
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return new Response(
        JSON.stringify({ error: "workspaceId query parameter is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Find the most recent agent run for this workspace to get configuration
    const run = await prisma.agentRun.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });

    if (!run) {
      // Return default configuration if no runs exist
      return new Response(
        JSON.stringify({
          success: true,
          configuration: {
            publishingMode: "APPROVAL_REQUIRED",
            dailyPublishLimit: 5,
            minQualityThreshold: 0.3,
            defaultTimeZone: "America/New_York",
            publishIntervalMinutes: 10,
            automaticPublishingEnabled: false,
            pauseAutomation: false,
            stopFuturePublishing: false,
          },
          message: "No agent runs found; returning default configuration.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        configuration: run.configuration,
        message: "Agent configuration retrieved successfully.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Failed to fetch agent settings:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to fetch agent settings",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { workspaceId, configuration } = body;

    if (!workspaceId) {
      return new Response(
        JSON.stringify({ error: "workspaceId is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Find the most recent agent run for this workspace
    const run = await prisma.agentRun.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });

    if (!run) {
      return new Response(
        JSON.stringify({ error: "No agent run found for this workspace" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Update the configuration
    const updatedRun = await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        configuration: {
          ...run.configuration,
          ...configuration,
        } as any,
        updatedAt: new Date(),
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        configuration: updatedRun.configuration,
        message: "Agent configuration updated successfully.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Failed to update agent settings:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to update agent settings",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    await prisma.$disconnect();
  }
}