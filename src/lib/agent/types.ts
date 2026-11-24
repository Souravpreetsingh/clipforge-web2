/**
 * ClipForge AI — Phase 7 AI Agent Mode
 * Type definitions for agent orchestration engine.
 *
 * All types are workspace-scoped and enforce ownership boundaries.
 * State machine is persisted in PostgreSQL via Prisma.
 */

// ============================================================
// AGENT RUN STATE MACHINE
// ============================================================

/**
 * AgentRunStatus — Valid states an agent run can be in.
 * Transitions are validated by the state machine.
 */
export type AgentRunStatus =
  | "CREATED"
  | "VALIDATING_SOURCE"
  | "WAITING_FOR_SOURCE"
  | "SOURCE_READY"
  | "QUEUED"
  | "TRANSCRIBING"
  | "ANALYZING"
  | "SELECTING_CLIPS"
  | "RENDERING"
  | "REVIEW_REQUIRED"
  | "APPROVED"
  | "PUBLISHING"
  | "SCHEDULING"
  | "COMPLETED"
  | "PAUSED"
  | "CANCELLED"
  | "FAILED";

/**
 * AgentRunType — Type of agent execution.
 */
export type AgentRunType = "YOUTUBE_SHORTS" | "USER_UPLOAD" | "IMPORTED_ASSET";

/**
 * PublishingMode — Agent publishing mode configuration.
 * ApprovalRequired is the DEFAULT; Automatic is EXPLICIT OPT-IN.
 */
export type PublishingMode = "APPROVAL_REQUIRED" | "AUTOMATIC_PUBLISHING";

/**
 * AgentClipStatus — Status of individual clips within an agent run.
 */
export type AgentClipStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "PUBLISHED"
  | "SCHEDULED"
  | "FAILED";

/**
 * AgentConfiguration — Per-workspace agent settings.
 */
export interface AgentConfiguration {
  /** Publishing mode: APPROVAL_REQUIRED (default) or AUTOMATIC_PUBLISHING */
  publishingMode: PublishingMode;

  /** Daily publishing limit (0 = unlimited, but approval mode still applies) */
  dailyPublishLimit: number;

  /** Minimum quality threshold for clip selection (0-1) */
  minQualityThreshold: number;

  /** Default time zone for scheduling (IANA format, e.g., "America/New_York") */
  defaultTimeZone: string;

  /** Interval between Shorts publishing (minutes) */
  publishIntervalMinutes: number;

  /** Whether automatic publishing is explicitly enabled */
  automaticPublishingEnabled: boolean;

  /** Channel selection - which connected YouTube channel to use */
  defaultChannelId?: string;

  /** Pause automation flag */
  pauseAutomation: boolean;

  /** Stop all future publishing flag */
  stopFuturePublishing: boolean;
}

// ============================================================
// AGENT RUN INTERFACE
// ============================================================

/**
 * AgentRun — Core agent execution record.
 * Persisted in PostgreSQL; state transitions tracked over time.
 */
export interface AgentRun {
  id: string; // CUID-based primary key
  workspaceId: string;
  userId?: string; // Optional: if user authentication is added later
  runType: AgentRunType;
  source?: {
    /** YouTube video URL that was submitted */
    youtubeUrl?: string;
    /** Whether source authorization was confirmed */
    sourceAuthorized: boolean;
    /** Attestation timestamp */
    attestationTimestamp?: Date;
    /** Source reference (workspace + asset ID if imported) */
    sourceReference?: string;
  };
  configuration: AgentConfiguration;
  status: AgentRunStatus;
  currentStage: string; // Human-readable current stage
  progress: number; // 0-100 percentage
  startedAt: Date;
  completedAt?: Date;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
  clipCount?: {
    total: number; // Target number of Shorts (max 6)
    generated: number; // Number of clips generated through rendering
    approved: number; // Number of clips approved by user
    published: number; // Number of clips published to YouTube
    scheduled: number; // Number of clips scheduled for future publication
    failed: number; // Number of clips that failed
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AgentRunEvent — Activity timeline event for an agent run.
 * Every meaningful action produces an event.
 */
export interface AgentRunEvent {
  id: string; // CUID-based primary key
  agentRunId: string;
  eventType: "AGENT_CREATED" | "SOURCE_VALIDATED" | "SOURCE_IMPORTED" |
           "TRANSCRIPTION_STARTED" | "TRANSCRIPTION_COMPLETED" |
           "HIGHLIGHT_ANALYSIS_STARTED" | "HIGHLIGHT_ANALYSIS_COMPLETED" |
           "CLIP_RANKING_STARTED" | "CLIP_RANKING_COMPLETED" |
           "RENDERING_STARTED" | "RENDERING_COMPLETED" |
           "REVIEW_OPENED" | "CLIP_APPROVED" | "CLIP_REJECTED" |
           "PUBLISHING_STARTED" | "PUBLISHING_COMPLETED" |
           "PUBLISHING_FAILED" | "SCHEDULING_STARTED" | "SCHEDULING_COMPLETED" |
           "AGENT_PAUSED" | "AGENT_RESUMED" | "AGENT_CANCELLED" |
           "AGENT_FAILED";
  message: string;
  metadata?: { [key: string]: any };
  createdAt: Date;
}

/**
 * AgentClipSelection — Individual clip selection within an agent run.
 * Tracks which highlights were selected for rendering.
 */
export interface AgentClipSelection {
  id: string; // CUID-based primary key
  agentRunId: string;
  highlightCandidateId?: string; // FK to HighlightCandidate if linked
  generatedClipId?: string; // FK to GeneratedClip if rendered
  rankingPosition: number; // 1-based rank (1 = best clip)
  startTimestamp: number; // Start time in seconds (source-relative)
  endTimestamp: number; // End time in seconds (source-relative)
  duration: number; // Duration in seconds
  suggestedTitle: string;
  suggestedDescription: string;
  highlightCategory: "HOOK" | "FACT" | "EMOTIONAL" | "CONCLUSION" | "QUESTION_ANSWER" | "USEFUL_EXPLANATION";
  overallScore: number; // Composite score (0-1)
  qualityScore: number; // Derived quality score
  status: AgentClipStatus;
  userApproval?: "APPROVE" | "REJECT" | null;
  userEditedTitle?: string;
  userEditedDescription?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// SOURCE AUTHORIZATION
// ============================================================

/**
 * SourceAuthorization — User's rights/permission attestation for source video.
 */
export interface SourceAuthorization {
  id: string; // CUID-based primary key
  agentRunId: string;
  workspaceId: string;
  sourceType: "YOUTUBE_URL" | "USER_UPLOAD" | "IMPORTED_ASSET";
  sourceReference: string; // YouTube video ID, R2 key, or asset ID
  sourceAuthorized: boolean;
  attestedBy: string; // User ID or "system"
  attestationTimestamp: Date;
  permissionStatement?: string; // User's written statement
  workspaceScope: "current" | "all"; // Workspace scope for the authorization
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================================//
// PIPELINE STAGE STATE
// ============================================================

/**
 * PipelineStage — Agent pipeline stages (A through G).
 * Each stage transition is validated by the orchestrator.
 */
export enum PipelineStage {
  /** Stage A: Source validation - YouTube URL validation + authorization */
  SOURCE_VALIDATION = "SOURCE_VALIDATION",

  /** Stage B: Media ingestion - Source file stored in R2 + VideoAsset created */
  MEDIA_INGESTION = "MEDIA_INGESTION",

  /** Stage C: AI transcription - Audio extraction + AI provider transcription */
  TRANSCRIPTION = "TRANSCRIPTION",

  /** Stage D: Highlight detection - 7-dimension scoring + candidate generation */
  HIGHLIGHT_ANALYSIS = "HIGHLIGHT_ANALYSIS",

  /** Stage E: Clip selection - Rank + deduplicate + select up to 6 */
  CLIP_SELECTION = "CLIP_SELECTION",

  /** Stage F: Shorts rendering - Vertical 9:16 FFmpeg rendering pipeline */
  RENDERING = "RENDERING",

  /** Stage G: Publishing preparation - Metadata generation + YouTube quota check */
  PUBLISHING_PREPARATION = "PUBLISHING_PREPARATION",
}

// ==========================================================//
// VALID STATE TRANSITIONS
// ============================================================

/**
 * Valid state transitions for the agent run state machine.
 * Defines which transitions are allowed from each state.
 */
export const VALID_TRANSITIONS: Record<AgentRunStatus, AgentRunStatus[]> = {
  // Initial state
  CREATED: ["VALIDATING_SOURCE"],

  // Source validation phase
  VALIDATING_SOURCE: ["WAITING_FOR_SOURCE", "FAILED"],

  // Source waiting phase
  WAITING_FOR_SOURCE: ["SOURCE_READY", "CANCELLED"],

  // Source ready - enter processing pipeline
  SOURCE_READY: ["QUEUED"],

  // Queued - waiting for BullMQ worker
  QUEUED: ["TRANSCRIBING", "CANCELLED"],

  // Processing pipeline stages (linear progression)
  TRANSCRIBING: ["ANALYZING", "FAILED"],
  ANALYZING: ["SELECTING_CLIPS", "FAILED"],
  SELECTING_CLIPS: ["RENDERING", "REVIEW_REQUIRED", "FAILED"],
  RENDERING: ["REVIEW_REQUIRED", "FAILED"],

  // Review mode - user approval required (DEFAULT)
  REVIEW_REQUIRED: ["APPROVED", "PAUSED", "CANCELLED"],

  // Approved - move to publishing
  APPROVED: ["PUBLISHING", "PAUSED", "CANCELLED"],

  // Publishing mode
  PUBLISHING: ["SCHEDULING", "FAILED", "PAUSED"],
  SCHEDULING: ["COMPLETED", "FAILED", "PAUSED"],

  // Terminal states
  COMPLETED: [],
  FAILED: ["PAUSED", "CANCELLED"],
  PAUSED: ["RESUME", "CANCELLED"], // RESUME is handled specially
  CANCELLED: [],
};

/**
 * RESUME transition - when pausing is lifted
 */
export const RESUME_TRANSITION: AgentRunStatus = "APPROVED"; // Resume from approved state, or transition based on current state

// ==========================================================//
// ERROR CODES
// ============================================================

/** Agent-specific error codes */
export enum AgentErrorCode {
  YT_URL_INVALID = "AGENT-URL-001",     // Invalid YouTube URL format
  YT_URL_UNSUPPORTED = "AGENT-URL-002", // Unsupported YouTube host
  YT_PERMISSION_DENIED = "AGENT-AUTH-003", // Source authorization failed
  YT_CONNECTION_MISSING = "AGENT-AUTH-004", // No YouTube channel connected
  YT_QUOTA_EXCEEDED = "AGENT-QUOTA-001", // Daily quota exceeded
  YT_NETWORK_ERROR = "AGENT-NET-001", // Network error during API calls
  AI_TRANSCRIPTION_FAILED = "AGENT-AI-001", // AI transcription pipeline failed
  AI_HIGHlight_ANALYSIS_FAILED = "AGENT-AI-002", // Highlight analysis failed
  RENDERING_FAILED = "AGENT-RENDER-001", // FFmpeg rendering failed
  CLIPS_EXCEEDED_MAX = "AGENT-CLIPS-001", // Attempted to generate >6 clips
  DUPLICATE_RUN = "AGENT-STATE-001", // Duplicate agent run detected
  IDempotencyViolation = "AGENT-STATE-002", // Non-idempotent operation attempted
  CONFIGURATION_MISSING = "AGENT-CONF-001", // Required config not set
}

// User-friendly error messages mapped from error codes
export const AGENT_ERROR_MESSAGES: Record<AgentErrorCode, string> = {
  [AgentErrorCode.YT_URL_INVALID]: "The YouTube URL provided is not valid. Please check the format and try again.",
  [AgentErrorCode.YT_URL_UNSUPPORTED]: "This YouTube URL format is not supported. Supported formats: youtube.com/watch?v=VIDEO_ID, youtu.be/VIDEO_ID, youtube.com/shorts/VIDEO_ID.",
  [AgentErrorCode.YT_PERMISSION_DENIED]: "You must confirm you own this video or have permission to reuse it before the agent can start.",
  [AgentErrorCode.YT_CONNECTION_MISSING]: "No YouTube channel is connected. Please connect your YouTube channel first.",
  [AgentErrorCode.YT_QUOTA_EXCEEDED]: "Daily YouTube API quota exceeded. The agent will pause and retry tomorrow.",
  [AgentErrorCode.YT_NETWORK_ERROR]: "A network error occurred. The agent will retry automatically.",
  [AgentErrorCode.AI_TRANSCRIPTION_FAILED]: "AI transcription failed. The agent will retry with the source file.",
  [AgentErrorCode.AI_HIGHlight_ANALYSIS_FAILED]: "Highlight analysis failed. The agent will attempt with available transcript data.",
  [AgentErrorCode.RENDERING_FAILED]: "Video rendering failed. The agent will retry the rendering job.",
  [AgentErrorCode.CLIPS_EXCEEDED_MAX]: "Maximum of 6 Shorts per source video. Fewer clips will be generated based on quality.",
  [AgentErrorCode.DUPLICATE_RUN]: "An agent run for this source already exists. Please check your agent runs.",
  [AgentErrorCode.IDempotencyViolation]: "Cannot perform this operation - it would violate idempotency. Please check the current agent run state.",
  [AgentErrorCode.CONFIGURATION_MISSING]: "Agent configuration is incomplete. Please contact support or configure required settings.",
};

// ==========================================================//
// HELPER TYPES
// ============================================================

/** Progress update for pipeline stages */
export interface PipelineProgress {
  stage: PipelineStage;
  percentage: number; // 0-100
  message: string;
  etaSeconds?: number;
}

/** Clip quality breakdown for display */
export interface ClipQualityBreakdown {
  overallScore: number; // 0-1
  hookStrength: number; // 0-1
  informationValue: number; // 0-1
  emotionalEngagement: number; // 0-1
  selfContainedContext: number; // 0-1
  narrativeCompleteness: number; // 0-1
  replayPotential: number; // 0-1
  durationSuitability: number; // 0-1
}

/** Publishing result for a single clip */
export interface ClipPublishResult {
  success: boolean;
  youtubeVideoId?: string;
  privacyStatus: "public" | "private" | "unlisted";
  scheduledAt?: Date;
  error?: string;
  errorCode?: AgentErrorCode;
}