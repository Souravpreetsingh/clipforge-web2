/**
 * ClipForge AI — Phase 4 Provider-Independent AI Service Layer
 *
 * Unified interface for AI provider calls. All providers must implement
 * this interface so they can be changed without rewriting the application.
 *
 * Provider capabilities:
 * - Speech-to-text transcription with timestamps
 - Transcript summarization
 * - Highlight scoring
 * - Clip title generation
 * - Hook generation
 *
 * Provider selection is configured via AI_PROVIDER environment variable.
 * When no API key is configured, the system falls back to controlled mocks.
 */

// ============================================================
// PROVIDER INTERFACE
// ============================================================

/**
 * Transcription result from AI provider
 */
export interface TranscriptionResult {
  fullText: string; // Full recognized text
  segments: TranscriptionSegment[]; // Timestamped segments
  language: string; // Detected language code
  duration: number; // Audio duration in seconds
  provider: string; // Provider name (e.g., "openai", "assemblyai")
  model: string; // Model used (e.g., "whisper-1")
  confidence?: number; // Overall confidence (0-1, if provided)
}

/**
 * Individual transcription segment
 */
export interface TranscriptionSegment {
  id: string;
  text: string; // Recognized text
  start: number; // Start time in seconds (float)
  end: number; // End time in seconds (float)
  speaker?: string; // Optional speaker label
  confidence?: number; // Segment-level confidence (0-1)
}

/**
 * Highlight candidate result from AI analysis
 */
export interface HighlightCandidate {
  start: number; // Start time in seconds
  end: number; // End time in seconds
  duration: number; // Duration in seconds
  text: string; // Transcript excerpt
  title?: string; // Suggested title
  hook?: string; // Suggested hook / attention-grabbing phrase
  category: HighlightCategory; // Category of highlight
  scores: HighlightScores; // Individual score components
  overallScore: number; // Composite score (0-1)
  reason?: string; // Human-readable reason for selection
}

/** Categories of highlights */
export type HighlightCategory =
  | "HOOK"
  | "FACT"
  | "EMOTIONAL"
  | "CONCLUSION"
  | "QUESTION_ANSWER"
  | "USEFUL_EXPLANATION";

/** Individual score components for a highlight */
export interface HighlightScores {
  hookStrength: number; // 0-1 how attention-grabbing
  informationValue: number; // 0-1 novel/educational content
  emotionalEngagement: number; // 0-1 expressiveness, passion
  selfContainedContext: number; // 0-1 understandable without external info
  narrativeCompleteness: number; // 0-1 has beginning-middle-end
  replayPotential: number; // 0-1 shareable, memorable
  durationSuitability: number; // 0-1 fits clip duration limits
}

/** Configuration for highlight scoring weights */
export interface HighlightScoringConfig {
  hookStrength: number;
  informationValue: number;
  emotionalEngagement: number;
  selfContainedContext: number;
  narrativeCompleteness: number;
  replayPotential: number;
  durationSuitability: number;
}

/** AI processing run status */
export type AIProcessingStatus =
  | "QUEUED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED";

/** AI run type */
export type AIRunType = "TRANSCRIPTION" | "HIGHLIGHT_ANALYSIS" | "CLIP_RANKING";

/** Provider-specific configuration */
export interface ProviderConfig {
  apiKey?: string;
  model?: string;
  speechTimeout?: number; // max audio duration in seconds
  [key: string]: unknown; // Provider-specific extras
}

/**
 * Unified AI service factory.
 * Returns a configured provider instance based on AI_PROVIDER env var.
 * Falls back to mock provider when no API key is available.
 */
export function createAIService(
  config: ProviderConfig
): AIServiceInterface {
  const provider = process.env.AI_PROVIDER || "mock";

  switch (provider) {
    case "openai":
      if (!config.apiKey) {
        console.warn(
          "AI_PROVIDER=openai configured but OPENAI_API_KEY not set. " +
          "Falling back to mock provider."
        );
        return createMockService();
      }
      return new OpenAIService(config);

    case "assemblyai":
      if (!config.apiKey) {
        console.warn(
          "AI_PROVIDER=assemblyai configured but ASSEMBLYAI_API_KEY not set. " +
          "Falling back to mock provider."
        );
        return createMockService();
      }
      return new AssemblyAIService(config);

    case "mock":
    default:
      return createMockService();
  }
}

/**
 * Unified AI service interface — all providers must implement this.
 */
export interface AIServiceInterface {
  transcribe(audioPath: string, language?: string): Promise<TranscriptionResult>;
  analyzeHighlights(
    transcript: TranscriptionResult,
    config?: HighlightScoringConfig
  ): Promise<HighlightCandidate[]>;
  generateClipTitle(transcriptExcerpt: string, context?: string): Promise<string>;
  generateHook(transcriptExcerpt: string, context?: string): Promise<string>;
  getProviderName(): string;
  getModelName(): string;
}

/** Mock implementation for development without API keys */