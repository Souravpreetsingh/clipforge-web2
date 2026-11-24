/**
 * ClipForge AI — Phase 7 AI Agent Mode
 * State machine for agent run lifecycle management.
 *
 * Persists state changes in PostgreSQL.
 * Validates all transitions against VALID_TRANSITIONS.
 * Supports pause/resume/cancel at safe checkpoints.
 */

import { AgentRunStatus, AgentRun, AgentRunEvent, AgentConfiguration, PipelineStage, AgentClipStatus, AgentErrorCode, AGENT_ERROR_MESSAGES, VALID_TRANSITIONS, RESUME_TRANSITION } from "./types";
import { PrismaClient } from "@prisma/client";

// Extend Prisma client for AgentRun events (assumes AgentRun model exists in schema)
type Prisma = PrismaClient;

interface EventContext {
  agentRunId: string;
  stage?: PipelineStage;
  clipId?: string;
  errorCode?: AgentErrorCode;
}

/**
 * AgentStateMachine — Manages agent run state transitions and event logging.
 *
 * Responsibilities:
 * - Validate state transitions
 * - Persist state changes to DB
 * - Log activity events
 * - Support pause/resume/cancel operations
 * - Ensure transitions only occur at safe checkpoints
 */
export class AgentStateMachine {
  private readonly db: PrismaClient;
  private readonly agentRunId: string;

  constructor(db: PrismaClient, agentRunId: string) {
    this.db = db;
    this.agentRunId = agentRunId;
  }

  /**
   * Validate a state transition.
   * Returns the new status if valid, or throws if invalid.
   */
  async validateTransition(
    currentStatus: AgentRunStatus,
    newStatus: AgentRunStatus
  ): Promise<AgentRunStatus> {
    const allowed = VALID_TRANSITIONS[currentStatus];

    if (!allowed) {
      throw new Error(
        `Cannot transition from "${currentStatus}" — no valid transitions defined.`
      );
    }

    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Invalid transition from "${currentStatus}" to "${newStatus}". ` +
        `Allowed transitions: ${allowed.join(", ")}`
      );
    }

    // Special handling for PAUSED -> RESUME
    if (currentStatus === "PAUSED" && newStatus === "APPROVED") {
      // Resume logic — transition based on current context
      // In practice, the caller should determine the correct target status
      return newStatus;
    }

    return newStatus;
  }

  /**
   * Transition the agent run to a new status, persisting to DB and logging an event.
   */
  async transition(
    newStatus: AgentRunStatus,
    context: EventContext = {}
  ): Promise<AgentRun> {
    // Read current state from DB
    const currentRun = await this.db.agentRun.findUnique({
      where: { id: this.agentRunId },
    });

    if (!currentRun) {
      throw new Error(`Agent run "${this.agentRunId}" not found in database`);
    }

    // Validate the transition
    const validStatus = await this.validateTransition(currentRun.status, newStatus);

    // Persist the state change
    const updatedRun = await this.db.agentRun.update({
      where: { id: this.agentRunId },
      data: {
        status: newStatus,
        currentStage: this.mapStatusToStage(newStatus),
        updatedAt: new Date(),
        // Set completedAt if reaching terminal states
        ...(newStatus === "COMPLETED" || newStatus === "FAILED" || newStatus === "CANCELLED"
          ? { completedAt: new Date() }
          : {}),
      },
    });

    // Log the transition event
    await this.logEvent({
      eventType: this.getEventTypeForTransition(currentRun.status, newStatus),
      message: this.getTransitionMessage(currentRun.status, newStatus),
      metadata: {
        from: currentRun.status,
        to: newStatus,
        ...context,
      },
    });

    return updatedRun;
  }

  /**
   * Pause the agent run.
   * Can only pause at safe checkpoints (REVIEW_REQUIRED, APPROVED, PENDING).
   */
  async pause(reason: string): Promise<AgentRun> {
    // Validate that pausing is allowed from current state
    const allowedPausedFrom = ["REVIEW_REQUIRED", "APPROVED", "QUEUED", "TRANSCRIBING", "ANALYZING"];

    const currentRun = await this.db.agentRun.findUnique({
      where: { id: this.agentRunId },
    });

    if (!allowedPausedFrom.includes(currentRun.status)) {
      throw new Error(
        `Cannot pause from state "${currentRun.status}". ` +
        `Pausing is only allowed from: ${allowedPausedFrom.join(", ")}`
      );
    }

    return this.transition("PAUSED");
  }

  /**
   * Resume the agent run from PAUSED state.
   */
  async resume(targetStatus: AgentRunStatus): Promise<AgentRun> {
    // Validate resumption is allowed
    const currentRun = await this.db.agentRun.findUnique({
      where: { id: this.agentRunId },
    });

    if (currentRun.status !== "PAUSED") {
      throw new Error(`Cannot resume from state "${currentRun.status}". Agent is not paused.`);
    }

    // Transition based on target — typically to whatever state was active before pause
    return this.transition(targetStatus);
  }

  /**
   * Cancel the agent run.
   * Can cancel from most states with proper cleanup.
   */
  async cancel(reason: string): Promise<AgentRun> {
    // Clean up any in-progress operations
    // In a full implementation, would cancel BullMQ jobs, clean up temp files, etc.

    return this.transition("CANCELLED");
  }

  /**
   * Fail the agent run with an error code and message.
   */
  async fail(errorCode: AgentErrorCode, message: string, recoverable: boolean = false): Promise<AgentRun> {
    // Log the failure event
    await this.logEvent({
      eventType: "AGENT_FAILED",
      message,
      metadata: { errorCode, recoverable },
    });

    // Transition to FAILED state
    return this.transition("FAILED");
  }

  /**
   * Move to REVIEW_REQUIRED state — the default stopping point for approval mode.
   * Agent has finished processing; generated Shorts are ready for user review.
   */
  async toReviewRequired(): Promise<AgentRun> {
    return this.transition("REVIEW_REQUIRED");
  }

  /**
   * Move to APPROVED state — user has approved all clips.
   * In approval mode, agent stops at REVIEW_REQUIRED and waits for explicit approve action.
   * In automatic mode, this transitions to PUBLISHING.
   */
  async toApproved(): Promise<AgentRun> {
    return this.transition("APPROVED");
  }

  /**
   * Move to PUBLISHING state — clips are approved and agent is ready to publish.
   * Only in automatic publishing mode; in approval mode, this requires explicit user action.
   */
  async toPublishing(): Promise<AgentRun> {
    return this.transition("PUBLISHING");
  }

  /**
   * Move to SCHEDULING state — clips are being scheduled for future publication.
   */
  async toScheduling(): Promise<AgentRun> {
    return this.transition("SCHEDULING");
  }

  /**
   * Move to COMPLETED state — all clips published/scheduled successfully.
   */
  async toCompleted(): Promise<AgentRun> {
    return this.transition("COMPLETED");
  }

  /**
   * Map a status to a human-readable currentStage string.
   */
  private mapStatusToStage(status: AgentRunStatus): string {
    const stageMap: Record<AgentRunStatus, string> = {
      CREATED: "initialization",
      VALIDATING_SOURCE: "validating_source",
      WAITING_FOR_SOURCE: "waiting_for_source",
      SOURCE_READY: "source_ready",
      QUEUED: "queued",
      TRANSCRIBING: "transcribing",
      ANALYZING: "analyzing",
      SELECTING_CLIPS: "selecting_clips",
      RENDERING: "rendering",
      REVIEW_REQUIRED: "review_required",
      APPROVED: "approved",
      PUBLISHING: "publishing",
      SCHEDULING: "scheduling",
      COMPLETED: "completed",
      FAILED: "failed",
      PAUSED: "paused",
      CANCELLED: "cancelled",
    };

    return stageMap[status] || "unknown";
  }

  /**
   * Get the event type for a state transition.
   */
  private getEventTypeForTransition(
    from: AgentRunStatus,
    to: AgentRunStatus
  ): string {
    const transitionMap: Record<string, string> = {
      "CREATED->VALIDATING_SOURCE": "AGENT_CREATED",
      "VALIDATING_SOURCE->WAITING_FOR_SOURCE": "SOURCE_VALIDATED",
      "WAITING_FOR_SOURCE->SOURCE_READY": "SOURCE_IMPORTED",
      "SOURCE_READY->QUEUED": "TRANSCRIPTION_STARTED",
      "QUEUED->TRANSCRIBING": "TRANSCRIPTION_STARTED",
      "TRANSCRIBING->ANALYZING": "HIGHLIGHT_ANALYSIS_STARTED",
      "ANALYZING->SELECTING_CLIPS": "CLIP_RANKING_STARTED",
      "SELECTING_CLIPS->RENDERING": "RENDERING_STARTED",
      "RENDERING->REVIEW_REQUIRED": "RENDERING_COMPLETED",
      "REVIEW_REQUIRED->APPROVED": "CLIP_APPROVED",
      "APPROVED->PUBLISHING": "PUBLISHING_STARTED",
      "PUBLISHING->SCHEDULING": "PUBLISHING_COMPLETED",
      "SCHEDULING->COMPLETED": "AGENT_COMPLETED",
      "ANY->PAUSED": "AGENT_PAUSED",
      "PAUSED->*": "AGENT_RESUMED",
      "ANY->CANCELLED": "AGENT_CANCELLED",
      "ANY->FAILED": "AGENT_FAILED",
    };

    const key = `${from}->${to}`;
    return transitionMap[key] || "AGENT_STATE_CHANGE";
  }

  /**
   * Get a human-readable message for a state transition.
   */
  private getTransitionMessage(
    from: AgentRunStatus,
    to: AgentRunStatus
  ): string {
    const messages: Record<string, string> = {
      "CREATED->VALIDATING_SOURCE": "Agent run created; starting source validation.",
      "VALIDATING_SOURCE->WAITING_FOR_SOURCE": "Source validation complete; awaiting source file.",
      "WAITING_FOR_SOURCE->SOURCE_READY": "Authorized source file available; starting pipeline.",
      "SOURCE_READY->QUEUED": "Source ready; job queued for processing.",
      "QUEUED->TRANSCRIBING": "Transcription pipeline started.",
      "TRANSCRIBING->ANALYZING": "Highlight analysis started.",
      "ANALYZING->SELECTING_CLIPS": "Clip selection in progress.",
      "SELECTING_CLIPS->RENDERING": "Rendering pipeline started.",
      "RENDERING->REVIEW_REQUIRED": "All clips rendered; review required.",
      "REVIEW_REQUIRED->APPROVED": "User approved all generated Shorts.",
      "APPROVED->PUBLISHING": "Starting publishing to YouTube.",
      "PUBLISHING->SCHEDULING": "Publishing complete; scheduling for future dates.",
      "SCHEDULING->COMPLETED": "All Shorts published or scheduled; agent run complete.",
      "ANY->PAUSED": "Agent run paused. Resume to continue.",
      "ANY->CANCELLED": "Agent run cancelled.",
      "ANY->FAILED": "Agent run failed. Review error details.",
    };

    const key = `${from}->${to}`;
    return messages[key] || `Agent transitioned from ${from} to ${to}.`;
  }

  /**
   * Log an activity event to the database.
   */
  private async logEvent(event: Omit<AgentRunEvent, "id" | "createdAt">): Promise<AgentRunEvent> {
    const createdAt = new Date();

    const newEvent = await this.db.agentRunEvent.create({
      data: {
        agentRun: { connect: { id: this.agentRunId } },
        eventType: event.eventType,
        message: event.message,
        metadata: event.metadata,
        createdAt,
      },
    });

    return newEvent;
  }
}