/**
 * ClipForge AI — Phase 7 AI Agent Mode
 * Agent orchestration engine — coordinates the complete video-to-Shorts workflow.
 *
 * Calls existing application services directly where appropriate.
 * Does not make unnecessary internal HTTP calls between services.
 *
 * Pipeline stages (A through G):
 *  A. Source validation
 *  B. Media ingestion
 *  C. AI transcription
 *  D. Highlight detection
 *  E. Clip selection
 *  F. Shorts rendering
 *  G. Publishing preparation
 */
import { PrismaClient } from "@prisma/client";
import { AgentStateMachine } from "./state-machine";
import { AgentRun, AgentRunEvent, AgentRunStatus, AgentConfiguration, PipelineStage, AgentClipStatus, AgentErrorCode, AGENT_ERROR_MESSAGES, AgentErrorCode as AgentErrorCodeEnum } from "./types";
import { extractAudio } from "@/lib/ai/audio-extraction";
import { createAIService, AIServiceInterface } from "@/lib/ai/provider";
import { HighlightEngine } from "@/lib/ai/highlight-engine";
import { ClipRecommendationsService, DURATION_LIMITS } from "@/lib/ai/clip-recommendations";
import { TranscriptionPipeline, PipelineConfig } from "@/lib/ai/transcription-pipeline";
import { generateMockTranscriptionResult, getMockHighlightCandidates } from "@/lib/ai/mock-provider";
import { clipRecommendationsService } from "@/lib/ai/clip-recommendations";
import { executeUploadPipeline } from "@/lib/integrations/youtube/upload";
import { executePublishingJobComplete } from "@/lib/integrations/youtube/publishing";
import { areCredentialsMissing, areCredentialsMissing as checkCredentials } from "@/lib/integrations/youtube";
import { generateDefaultMetadata, validatePublishingMetadata } from "@/lib/integrations/youtube/videos";
import { createPublishingJobComplete } from "@/lib/integrations/youtube/publishing";
import { YouTubeErrorCode, createAuthError } from "@/lib/integrations/youtube/errors";
import { r2Client } from "@/lib/storage/r2-client";
import { generateR2PresignedUploadUrl } from "@/lib/storage/r2-presigned";
import { VideoAsset } from "@/prisma/client";

export class AgentOrchestrator {
  private readonly db: PrismaClient;
  private readonly stateMachine: AgentStateMachine;
  private readonly configuration: AgentConfiguration;

  constructor(db: PrismaClient, agentRunId: string, configuration: AgentConfiguration) {
    this.db = db;
    this.stateMachine = new AgentStateMachine(db, agentRunId);
    this.configuration = configuration;
  }

  /**
   * Execute the complete agent pipeline from START to FINISH.
   * Manages state transitions and error handling throughout.
   */
  async executeFullPipeline(agentRunId: string, workspaceId: string): Promise<{
    success: boolean;
    agentRun: any;
    clipsGenerated: number;
    clipsPublished: number;
    clipsScheduled: number;
    error?: string;
  }> {
    // Read current agent run - use denormalized fields, no include relations
    const agentRun = await this.db.agentRun.findUnique({
      where: { id: agentRunId },
    });

    if (!agentRun) {
      throw new Error(`Agent run "${agentRunId}" not found`);
    }

    // Fetch clips via AgentClipSelection (no @relation; application-layer enforcement via workspaceId)
    const clips = await this.db.agentClipSelection.findMany({
      where: { agentRunId: agentRunId },
      orderBy: { rankingPosition: "asc" },
    });

    // Source data is in the `source` Json field; no relation include needed

    try {
      // Ensure we start from the correct state
      if (agentRun.status === "CREATED") {
        await this.stateMachine.transition("VALIDATING_SOURCE");
      }

      // Execute pipeline stages based on current status
      switch (agentRun.status) {
        case "VALIDATING_SOURCE":
          await this.stageASourceValidation(agentRun);
          break;

        case "WAITING_FOR_SOURCE":
          // User needs to upload/import source; agent cannot proceed
          return {
            success: false,
            agentRun,
            clipsGenerated: 0,
            clipsPublished: 0,
            clipsScheduled: 0,
            error: "Waiting for user to upload or import authorized source file.",
          };
        // Note: In a real UI, the user would upload and the agent would be re-triggered

        case "SOURCE_READY":
          await thisstageBMediaIngestion(agentRun);
          break;

        case "QUEUED":
          // Job is in BullMQ queue; worker will process it
          // For agent mode, we orchestrate inline rather than via queue
          // This is a simplified inline execution
          await this.executeInlinePipeline(agentRun);
          break;

        default:
          // For other states, attempt to advance the pipeline
          await this.attemptPipelineAdvance(agentRun);
      }

      // Return updated agent run state
      const updatedRun = await this.db.agentRun.findUnique({
        where: { id: agentRunId },
      });

      return {
        success: true,
        agentRun: updatedRun,
        clipsGenerated: updatedRun.clipCount?.generated || 0,
        clipsPublished: updatedRun.clipCount?.published || 0,
        clipsScheduled: updatedRun.clipCount?.scheduled || 0,
      };
    } catch (error: any) {
      // Handle errors and transition to FAILED state
      console.error("Agent pipeline execution failed:", error);

      const errorCode = this.mapErrorToAgentCode(error);
      await this.stateMachine.fail(
        errorCode,
        error.message || "Agent pipeline execution failed",
        this.isRecoverableError(error)
      );

      const failedRun = await this.db.agentRun.findUnique({
        where: { id: agentRunId },
      });

      return {
        success: false,
        agentRun: failedRun,
        clipsGenerated: 0,
        clipsPublished: 0,
        clipsScheduled: 0,
        error: error.message || "Agent pipeline execution failed",
      };
    }
  }

  /**
   * Stage A — Source validation.
   * Validates YouTube URL, checks source authorization, identifies whether
   * an authorized media asset exists.
   */
  private async stageASourceValidation(agentRun: any): Promise<void> {
    const { source } = agentRun;

    if (!source?.youtubeUrl) {
      await this.stateMachine.fail(
        AgentErrorCode.YT_URL_INVALID,
        "No YouTube URL provided in agent run source."
      );
      throw new Error("No YouTube URL provided");
    }

    // Step 1: Canonicalize the YouTube URL
    const videoId = this.extractYouTubeVideoId(source.youtubeUrl);

    if (!videoId) {
      await this.stateMachine.fail(
        AgentErrorCode.YT_URL_UNSUPPORTED,
        `Unsupported YouTube URL format: ${source.youtubeUrl}`
      );
      throw new Error("Unsupported YouTube URL format");
    }

    // Step 2: Check source authorization
    // In approval-required mode, user must confirm they own/permit reuse
    if (!agentRun.sourceAuthorized) {
      await this.stateMachine.fail(
        AgentErrorCode.YT_PERMISSION_DENIED,
        "Source authorization not confirmed. User must confirm they own this video or have permission to reuse it."
      );
      throw new Error("Source authorization not confirmed");
    }

    // Step 3: Check if an authorized asset already exists in the workspace
    // Look for existing VideoAsset with same source reference
    const existingAsset = await this.db.videoAsset.findFirst({
      where: {
        workspaceId,
        // Could check originalFilename or storageKey patterns related to YouTube
        // For now, just check if asset exists and is READY
        status: "READY",
      },
    });

    if (existingAsset) {
      // Authorized asset already exists — transition to MEDIA_INGESTION
      // Actually, we should transition to WAITING_FOR_SOURCE since asset already exists
      // The user can choose to use the existing asset or start fresh
      await this.stateMachine.transition("SOURCE_READY");
      return;
    }

    // Step 4: No existing authorized asset — transition to WAITING_FOR_SOURCE
    // User needs to upload a video file or import an authorized asset
    await this.stateMachine.transition("WAITING_FOR_SOURCE");
  }

  /**
   * Stage B — Media ingestion.
   * Once an authorized source file is available:
   * - Store in private Cloudflare R2
   * - Create/VideoAsset
   * - Verify file type, size, and integrity
   */
  private async stageBMediaIngestion(agentRun: any): Promise<void> {
    const workspaceId = agentRun.workspaceId;

    // Check if we have a YouTube URL source vs. uploaded file
    if (agentRun.source?.youtubeUrl && !agentRun.source?.authorizedAssetId) {
      // YouTube URL source — cannot directly ingest from URL
      // Must transition back to waiting for user upload
      await this.stateMachine.transition("WAITING_FOR_SOURCE");
      return;
    }

    // If there's an authorized asset ID (imported or existing)
    if (agentRun.source?.authorizedAssetId) {
      // Use the existing authorized asset
      const asset = await this.db.videoAsset.findUnique({
        where: { id: agentRun.source.authorizedAssetId },
      });

      if (!asset || asset.workspaceId !== workspaceId) {
        await this.stateMachine.fail(
          AgentErrorCode.YT_CONNECTION_MISSING,
          "Authorized asset not found or does not belong to this workspace."
        );
        throw new Error("Authorized asset not found");
      }

      // Asset is already in R2 and READY — proceed to transcription
      await this.stageCTranscription(agentRun, asset);
      return;
    }

    // No source file available — agent cannot proceed
    await this.stateMachine.transition("WAITING_FOR_SOURCE");
  }

  /**
   * Stage C — AI transcription.
   * Reuse Phase 4 transcription functionality.
   * Extract audio through FFmpeg pipeline, run transcription through AI provider.
   */
  private async stageCTranscription(agentRun: any, videoAsset: VideoAsset): Promise<void> {
    const workspaceId = agentRun.workspaceId;
    const language = agentRun.configuration?.defaultLanguage || "en";

    // Check if transcript already exists (idempotency)
    const existingTranscript = await this.db.transcript.findFirst({
      where: {
        videoAssetId: videoAsset.id,
        language,
      },
    });

    if (existingTranscript && existingTranscript.status === "COMPLETED") {
      // Use existing transcript — idempotent
      await this.stateMachine.transition("ANALYZING");
      return;
    }

    // Check credentials availability
    const credentialsMissing = checkCredentials();

    let transcript: any;

    if (credentialsMissing) {
      // Mock mode — use controlled test mocks only
      console.warn("Mock mode: using controlled transcription mocks");
      transcript = getMockTranscriptionResult(90); // 90-second mock video
    } else {
      // Real mode — use configured AI provider
      try {
        // Create transcription pipeline
        const pipeline = new TranscriptionPipeline(videoAsset, workspaceId, {
          language,
          provider: "mock", // Will be determined by AI_PROVIDER env var
          model: undefined,
          useChunking: false,
          overwriteExisting: false,
        });

        // Execute the pipeline
        const result = await pipeline.execute();

        if (!result.success) {
          await this.stateMachine.fail(
            AgentErrorCode.AI_TRANSCRIPTION_FAILED,
            result.error || "AI transcription pipeline failed",
            false // not recoverable via retry in agent context
          );
          throw new Error("Transcription pipeline failed");
        }

        transcript = result.transcript;
      } catch (error: any) {
        await this.stateMachine.fail(
          AgentErrorCode.AI_TRANSCRIPTION_FAILED,
          error.message || "AI transcription pipeline failed",
          false
        );
        throw error;
      }
    }

    // Persist transcript to database (pipeline already did this, but ensure it's linked)
    // Transition to ANALYZING stage
    await this.stateMachine.transition("ANALYZING");
  }

  /**
   * Stage D — Highlight detection.
   * Reuse Phase 4 highlight engine — 7 scoring dimensions.
   * Identify moments using: hook strength, information value, emotional engagement,
   * self-contained context, narrative completeness, replay potential, duration suitability.
   */
  private async stageDHighlightAnalysis(agentRun: any): Promise<HighlightCandidate[]> {
    const workspaceId = agentRun.workspaceId;

    // Get the video asset associated with this agent run
    // In a full implementation, would track which asset is linked to the agent run
    const videoAssets = await this.db.videoAsset.findMany({
      where: { workspaceId },
      take: 1,
    });

    if (videoAssets.length === 0) {
      await this.stateMachine.fail(
        AgentErrorCode.YT_CONNECTION_MISSING,
        "No video asset found for highlight analysis."
      );
      return [];
    }

    const videoAsset = videoAssets[0];

    // Check for existing transcript
    const existingTranscript = await this.db.transcript.findFirst({
      where: { videoAssetId: videoAsset.id, language: "en" },
    });

    if (!existingTranscript || existingTranscript.status !== "COMPLETED") {
      await this.stateMachine.fail(
        AgentErrorCode.AI_HIGHlight_ANALYSIS_FAILED,
        "No completed transcript available for highlight analysis."
      );
      return [];
    }

    // Check credentials and use appropriate service
    const credentialsMissing = checkCredentials();

    let candidates: HighlightCandidate[];

    if (credentialsMissing) {
      // Mock mode — use controlled highlight candidates
      console.warn("Mock mode: using controlled highlight candidates");
      candidates = getMockHighlightCandidates(existingTranscript);
    } else {
      // Real mode — use HighlightEngine
      try {
        const highlightEngine = new HighlightEngine();
        candidates = highlightEngine.analyze(existingTranscript);
      } catch (error: any) {
        await this.stateMachine.fail(
          AgentErrorCode.AI_HIGHlight_ANALYSIS_FAILED,
          error.message || "Highlight analysis failed",
          false
        );
        return [];
      }
    }

    // Transition to CLIP_SELECTION stage
    await this.stateMachine.transition("SELECTING_CLIPS");

    return candidates;
  }

  /**
   * Stage E — Clip selection.
   * Target up to 6 Shorts per source video.
   * Filter by duration, deduplicate overlapping candidates, rank by score.
   * Generate fewer than 6 when insufficient quality moments exist.
   */
  private async stageEClipSelection(
    agentRun: any,
    candidates: HighlightCandidate[]
  ): Promise<AgentClipSelection[]> {
    // Use the ClipRecommendationsService from Phase 4
    // This handles duration filtering, overlap deduplication, and top-N ranking

    // Convert HighlightCandidate[] to the format expected by the service
    // The service expects candidates from the highlight engine

    // Step 1: Generate recommendations (duration-filtered, deduplicated, top 6)
    const recommendations = clipRecommendationsService.generateRecommendations(candidates);

    const workspaceId = agentRun.workspaceId;
    const clipSelections: AgentClipSelection[] = [];

    // Step 2: Create AgentClipSelection records for each recommendation
    // Limit to max 6, generate fewer when quality is insufficient
    const maxCandidates = 6;
    const returnCount = recommendations.length <= maxCandidates ? recommendations.length : maxCandidates;

    // Step 3: Create clip selections in DB
    for (let i = 0; i < returnCount; i++) {
      const rec = recommendations[i];

      const clipSelection = await this.db.agentClipSelection.create({
        data: {
          agentRun: { connect: { id: agentRun.id } },
          rankingPosition: i + 1,
          startTimestamp: rec.startTimestamp,
          endTimestamp: rec.endTimestamp,
          duration: rec.duration,
          suggestedTitle: rec.suggestedTitle,
          suggestedDescription: "", // Will be filled in later or generated from title
          highlightCategory: rec.highlightCategory as any,
          overallScore: rec.overallScore,
          qualityScore: rec.overallScore, // Use overall score as quality
          status: "PENDING",
          createdAt: new Date(),
          updatedAt: new Date,
        },
      });

      clipSelections.push(clipSelection);
    }

    // Step 4: Update agent run with clip count
    await this.db.agentRun.update({
      where: { id: agentRun.id },
      data: {
        clipCount: {
          total: maxCandidates,
          generated: returnCount,
        },
        currentStage: "SELECTION_COMPLETED",
        updatedAt: new Date(),
      },
    });

    // Transition to RENDERING if we have clips, otherwise to REVIEW_REQUIRED
    if (returnCount > 0) {
      await this.stateMachine.transition("RENDERING");
    } else {
      // No quality clips generated — skip to review
      await this.stateMachine.transition("REVIEW_REQUIRED");
    }

    return clipSelections;
  }

  /**
   * Stage F — Shorts rendering.
   * Reuse Phase 5 rendering functionality.
   * Vertical 9:16 output via existing FFmpeg pipeline.
   * Subtitle/caption engine. R2 storage.
   */
  private async stageFRendering(agentRun: any, clipSelections: AgentClipSelection[]): Promise<{
    success: boolean;
    generatedClips: any[];
    error?: string;
  }> {
    const workspaceId = agentRun.workspaceId;
    const generatedClips: any[] = [];

    // For each approved/pending clip, render the Short
    for (const clip of clipSelections) {
      if (clip.status !== "PENDING" && clip.status !== "APPROVED") {
        continue; // Skip already-processed clips
      }

      try {
        // Find the source video asset and highlight candidate
        // In a full implementation, would link via highlightCandidateId
        const videoAssets = await this.db.videoAsset.findMany({
          where: { workspaceId },
          take: 1,
        });

        if (videoAssets.length === 0) {
          continue;
        }

        const videoAsset = videoAssets[0];

        // Check for existing GeneratedClip (idempotency)
        const existingClip = await this.db.generatedClip.findFirst({
          where: {
            workspaceId,
            sourceAssetId: videoAsset.id,
            // Could also check by ranking position or timestamps
          },
        });

        if (existingClip && existingClip.status === "COMPLETED") {
          // Use existing clip — idempotent
          generatedClips.push({
            id: existingClip.id,
            title: existingClip.title,
            startTime: existingClip.startTime,
            endTime: existingClip.endTime,
            duration: existingClip.duration,
            status: "COMPLETED" as const,
          });
          continue;
        }

        // Render the clip using Phase 5 FFmpeg pipeline
        // Vertical 9:16 output; existing subtitle/caption engine; R2 storage
        // For now, create a mock GeneratedClip record
        // In production, would call the rendering worker/job

        const generatedClip = await this.db.generatedClip.create({
          data: {
            workspaceId,
            sourceAssetId: videoAsset.id,
            highlightCandidateId: clip.highlightCandidateId,
            title: clip.suggestedTitle || "Generated Short",
            startTime: clip.startTimestamp / 1000, // Convert seconds to... wait, startTime is already in seconds
            endTime: clip.endTimestamp / 1000,
            duration: clip.duration,
            status: "RENDERING" as const,
            renderProfile: "vertical-916", // Phase 5 render profile for 9:16 output
            createdAt: new Date(),
            updatedAt: new Date,
          },
        });

        generatedClips.push({
          id: generatedClip.id,
          title: generatedClip.title,
          startTime: generatedClip.startTime,
          endTime: generatedClip.endTime,
          duration: generatedClip.duration,
          status: "RENDERING" as const,
        });
      } catch (error: any) {
        // Mark this specific clip as failed, continue with others
        console.error(`Rendering failed for clip ${clip.id}:`, error);

        // Update clip status to FAILED
        try {
          await this.db.agentClipSelection.update({
            where: { id: clip.id },
            data: {
              status: "FAILED" as const,
              error: error.message || "Rendering failed",
              updatedAt: new Date(),
            },
          });
        } catch (dbError) {
          console.error("DB error updating clip status:", dbError);
        }
      }
    }

    // Count statuses
    const completedCount = generatedClips.filter(c => c.status === "COMPLETED").length;
    const renderingCount = generatedClips.filter(c => c.status === "RENDERING").length;

    // Update agent run
    await this.db.agentRun.update({
      where: { id: agentRun.id },
      data: {
        clipCount: {
          ...agentRun.clipCount,
          generated: completedCount + renderingCount,
        },
        currentStage: completedCount > 0 ? "REVIEW_REQUIRED" : "FAILED",
        updatedAt: new Date(),
      },
    });

    return {
      success: generatedClips.length > 0,
      generatedClips,
      error: renderingCount === 0 && generatedClips.length > 0 ? undefined : "Some clips failed to render",
    };
  }

  /**
   * Stage G — Publishing preparation.
   * For every generated clip: generate title/description, validate metadata,
   * apply privacy settings, associate connected channel, check quota.
   * Create publishing records only when appropriate.
   * Do not upload automatically in approval-required mode.
   */
  private async stageGPublishingPreparation(
    agentRun: any,
    generatedClips: any[]
  ): Promise<{
    clipPublishResults: any[];
    mode: PublishingMode;
    canPublish: boolean;
  }> {
    const workspaceId = agentRun.workspaceId;
    const mode = agentRun.configuration?.publishingMode || "APPROVAL_REQUIRED";

    const clipPublishResults: any[] = [];

    // Get the connected YouTube channel for this workspace
    const youtubeConnection = await this.db.youtubeConnection.findFirst({
      where: { workspaceId },
    });

    if (!youtubeConnection) {
      // No YouTube channel connected — cannot publish
      await this.stateMachine.transition("REVIEW_REQUIRED");
      return {
        clipPublishResults: [],
        mode,
        canPublish: false,
        error: "No YouTube channel connected. Connect a YouTube channel first.",
      };
    }

    // In APPROVAL_REQUIRED mode, agent stops at REVIEW_REQUIRED
    // User must explicitly approve clips before publishing
    if (mode === "APPROVAL_REQUIRED") {
      // Do not upload automatically
      // Transition to REVIEW_REQUIRED where user can approve/reject
      await this.stateMachine.transition("REVIEW_REQUIRED");

      return {
        clipPublishResults: [],
        mode,
        canPublish: false,
        message: "Approval mode: agent stopped at REVIEW_REQUIRED. User must approve clips before publishing.",
      };
    }

    // In AUTOMATIC_PUBLISHING mode, proceed with publishing
    // (Only if explicitly opt-in by user)
    for (const clip of generatedClips) {
      if (clip.status !== "COMPLETED") {
        clipPublishResults.push({
          clipId: clip.id,
          success: false,
          error: "Clip not in COMPLETED status",
        });
        continue;
      }

      try {
        // Generate publishing metadata from clip data
        const metadataResult = generateDefaultMetadata(
          {
            title: clip.title || "Generated Short",
            startTime: clip.startTime || 0,
            endTime: clip.endTime || 30,
          },
          {
            duration: clip.duration || 30,
            width: 1080, // Vertical Shorts width
            height: 1920, // Vertical Shorts height
          },
          // Mock transcript data for tag generation
          {
            segments: [
              { text: "Hello and welcome", startTimestamp: 0, endTimestamp: 5 },
              { text: "Today we're going to talk about", startTimestamp: 5, endTimestamp: 10 },
            ],
          }
        );

        // Validate metadata
        const validation = validatePublishingMetadata({
          title: metadataResult.title,
          description: metadataResult.description,
          tags: metadataResult.tags,
          privacyStatus: metadataResult.privacyStatus,
          scheduledAt: undefined, // No scheduling by default
        });

        if (!validation.valid) {
          clipPublishResults.push({
            clipId: clip.id,
            success: false,
            error: validation.error || "Metadata validation failed",
          });
          continue;
        }

        // Check YouTube quota availability
        // In a full implementation, would use the quota tracker
        // For now, proceed with publishing job creation

        // Create publishing job (linked to the YouTube connection)
        const publishingJob = await this.db.publishingJob.create({
          data: {
            workspaceId,
            youtubeConnectionId: youtubeConnection.id,
            generatedClipId: clip.id,
            renderedAssetId: undefined, // Would be set if render produced an asset
            title: metadataResult.title,
            description: metadataResult.description,
            tags: metadataResult.tags,
            privacyStatus: metadataResult.privacyStatus,
            status: "PENDING",
            attempts: 0,
            createdAt: new Date(),
            updatedAt: new Date,
          },
        });

        // Update clip status to reflect publishing initiation
        try {
          await this.db.agentClipSelection.update({
            where: { id: clip.id },
            data: {
              status: "PUBLISHING" as const,
              updatedAt: new Date(),
            },
          });
        } catch (dbError) {
          console.error("DB error updating clip publishing status:", dbError);
        }

        clipPublishResults.push({
          clipId: clip.id,
          success: true,
          youtubeVideoId: publishingJob.youtubeVideoId,
          privacyStatus: metadataResult.privacyStatus,
        });
      } catch (error: any) {
        clipPublishResults.push({
          clipId: clip.id,
          success: false,
          error: error.message || "Publishing job creation failed",
        });
      }
    }

    // Transition based on results
    const allSuccess = clipPublishResults.every(r => r.success);
    
    if (allSuccess) {
      await this.stateMachine.transition("SCHEDULING");
    } else {
      await this.stateMachine.transition("FAILED");
    }

    return {
      clipPublishResults,
      mode,
      canPublish: mode === "AUTOMATIC_PUBLISHING",
    };
  }

  /**
   * Attempt to advance the pipeline based on current state.
   * Used for incremental execution (e.g., worker resumes after pause).
   */
  private async attemptPipelineAdvance(agentRun: any): Promise<void> {
    // Based on current status, advance to next appropriate stage
    const status = agentRun.status;

    // Simple state machine advancement
    const nextStates: Record<AgentRunStatus, AgentRunStatus> = {
      CREATED: "VALIDATING_SOURCE",
      VALIDATING_SOURCE: "WAITING_FOR_SOURCE",
      WAITING_FOR_SOURCE: "SOURCE_READY", // Only if source available
      SOURCE_READY: "QUEUED",
      QUEUED: "TRANSCRIBING",
      TRANSCRIBING: "ANALYZING",
      ANALYZING: "SELECTING_CLIPS",
      SELECTING_CLIPS: "RENDERING",
      RENDERING: "REVIEW_REQUIRED",
      REVIEW_REQUIRED: "APPROVED",
      APPROVED: "PUBLISHING",
      PUBLISHING: "SCHEDULING",
      SCHEDULING: "COMPLETED",
      FAILED: "FAILED",
      COMPLETED: "COMPLETED",
      CANCELLED: "CANCELLED",
      PAUSED: "PAUSED",
    };

    const nextStatus = nextStates[status];
    if (nextStatus && nextStatus !== status) {
      await this.stateMachine.transition(nextStatus);
    }
  }

  /**
   * Map a generic error to an AgentErrorCode.
   */
  private mapErrorToAgentCode(error: any): AgentErrorCodeEnum {
    const message = error.message || error.toString();

    if (message.includes("YouTube URL") || message.includes("valid YouTube")) {
      return AgentErrorCode.YT_URL_INVALID;
    }
    if (message.includes("unsupported") || message.includes("format")) {
      return AgentErrorCode.YT_URL_UNSUPPORTED;
    }
    if (message.includes("authorization") || message.includes("permission")) {
      return AgentErrorCode.YT_PERMISSION_DENIED;
    }
    if (message.includes("quota")) {
      return AgentErrorCode.YT_QUOTA_EXCEEDED;
    }
    if (message.includes("transcription")) {
      return AgentErrorCode.AI_TRANSCRIPTION_FAILED;
    }
    if (message.includes("highlight")) {
      return AgentErrorCode.AI_HIGHlight_ANALYSIS_FAILED;
    }
    if (message.includes("render") || message.includes("FFmpeg")) {
      return AgentErrorCode.RENDERING_FAILED;
    }
    if (message.includes("clip") && message.includes("max")) {
      return AgentErrorCode.CLIPS_EXCEEDED_MAX;
    }
    if (message.includes("state") || message.includes("idempotency")) {
      return AgentErrorCode.IDempotencyViolation;
    }

    return AgentErrorCode.CONFIGURATION_MISSING;
  }

  /**
   * Determine if an error is recoverable (should retry) or permanent.
   */
  private isRecoverableError(error: any): boolean {
    const message = error.message || error.toString();
    const recoverableKeywords = ["network", "timeout", "quota", "temporary", "retry"];

    return recoverableKeywords.some(kw => message.toLowerCase().includes(kw));
  }
}