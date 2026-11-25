/* ClipForge AI — Phase 7 AI Agent Mode
 * API route: POST /api/agent/runs/[id]/source
 * Submit or update the source video for an agent run.
 * YouTube URL validation + source authorization.
 */
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { youtubeUrl, sourceAuthorized, authorizedAssetId } = await request.json();

    if (!youtubeUrl && !authorizedAssetId) {
      return new Response(
        JSON.stringify({ error: "Either youtubeUrl or authorizedAssetId is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Find the agent run
    const agentRun = await prisma.agentRun.findUnique({
      where: { id },
    });

    if (!agentRun) {
      return new Response(
        JSON.stringify({ error: `Agent run "${id}" not found` }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // If YouTube URL provided, validate it
    if (youtubeUrl) {
      // Extract video ID from YouTube URL
      const urlParams = new URL(youtubeUrl).pathname;
      const videoId = urlParams.replace("/watch?v=", "").replace("/", "").replace("shorts/", "");

      // Basic validation - YouTube video ID is 11 characters
      if (videoId.length !== 11) {
        return new Response(
          JSON.stringify({ error: "Invalid YouTube URL: cannot extract video ID" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Update the agent run with the YouTube source
      await prisma.agentRun.update({
        where: { id },
        data: {
          source: {
            ...agentRun.source,
            youtubeUrl,
            videoId,
          },
          updatedAt: new Date(),
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "YouTube URL submitted. Source validation required. " +
          "User must confirm they own this video or have permission to reuse it.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // If authorized asset ID provided
    if (authorizedAssetId) {
      // Verify the asset belongs to this workspace
      const asset = await prisma.videoAsset.findFirst({
        where: {
          id: authorizedAssetId,
          workspaceId: agentRun.workspaceId,
        },
      });

      if (!asset) {
        return new Response(
          JSON.stringify({ error: "Authorized asset not found or does not belong to this workspace" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Update the agent run with the imported asset
      await prisma.agentRun.update({
        where: { id },
        data: {
          source: {
            ...agentRun.source,
            authorizedAssetId,
            sourceType: "IMPORTED_ASSET",
          },
          updatedAt: new Date(),
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Authorized asset imported. Agent can proceed with processing.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown source submission type" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Failed to submit source:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to submit source",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    await prisma.$disconnect();
  }
}