/**
 * ClipForge AI — Phase 4 Mock AI Provider
 *
 * Controlled mock implementation for development and testing without API keys.
 * Returns deterministic, well-formed responses that integrate seamlessly
 * with the rest of the pipeline.
 *
 * Never sends actual HTTP requests. Always returns mock data with
 * consistent shape matching the AIServiceInterface contract.
 *
 * When AI_MOCK_MODE=true (default when no API key configured),
 * all AI calls route through this provider.
 */

import { AIServiceInterface, TranscriptionResult, TranscriptionSegment, HighlightCandidate, HighlightCategory, HighlightScores, AIProcessingStatus, AIRunType, ProviderConfig } from "./provider";

// ============================================================
// MOCK TRANSCRIPTION RESULT
// ============================================================

/**
 * Default mock transcription result for a typical long-form video.
 * Used when no API key is configured and AI_MOCK_MODE=true.
 * Segments have realistic timing, varying lengths, and mix of content types.
 */

const defaultMockTranscript: TranscriptionResult = {
  fullText:
    "Hello and welcome to today's discussion about content creation. In this video, we're going to talk about how to create engaging short-form content for social media platforms. The first thing we need to understand is your audience and what type of content resonates with them. Many creators make the mistake of posting without a clear strategy. Today we'll cover the key elements of a successful content strategy including audience research, content planning, and optimization techniques. One of the most important aspects is understanding what makes a video go viral. We'll look at some examples and break down why they worked. Let's start with the basics. Understanding your target audience is crucial before you create any content. You need to know who they are what they like and what problems they're trying to solve. Without this knowledge you're essentially shooting in the dark. Many successful creators spend as much time researching their audience as they do creating content. Next we'll talk about the hook. The first 10 seconds of your video are the most critical. This is where you grab attention and decide whether viewers stay or leave. A strong hook can be a surprising statement a provocative question or a promise of value. Throughout this video we'll analyze different hook techniques and show you examples. Now let's move into content planning. A solid content plan helps you stay consistent and ensures you're always delivering value. We'll cover how to brainstorm ideas create an editorial calendar and batch produce your videos. Consistency is key in the world of short-form content. Viewers return when they know what to expect from you. Now an interesting fact about the algorithm. The platform's recommendation system favors watch time and engagement. Videos that keep viewers watching until the end tend to perform better. This is why the ending of your video is just as important as the hook. We'll show you how to craft compelling conclusions that leave a lasting impression. Finally questions and answers. Viewers love interactive content. Asking questions throughout your video encourages comments and engagement. This signals to the algorithm that your content is valuable. We'll cover how to naturally integrate questions without disrupting the flow of your narrative. To summarize the key points from today's discussion understanding your audience is the foundation of everything. A strong hook in the first 10 seconds grabs attention. The algorithm rewards high watch time and engagement. Crafting a compelling conclusion is as important as the opening. Interactive questions throughout the video boost comments and signals. ",

  segments: [
    // Opening hook (strong)
    {
      id: "seg-001",
      text: "Hello and welcome to today's discussion about content creation.",
      start: 0.0,
      end: 4.5,
    },
    // Audience research importance
    {
      id: "seg-002",
      text: "The first thing we need to understand is your audience and what type of content resonates with them.",
      start: 5.0,
      end: 9.0,
    },
    // Mistake of posting without strategy
    {
      id: "seg-003",
      text: "Many creators make the mistake of posting without a clear strategy.",
      start: 9.5,
      end: 11.5,
    },
    // Content strategy elements
    {
      id: "seg-004",
      text: "Today we'll cover the key elements of a successful content strategy including audience research, content planning, and optimization techniques.",
      start: 12.0,
      end: 17.0,
    },
    // Viral question
    {
      id: "seg-005",
      text: "One of the most important aspects is understanding what makes a video go viral.",
      start: 17.5,
      end: 20.0,
    },
    // Algorithm info
    {
      id: "seg-006",
      text: "We'll look at some examples and break down why they worked.",
      start: 20.5,
      end: 22.0,
    },
    // Audience research crucial
    {
      id: "seg-007",
      text: "Understanding your target audience is crucial before you create any content.",
      start: 23.0,
      end: 26.0,
    },
    // Shooting in the dark
    {
      id: "seg-008",
      text: "Without this knowledge you're essentially shooting in the dark.",
      start: 26.5,
      end: 28.5,
    },
    // Time research
    {
      id: "seg-009",
      text: "Many successful creators spend as much time researching their audience as they do creating content.",
      start: 29.0,
      end: 33.0,
    },
    // Hook importance
    {
      id: "seg-010",
      text: "The first 10 seconds of your video are the most critical.",
      start: 34.0,
      end: 37.0,
    },
    // Strong hook section
    {
      id: "seg-011",
      text: "A strong hook can be a surprising statement a provocative question or a promise of value.",
      start: 38.0,
      end: 42.0,
    },
    // Algorithm rewards watch time
    {
      id: "seg-012",
      text: "The algorithm rewards high watch time and engagement.",
      start: 43.0,
      end: 46.0,
    },
    // Ending importance
    {
      id: "seg-013",
      text: "This is why the ending of your video is just as important as the hook.",
      start: 47.0,
      end: 50.0,
    },
    // Craft conclusions
    {
      id: "seg-014",
      text: "We'll show you how to craft compelling conclusions that leave a lasting impression.",
      start: 51.0,
      end: 54.0,
    },
    // Interactive questions
    {
      id: "seg-015",
      text: "Viewers love interactive content. Asking questions throughout your video encourages comments and engagement.",
      start: 55.0,
      end: 59.0,
    },
    // Integrate questions
    {
      id: "seg-016",
      text: "We'll cover how to naturally integrate questions without disrupting the flow of your narrative.",
      start: 60.0,
      end: 64.0,
    },
    // Summary opening
    {
      id: "seg-017",
      text: "To summarize the key points from today's discussion understanding your audience is the foundation of everything.",
      start: 65.0,
      end: 68.0,
    },
  ],
  language: "en",
  duration: 90, // 90-second mock video
  provider: "mock",
  model: "mock-whisper",
};

/**
 * Get mock transcription result.
 * In a real implementation, this would call the AI provider's transcription API.
 * For development, returns a deterministic transcript with realistic segments.
 */
export function getMockTranscriptionResult(
  audioDuration?: number
): TranscriptionResult {
  const duration = audioDuration || 90;
  return {
    ...defaultMockTranscript,
    duration,
    fullText: defaultMockTranscript.fullText.substring(0, 500) + "...",
    segments: defaultMockTranscript.segments.map((s, i) => ({
      ...s,
      id: `mock-seg-${i + 1}`,
    })),
  };
}

/**
 * Get mock highlight candidates from a transcription result.
 * Returns 5-6 candidates spanning different categories with realistic scores.
 */
export function getMockHighlightCandidates(
  transcript: TranscriptionResult
): HighlightCandidate[] {
  const candidates: HighlightCandidate[] = [];

  // Find key segment indices for each category
  const hookSegment = transcript.segments.find(
    (s) => s.text.includes("first 10 seconds") || s.text.includes("Hook")
  );
  const audienceSegment = transcript.segments.find(
    (s) => s.text.includes("audience") || s.text.includes("target audience")
  );
  const algorithmSegment = transcript.segments.find(
    (s) => s.text.includes("algorithm") || s.text.includes("watch time")
  );
  const conclusionSegment = transcript.segments.find(
    (s) => s.text.includes("conclusion") || s.text.endsWith("lasting impression")
  );
  const questionSegment = transcript.segments.find(
    (s) => s.text.includes("questions") || s.text.includes("interactive")
  );

  // HOOK candidate — opening of video
  if (hookSegment) {
    candidates.push({
      start: hookSegment.start,
      end: Math.min(hookSegment.end, hookSegment.start + 8),
      duration: Math.min(8, hookSegment.end - hookSegment.start),
      text: hookSegment.text.substring(0, 120),
      title: "Start with a Strong Hook",
      hook: hookSegment.text.substring(0, 60) + "...",
      category: "HOOK",
      scores: {
        hookStrength: 0.85,
        informationValue: 0.40,
        emotionalEngagement: 0.30,
        selfContainedContext: 0.90,
        narrativeCompleteness: 0.70,
        replayPotential: 0.80,
        durationSuitability: 0.95,
      },
      overallScore: 0.68,
      reason: "Strong opening that grabs viewer attention in first 10 seconds",
    });
  }

  // FACT candidate — algorithm information
  if (algorithmSegment) {
    candidates.push({
      start: algorithmSegment.start,
      end: Math.min(algorithmSegment.end, algorithmSegment.start + 10),
      duration: Math.min(10, algorithmSegment.end - algorithmSegment.start),
      text: algorithmSegment.text.substring(0, 120),
      title: "The Algorithm Secret",
      hook: "Did you know the algorithm rewards watch time?",
      category: "FACT",
      scores: {
        hookStrength: 0.60,
        informationValue: 0.90,
        emotionalEngagement: 0.25,
        selfContainedContext: 0.85,
        narrativeCompleteness: 0.80,
        replayPotential: 0.75,
        durationSuitability: 0.90,
      },
      overallScore: 0.62,
      reason: "Valuable algorithm insight that viewers likely didn't know",
    });
  }

  // EMOTIONAL candidate — engagement focus
  if (questionSegment) {
    candidates.push({
      start: questionSegment.start,
      end: Math.min(questionSegment.end, questionSegment.start + 7),
      duration: Math.min(7, questionSegment.end - questionSegment.start),
      text: questionSegment.text.substring(0, 120),
      title: "Ask Questions to Boost Engagement",
      hook: "Viewers love interactive content",
      category: "EMOTIONAL",
      scores: {
        hookStrength: 0.70,
        informationValue: 0.55,
        emotionalEngagement: 0.80,
        selfContainedContext: 0.95,
        narrativeCompleteness: 0.85,
        replayPotential: 0.90,
        durationSuitability: 0.90,
      },
      overallScore: 0.71,
      reason: "Interactive elements boost comments and algorithm signals",
    });
  }

  // CONCLUSION candidate — video ending
  if (conclusionSegment) {
    candidates.push({
      start: conclusionSegment.start,
      end: Math.min(conclusionSegment.end, conclusionSegment.start + 9),
      duration: Math.min(9, conclusionSegment.end - conclusionSegment.start),
      text: conclusionSegment.text.substring(0, 120),
      title: "Craft a Compelling Conclusion",
      hook: "The ending is as important as the hook",
      category: "CONCLUSION",
      scores: {
        hookStrength: 0.55,
        informationValue: 0.70,
        emotionalEngagement: 0.60,
        selfContainedContext: 0.80,
        narrativeCompleteness: 0.90,
        replayPotential: 0.70,
        durationSuitability: 0.85,
      },
      overallScore: 0.65,
      reason: "Strong closing leaves lasting impression and encourages sharing",
    });
  }

  // Q&A candidate — interactive content
  if (questionSegment) {
    candidates.push({
      start: questionSegment.start + 2, // shift slightly
      end: Math.min(questionSegment.end - 1, questionSegment.start + 15),
      duration: Math.min(13, questionSegment.end - questionSegment.start - 1),
      text: "Ask questions throughout your video to encourage comments",
      title: "Boost Engagement with Questions",
      hook: "Interactive content drives comments",
      category: "QUESTION_ANSWER",
      scores: {
        hookStrength: 0.65,
        informationValue: 0.75,
        emotionalEngagement: 0.70,
        selfContainedContext: 0.90,
        narrativeCompleteness: 0.80,
        replayPotential: 0.85,
        durationSuitability: 0.80,
      },
      overallScore: 0.69,
      reason: "Questions encourage comments and algorithm engagement signals",
    });
  }

  // useful explanation candidate
  candidates.push({
    start: 20.0,
    end: 28.0,
    duration: 8,
    text: "Understanding your target audience is crucial before you create any content",
    title: "Know Your Audience First",
    hook: "Audience research is the foundation",
    category: "USEFUL_EXPLANATION",
    scores: {
      hookStrength: 0.50,
      informationValue: 0.85,
      emotionalEngagement: 0.40,
      selfContainedContext: 0.95,
      narrativeCompleteness: 0.80,
      replayPotential: 0.70,
      durationSuitability: 0.85,
    },
    overallScore: 0.61,
    reason: "Foundational knowledge that applies to any content creator",
  });

  // Sort by overall score descending and return top 6
  return candidates
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, 6);
}

/**
 * Mock AI service implementation.
 */
export class MockService implements AIServiceInterface {
  getProviderName(): string {
    return "mock";
  }

  getModelName(): string {
    return "mock-model";
  }

  async transcribe(
    audioPath: string,
    language?: string
  ): Promise<TranscriptionResult> {
    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 500));

    return getMockTranscriptionResult();
  }

  async analyzeHighlights(
    transcript: TranscriptionResult,
    config?: HighlightScoringConfig
  ): Promise<HighlightCandidate[]> {
    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 500));

    const scoringConfig = config || {
      hookStrength: 0.2,
      informationValue: 0.2,
      emotionalEngagement: 0.15,
      selfContainedContext: 0.12,
      narrativeCompleteness: 0.13,
      replayPotential: 0.15,
      durationSuitability: 0.05,
    };

    return getMockHighlightCandidates(transcript);
  }

  async generateClipTitle(
    transcriptExcerpt: string,
    context?: string
  ): Promise<string> {
    // Simulate latency
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Extract key phrase and create title
    const words = transcriptExcerpt.split(/\s+/).filter((w) => w.length > 3);
    if (words.length > 0) {
      const titleWords = words.slice(0, 6).map((w) => w.charAt(0).toUpperCase() + w.slice(1));
      return titleWords.join(" ") + (context ? `: ${context}` : "");
    }
    return "Highlight Clip";
  }

  async generateHook(
    transcriptExcerpt: string,
    context?: string
  ): Promise<string> {
    // Simulate latency
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Return first sentence or a default hook
    const firstSentence = transcriptExcerpt.split(". ")[0];
    if (firstSentence.trim()) {
      return firstSentence.trim().endsWith(".")
        ? firstSentence.trim()
        : firstSentence.trim() + ".";
    }
    return "Don't miss what happens next";
  }
}

/**
 * OpenAI service implementation (stub — integrates with real API when key available).
 */
export class OpenAIService implements AIServiceInterface {
  private apiKey: string;
  private readonly baseURL = "https://api.openai.com/v1";

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey || "";
  }

  getProviderName(): string {
    return "openai";
  }

  getModelName(): string {
    return "whisper-1"; // default
  }

  async transcribe(audioPath: string, language?: string): Promise<TranscriptionResult> {
    // When API key is available, make real OpenAI Whisper API call
    // For now, fall back to mock when key not properly configured
    if (!this.apiKey) {
      const mock = new MockService();
      return mock.transcribe(audioPath, language);
    }

    // TODO: Implement real OpenAI API call
    // const response = await fetch(`${this.baseURL}/audio/transcriptions`, {
    //   method: "POST",
    //   headers: {
    //     "Authorization": `Bearer ${this.apiKey}`,
    //     "Content-Type": "audio/wav",
    //   },
    //   body: /* audio file */,
    // });
    // ... parse response

    // Fallback to mock for development
    const mock = new MockService();
    return mock.transcribe(audioPath, language);
  }

  async analyzeHighlights(
    transcript: TranscriptionResult,
    config?: HighlightScoringConfig
  ): Promise<HighlightCandidate[]> {
    if (!this.apiKey) {
      const mock = new MockService();
      return mock.analyzeHighlights(transcript, config);
    }

    // TODO: Implement real OpenAI analysis API call
    // const response = await fetch(`${this.baseURL}/chat/completions`, {
    //   method: "POST",
    //   headers: {
    //     "Authorization": `Bearer ${this.apiKey}`,
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify({
    //     model: this.getModelName() || "gpt-4o-mini",
    //     messages: [
    //       { role: "system", content: "You are a video highlight detection expert." },
    //       { role: "user", content: `Analyze this transcript for highlight moments: ${JSON.stringify(transcript)}` },
    //     ],
    //     temperature: 0.3,
    //   }),
    // });
    // ... parse response

    // Fallback to mock for development
    const mock = new MockService();
    return mock.analyzeHighlights(transcript, config);
  }

  async generateClipTitle(
    transcriptExcerpt: string,
    context?: string
  ): Promise<string> {
    if (!this.apiKey) {
      const mock = new MockService();
      return mock.generateClipTitle(transcriptExcerpt, context);
    }
    // TODO: real OpenAI API
    const mock = new MockService();
    return mock.generateClipTitle(transcriptExcerpt, context);
  }

  async generateHook(
    transcriptExcerpt: string,
    context?: string
  ): Promise<string> {
    if (!this.apiKey) {
      const mock = new MockService();
      return mock.generateHook(transcriptExcerpt, context);
    }
    // TODO: real OpenAI API
    const mock = new MockService();
    return mock.generateHook(transcriptExcerpt, context);
  }
}

/**
 * AssemblyAI service implementation (stub — integrates with real API when key available).
 */
export class AssemblyAIService implements AIServiceInterface {
  private apiKey: string;
  private readonly baseURL = "https://api.assemblyai.com/v2";

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey || "";
  }

  getProviderName(): string {
    return "assemblyai";
  }

  getModelName(): string {
    return "general"; // default
  }

  async transcribe(audioPath: string, language?: string): Promise<TranscriptionResult> {
    if (!this.apiKey) {
      const mock = new MockService();
      return mock.transcribe(audioPath, language);
    }
    // TODO: real AssemblyAI API call
    const mock = new MockService();
    return mock.transcribe(audioPath, language);
  }

  async analyzeHighlights(
    transcript: TranscriptionResult,
    config?: HighlightScoringConfig
  ): Promise<HighlightCandidate[]> {
    if (!this.apiKey) {
      const mock = new MockService();
      return mock.analyzeHighlights(transcript, config);
    }
    // TODO: real AssemblyAI API
    const mock = new MockService();
    return mock.analyzeHighlights(transcript, config);
  }

  async generateClipTitle(
    transcriptExcerpt: string,
    context?: string
  ): Promise<string> {
    if (!this.apiKey) {
      const mock = new MockService();
      return mock.generateClipTitle(transcriptExcerpt, context);
    }
    const mock = new MockService();
    return mock.generateClipTitle(transcriptExcerpt, context);
  }

  async generateHook(
    transcriptExcerpt: string,
    context?: string
  ): Promise<string> {
    if (!this.apiKey) {
      const mock = new MockService();
      return mock.generateHook(transcriptExcerpt, context);
    }
    const mock = new MockService();
    return mock.generateHook(transcriptExcerpt, context);
  }
}