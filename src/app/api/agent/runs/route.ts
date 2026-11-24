/* ClipForge AI — Phase 7 AI Agent Mode
 * API route: POST /api/agent/runs
 * Create a new agent run.
 */
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { AgentOrchestrator } from "@/lib/agent/orchestrator";
import { AgentConfiguration } from "@/lib/agent/types";

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workspaceId, runType, source, configuration } = body;

    if (!workspaceId) {
      return new Response(
        JSON.stringify({ error: "workspaceId is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Determine run type
    const runType: "YOUTUBE_SHORTS" | "USER_UPLOAD" | "IMPORTED_ASSET" =
      runType || "YOUTUBE_SHORTS";

    // Set default configuration if not provided
    const defaultConfig: AgentConfiguration = {
      publishingMode: "APPROVAL_REQUIRED", // DEFAULT as specified
      dailyPublishLimit: 5, // Conservative default
      minQualityThreshold: 0.3,
      defaultTimeZone: "America/New_York",
      publishIntervalMinutes: 10,
      automaticPublishingEnabled: false,
      pauseAutomation: false,
      stopFuturePublishing: false,
      ...configuration,
    };

    // Create agent run record
    const agentRun = await prisma.agentRun.create({
      data: {
        workspaceId,
        runType,
        source: source || {},
        configuration: defaultConfig,
        status: "CREATED" as const,
        progress: 0,
        currentStage: "initialization",
        startedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date,
      },
    });

    // Initialize state machine and transition to VALIDATING_SOURCE
    const stateMachine = new (await import("@/lib/agent/state-machine")).AgentStateMachine(
      prisma,
      agentRun.id
    );

    await stateMachine.transition("VALIDATING_SOURCE");

    // Return the created agent run
    return new Response(
      JSON.stringify({
        success: true,
        agentRun: {
          id: agentRun.id,
          workspaceId: agentRun.workspaceId,
          runType: agentRun.runType,
          status: agentRun.status,
          progress: agentRun.progress,
          currentStage: agentRun.currentStage,
          configuration: agentRun.configuration,
          createdAt: agentRun.createdAt,
        },
        message: "Agent run created successfully. Starting source validation.",
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Failed to create agent run:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to create agent run",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    await prisma.$disconnect();
  }
}

/* GET /api/agent/runs - List agent runs for workspace */
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

    const runs = await prisma.agentRun.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 20, // Last 20 runs
    });

    return new Response(
      JSON.stringify({
        success: true,
        agentRuns: runs.map((run) => ({
          id: run.id,
          workspaceId: run.workspaceId,
          runType: run.runType,
          status: run.status,
          progress: run.progress,
          currentStage: run.currentStage,
          configuration: run.configuration,
          clipCount: run.clipCount,
          createdAt: run.createdAt,
          completedAt: run.completedAt,
        })),
        message: "Agent runs retrieved successfully.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Failed to fetch agent runs:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to fetch agent runs",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    await prisma.$disconnect();
  }
}