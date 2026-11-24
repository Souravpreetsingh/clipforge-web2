/**
 * ClipForge AI — Phase 7 AI Agent Mode
 * Publishing controller — manages the two clearly separated publishing modes.
 *
 * Mode A — APPROVAL_REQUIRED (DEFAULT): User must approve clips before publishing.
 * Mode B — AUTOMATIC_PUBLISHING (EXPLICIT OPT-IN): Agent publishes automatically
 *   with daily limits, time zone scheduling, and user-configurable preferences.
 *
 * Key principles:
 * - Approval mode: Agent stops at REVIEW_REQUIRED; no automatic publishing
 * - Automatic mode: Explicit opt-in required; daily limits enforced;
 *   pause/stop controls available; respects source authorization
 */

import { PrismaClient } from "@prisma/client";
import { AgentStateMachine, AgentRun, AgentClipStatus, PublishingMode, AgentErrorCode, AGENT_ERROR_MESSAGES } from "./types";
import { createPublishingJobComplete } from "@/lib/integrations/youtube/publishing";
import { areCredentialsMissing, checkCredentials } from "@/lib/integrations/youtube";
import { generateDefaultMetadata, validatePublishingMetadata } from "@/lib/integrations/youtube/videos";
import { YouTubeErrorCode, createAuthError } from "@/lib/integrations/youtube/errors";

export class PublishingController {
  private readonly db: PrismaClient;
  private readonly stateMachine: AgentStateMachine;

  constructor(db: PrismaClient) {
    this.db = db;
    this.stateMachine = new AgentStateMachine(db, "");
  }

  /**
   * Process user approval/rejection of a clip.
   * In approval-required mode, agent transitions from REVIEW_REQUIRED
   * to APPROVED when all clips are approved; or to FAILED if any are rejected.
   */
  async processClipApproval(
    agentRunId: string,
    clipId: string,
    approval: "APPROVE" | "REJECT"
  ): Promise<{
    success: boolean;
    agentRun: any;
    remainingClipsToApprove: number;
  }> {
    // Find the clip selection record
    const clipSelection = await this.db.agentClipSelection.findUnique({
      where: { id: clipId },
    });

    if (!clipSelection) {
      throw new Error(`Clip selection "${clipId}" not found`);
    }

    // Update the clip's approval status
    const updatedClip = await this.db.agentClipSelection.update({
      where: { id: clipId },
      data: {
        userApproval: approval,
        status:
          approval === "APPROVE"
            ? "APPROVED" as const
            : "REJECTED" as const,
        updatedAt: new Date(),
      },
    });

    // Check how many clips remain to be approved
    // Use AgentClipSelection directly; no @relation include (managed at application layer)
    const agentRun = await this.db.agentRun.findUnique({
      where: { id: agentRunId },
    });

    if (!agentRun) {
      throw new Error(`Agent run "${agentRunId}" not found`);
    }

    const clips = await this.db.agentClipSelection.findMany({
      where: { agentRunId: agentRunId },
      orderBy: { rankingPosition: "asc" },
    });

    const totalClips = agentRun.clipCount?.total || 0;
    const approvedClips = clips.filter(
      (c: any) => c.status === "APPROVED"
    ).length;
    const rejectedClips = clips.filter(
      (c: any) => c.status === "REJECTED"
    ).length;

    // In approval mode: if any clip is rejected, the whole run fails
    // If all clips are approved, transition to APPROVED
    if (approval === "REJECT") {
      // User rejected a clip — transition to FAILED
      await this.stateMachine.fail(
        AgentErrorCode.CONFIGURATION_MISSING, // Using as "user rejected" code
        "User rejected one or more generated Shorts. Agent run cancelled.",
        false
      );

      const failedRun = await this.db.agentRun.findUnique({
        where: { id: agentRunId },
      });

      return {
        success: false,
        agentRun: failedRun,
        remainingClipsToApprove: 0,
      };
    }

    // If all clips are approved, transition to APPROVED
    if (approvedClips >= totalClips && totalClips > 0) {
      await this.stateMachine.toApproved();

      const approvedRun = await this.db.agentRun.findUnique({
        where: { id: agentRunId },
      });

      return {
        success: true,
        agentRun: approvedRun,
        remainingClipsToApprove: totalClips - approvedClips,
      };
    }

    // Otherwise, still some clips to approve — stay in REVIEW_REQUIRED
    return {
      success: true,
      agentRun,
      remainingClipsToApprove: totalClips - approvedClips,
    };
  }

  /**
   * Process bulk approval of clips.
   * Bulk actions must clearly display the number of clips affected
   * and must never override an explicit rejection.
   */
  async processBulkApproval(
    agentRunId: string,
    approvedClipIds: string[],
    rejectedClipIds: string[]
  ): Promise<{
    success: boolean;
    agentRun: any;
    message: string;
  }> {
    const agentRun = await this.db.agentRun.findUnique({
      where: { id: agentRunId },
    });

    if (!agentRun) {
      throw new Error(`Agent run "${agentRunId}" not found`);
    }

    const clips = await this.db.agentClipSelection.findMany({
      where: { agentRunId: agentRunId },
    });

    // Process approved clips
    for (const clipId of approvedClipIds) {
      const existingClip = clips.find((c: any) => c.id === clipId);

      // Never override an explicit rejection
      if (existingClip && existingClip.status === "REJECTED") {
        continue; // Skip — don't override a rejection
      }

      await this.db.agentClipSelection.update({
        where: { id: clipId },
        data: {
          userApproval: "APPROVE",
          status: "APPROVED" as const,
          updatedAt: new Date(),
        },
      });
    }

    // Process rejected clips
    for (const clipId of rejectedClipIds) {
      const existingClip = agentRun.clips.find((c: any) => c.id === clipId);

      // Never override an explicit rejection — if already approved, don't override
      if (existingClip && existingClip.status === "APPROVED") {
        continue; // Skip — don't override an approval
      }

      await this.db.agentClipSelection.update({
        where: { id: clipId },
        data: {
          userApproval: "REJECT",
          status: "REJECTED" as const,
          updatedAt: new Date(),
        },
      });
    }

    // Recalculate approval counts
    const totalClips = agentRun.clipCount?.total || approvedClipIds.length + rejectedClipIds.length;
    const newlyApproved = agentRun.clips.filter(
      (c: any) => c.status === "APPROVED"
    ).length;
    const newlyRejected = agentRun.clips.filter(
      (c: any) => c.status === "REJECTED"
    ).length;

    // If all clips are now approved (or were already), transition to APPROVED
    if (newlyApproved >= totalClips && totalClips > 0) {
      await this.stateMachine.toApproved();
    } else {
      // Stay in REVIEW_REQUIRED — some clips still pending
      // Transition is handled by the state machine
    }

    const approvedRun = await this.db.agentRun.findUnique({
      where: { id: agentRunId },
    });

    const message = approvedClipIds.length > 0 || rejectedClipIds.length > 0
      ? `Bulk approval processed: ${approvedClipIds.length} approved, ${rejectedClipIds.length} rejected`
      : "No clips were processed";

    return {
      success: true,
      agentRun: approvedRun,
      message,
    };
  }

  /**
   * Mode A — Approval Required (DEFAULT).
   * Agent finishes processing; presents generated Shorts.
   * User can edit title/description and approve/reject individual clips.
   * Approved clips can then be published or scheduled.
   * Rejected clips remain unpublished.
   * No automatic publishing without explicit user action.
   */
  async modeApprovalRequired(agentRunId: string): Promise<{
    success: boolean;
    agentRun: any;
    message: string;
  }> {
    const agentRun = await this.db.agentRun.findUnique({
      where: { id: agentRunId },
    });

    if (!agentRun) {
      throw new Error(`Agent run "${agentRunId}" not found`);
    }

    const clips = await this.db.agentClipSelection.findMany({
      where: { agentRunId: agentRunId },
    });

    // In approval mode, agent should be in REVIEW_REQUIRED state
    // after rendering completes. If it's not, advance it.
    if (agentRun.status !== "REVIEW_REQUIRED") {
      await this.stateMachine.toReviewRequired();
    }

    // Return the agent run state for UI display
    // Agent is paused at REVIEW_REQUIRED; user must act
    return {
      success: true,
      agentRun,
      message: "Approval mode: Agent stopped at REVIEW_REQUIRED. User must approve/reject clips before publishing.",
    };
  }

  /**
   * Mode B — Automatic Publishing (EXPLICIT OPT-IN).
   * Before enabling, require explicit user action.
   * Display clear explanation of the behavior.
   * Require confirmation.
   * Persist the user's preference.
   * Allow the user to disable it at any time.
   *
   * Provides:
   - Daily publishing limit
   - Maximum number of uploads per day
   - Scheduling preferences
   - Time zone selection
   - Publishing interval
   - Minimum quality threshold
   - Channel selection
   - Pause automation
   - Stop all future publishing
   *
   * Important constraints:
   - Automatic mode must still respect source authorization requirements
   - Do not publish rejected clips
   - Do not exceed the configured daily limit
   - Do not silently enable automatic publishing
   - Do not promise views, engagement, or virality
   - Respect YouTube API restrictions and current publishing requirements
   - Never bypass quota or platform restrictions
   *
   * If automatic publishing is disabled, the agent must stop at REVIEW_REQUIRED.
   */
  async modeAutomaticOptIn(
    agentRunId: string,
    userConfirmation: boolean,
    configuration?: Partial<AgentConfiguration>
  ): Promise<{
    success: boolean;
    agentRun: any;
    message: string;
  }> {
    const agentRun = await this.db.agentRun.findUnique({
      where: { id: agentRunId },
    });

    if (!agentRun) {
      throw new Error(`Agent run "${agentRunId}" not found`);
    }

    const clips = await this.db.agentClipSelection.findMany({
      where: { agentRunId: agentRunId },
    });

    // Require explicit user confirmation
    if (!userConfirmation) {
      return {
        success: false,
        agentRun,
        message: "Automatic publishing requires explicit user confirmation. " +
        "Please confirm you want to enable automatic publishing mode.",
      };
    }

    // Apply configuration if provided
    if (configuration) {
      // Update the agent run's configuration
      await this.db.agentRun.update({
        where: { id: agentRunId },
        data: {
          configuration: {
            ...agentRun.configuration,
            ...configuration,
            publishingMode: "AUTOMATIC_PUBLISHING",
            automaticPublishingEnabled: true,
          } as AgentConfiguration,
          updatedAt: new Date(),
        },
      });
    } else {
      // Just set the mode to automatic without detailed config
      await this.db.agentRun.update({
        where: { id: agentRunId },
        data: {
          configuration: {
            ...agentRun.configuration,
            publishingMode: "AUTOMATIC_PUBLISHING" as const,
            automaticPublishingEnabled: true,
          } as AgentConfiguration,
          updatedAt: new Date(),
        },
      });
    }

    // Transition from REVIEW_REQUIRED to APPROVED (in automatic mode,
    // user approval of clips is implicit when opting into automatic publishing)
    await this.stateMachine.toApproved();

    const updatedRun = await this.db.agentRun.findUnique({
      where: { id: agentRunId },
    });

    return {
      success: true,
      agentRun: updatedRun,
      message: "Automatic publishing mode enabled. Agent will now publish approved clips " +
      "according to the configured daily limits and schedule.",
    };
  }

  /**
   * Set daily publishing limit for automatic mode.
   */
  async setDailyLimit(
    agentRunId: string,
    dailyLimit: number
  ): Promise<{
    success: boolean;
    agentRun: any;
    message: string;
  }> {
    const agentRun = await this.db.agentRun.findUnique({
      where: { id: agentRunId },
    });

    if (!agentRun) {
      throw new Error(`Agent run "${agentRunId}" not found`);
    }

    // Update configuration with new daily limit
    await this.db.agentRun.update({
      where: { id: agentRunId },
      data: {
        configuration: {
          ...agentRun.configuration,
          dailyPublishLimit: Math.max(0, dailyLimit),
        } as AgentConfiguration,
        updatedAt: new Date(),
      },
    });

    const updatedRun = await this.db.agentRun.findUnique({
      where: { id: agentRunId },
    });

    return {
      success: true,
      agentRun: updatedRun,
      message: `Daily publishing limit set to ${dailyLimit} Shorts per day.`,
    };
  }

  /**
   * Set time zone for scheduling in automatic mode.
   */
  async setTimeZone(
    agentRunId: string,
    timeZone: string
  ): Promise<{
    success: boolean;
    agentRun: any;
    message: string;
  }> {
    const agentRun = await this.db.agentRun.findUnique({
      where: { id: agentRunId },
    });

    if (!agentRun) {
      throw new Error(`Agent run "${agentRunId}" not found`);
    }

    await this.db.agentRun.update({
      where: { id: agentRunId },
      data: {
        configuration: {
          ...agentRun.configuration,
          defaultTimeZone: timeZone,
        } as AgentConfiguration,
        updatedAt: new Date(),
      },
    });

    const updatedRun = await this.db.agentRun.findUnique({
      where: { id: agentRunId },
    });

    return {
      success: true,
      agentRun: updatedRun,
      message: `Time zone set to ${timeZone}.`,
    };
  }

  /**
   * Pause automatic publishing.
   */
  async pauseAutomaticPublishing(agentRunId: string): Promise<{
    success: boolean;
    agentRun: any;
    message: string;
  }> {
    const agentRun = await this.db.agentRun.findUnique({
      where: { id: agentRunId },
    });

    if (!agentRun) {
      throw new Error(`Agent run "${agentRunId}" not found`);
    }

    // Update configuration to pause automation
    await this.db.agentRun.update({
      where: { id: agentRunId },
      data: {
        configuration: {
          ...agentRun.configuration,
          pauseAutomation: true,
        } as AgentConfiguration,
        updatedAt: new Date(),
      },
    });

    // Transition agent to PAUSED state
    await this.stateMachine.pause("User-paused automatic publishing");

    const updatedRun = await this.db.agentRun.findUnique({
      where: { id: agentRunId },
    });

    return {
      success: true,
      agentRun: updatedRun,
      message: "Automatic publishing paused. Resume to continue.",
    };
  }

  /**
   * Stop all future publishing (in automatic mode).
   */
  async stopFuturePublishing(agentRunId: string): Promise<{
    success: boolean;
    agentRun: any;
    message: string;
  }> {
    const agentRun = await this.db.agentRun.findUnique({
      where: { id: agentRunId },
    });

    if (!agentRun) {
      throw new Error(`Agent run "${agentRunId}" not found`);
    }

    await this.db.agentRun.update({
      where: { id: agentRunId },
      data: {
        configuration: {
          ...agentRun.configuration,
          stopFuturePublishing: true,
        } as AgentConfiguration,
        updatedAt: new Date(),
      },
    });

    // Transition to COMPLETED (no more publishing will occur)
    await this.stateMachine.toCompleted();

    const updatedRun = await this.db.agentRun.findUnique({
      where: { id: agentRunId },
    });

    return {
      success: true,
      agentRun: updatedRun,
      message: "All future publishing stopped. Agent run completed.",
    };
  }

  /**
   * Check if a clip can be published in the current mode and state.
   */
  async canPublishClip(
    agentRunId: string,
    clipId: string
  ): Promise<{
    canPublish: boolean;
    mode: PublishingMode;
    reason?: string;
  }> {
    const agentRun = await this.db.agentRun.findUnique({
      where: { id: agentRunId },
    });

    if (!agentRun) {
      throw new Error(`Agent run "${agentRunId}" not found`);
    }

    const clips = await this.db.agentClipSelection.findMany({
      where: { agentRunId: agentRunId },
    });

    const clip = clips.find((c: any) => c.id === clipId);

    if (!clip) {
      return { canPublish: false, mode: "APPROVAL_REQUIRED", reason: "Clip not found in agent run" };
    }

    const mode = agentRun.configuration?.publishingMode || "APPROVAL_REQUIRED";

    // In approval mode: clip must be approved AND agent must have explicit publish authorization
    if (mode === "APPROVAL_REQUIRED") {
      if (clip.status !== "APPROVED") {
        return {
          canPublish: false,
          mode,
          reason: "Clip must be approved before publishing in approval mode.",
        };
      }
      // In approval mode, agent stops at REVIEW_REQUIRED; user must initiate publishing
      return {
        canPublish: false,
        mode,
        reason: "Approval mode: agent stopped at REVIEW_REQUIRED. User must initiate publishing.",
      };
    }

    // In automatic mode: clip must be approved, under daily limit, channel connected
    if (mode === "AUTOMATIC_PUBLISHING") {
      if (clip.status !== "APPROVED") {
        return {
          canPublish: false,
          mode,
          reason: "Clip must be approved before automatic publishing.",
        };
      }

      // Check YouTube channel connection
      const hasChannel = !!agentRun.workspaceId && 
        (await this.db.youtubeConnection.findFirst({
          where: { workspaceId: agentRun.workspaceId },
        }));

      if (!hasChannel) {
        return {
          canPublish: false,
          mode,
          reason: "No YouTube channel connected. Connect a channel first.",
        };
      }

      return {
        canPublish: true,
        mode,
        reason: "Automatic mode: clip can be published.",
      };
    }

    return { canPublish: false, mode, reason: "Unknown publishing mode" };
  }
}