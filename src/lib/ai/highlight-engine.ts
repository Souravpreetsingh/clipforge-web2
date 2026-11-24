/**
 * ClipForge AI — Phase 4 Highlight Engine
 *
 * Analyzes transcript segments to identify engaging moments and generates
 * highlight candidates with scoring components and categories.
 *
 * The engine evaluates each segment on multiple dimensions:
 * - Hook strength (attention-grabbing potential)
 - Information value (novel/educational content)
 - Emotional engagement (expressiveness, passion)
 - Self-contained context (understandable without external info)
 - Narrative completeness (has beginning-middle-end feeling)
 - Replay potential (shareable, memorable)
 - Duration suitability (fits clip duration limits)
 *
 * Configurable weights allow adjustment of scoring emphasis
 * without code changes.
 */

import {
  TranscriptionResult,
  HighlightCandidate,
  HighlightCategory,
  HighlightScores,
  HighlightScoringConfig,
  AIServiceInterface,
} from "./provider";
import { existsSync, unlinkSync, rmSync, readdirSync } from "fs";
import { join, range } from "path";
import { performance } from "perf_hooks";

// ============================================================
// SCORING DIMENSION EVALUATORS
// ============================================================

/**
 * Evaluate hook strength of a transcript segment.
 * Higher score = more attention-grabbing.
 *
 * Factors:
 * - Starts with surprising statement or question
 * - Contains emotional language or strong claims
 * - Appears early in video (first 10 seconds especially high)
 * - Uses vivid, vivid descriptive language
 * - Contrasts or contradicts common expectations
 */
function evaluateHookStrength(
  segment: TranscriptionResult["segments"][0],
  segmentIndex: number,
  totalSegments: number
): number {
  let score = 0.5; // base score

  const text = segment.text.toLowerCase();

  // Starts with hook-related language
  const hookStartPatterns = /^(hello|welcome|imagine|what if|the truth|did you know)/i;
  if (hookStartPatterns.test(segment.text)) {
    score += 0.2;
  }

  // Appears in first 10 seconds (high weight)
  if (segmentIndex < 3 && totalSegments > 0) {
    const proportion = segmentIndex / totalSegments;
    if (proportion < 0.1) {
      // Very first segments
      score += 0.3;
    } else if (proportion < 0.3) {
      // Early video
      score += 0.15;
    }
  }

  // Emotional language or strong claims
  const emotionalWords = /(amazing|incredible|shocking|surprising|finally|never|always)/i;
  if (emotionalWords.test(text)) {
    score += 0.15;
  }

  // Vivid descriptive language
  const vividWords = /(beautiful|terrible|wonderful|horrifying|unbelievable)/i;
  if (vividWords.test(text)) {
    score += 0.1;
  }

  // Clamp to 0-1 range
  return Math.min(1, Math.max(0, score));
}

/**
 * Evaluate information value of a transcript segment.
 * Higher score = more novel/educational content.
 *
 * Factors:
 * - Contains specific facts, data, or statistics
 * - Presents new information or insights
 * - Explains a concept or process
 * - Uses definitive language (is, are, true, fact)
 * - Avoids filler words and hedging
 */
function evaluateInformationValue(
  segment: TranscriptionResult["segments"][0],
  segmentIndex: number,
  totalSegments: number
): number {
  let score = 0.3; // base score

  const text = segment.text.toLowerCase();

  // Contains factual language
  const factualMarkers = /(fact|data|study|research|showed that|scientists found)/i;
  if (factualMarkers.test(text)) {
    score += 0.3;
  }

  // Presents new information or insights
  const insightMarkers = /(important|key|crucial|essential|actually|actually)/i;
  if (insightMarkers.test(text)) {
    score += 0.2;
  }

  // Uses definitive language
  const definitiveMarkers = /(is true|is a fact|proven|research confirms)/i;
  if (definitiveMarkers.test(text)) {
    score += 0.15;
  }

  // Avoid filler/hedging (reduce score for too many fillers)
  const fillerWords = /\b(um|uh|like|you know|sort of|kind of)\b/gi;
  const fillerCount = (text.match(fillerWords) || []).length;
  const wordCount = text.split(/\s+/).length;
  const fillerRatio = wordCount > 0 ? fillerCount / wordCount : 0;
  if (fillerRatio > 0.3) {
    score -= 0.2; // penalize high filler ratio
  }

  return Math.min(1, Math.max(0, score));
}

/**
 * Evaluate emotional engagement of a transcript segment.
 * Higher score = more expressiveness, passion, intensity.
 *
 * Factors:
 * - Exclamation marks or strong punctuation
 * - Emotional words (joy, anger, sadness, excitement)
 * - Capitals (emphasis)
 * - Intensifiers (very, really, extremely)
 * - Emotional state verbs (excited, angry, thrilled, devastated)
 */
function evaluateEmotionalEngagement(
  segment: TranscriptionResult["segments"][0],
  segmentIndex: number,
  totalSegments: number
): number {
  let score = 0.3; // base score

  const text = segment.text;

  // Exclamation marks indicate emphasis
  const exclamationCount = (text.match(/!/g) || []).length;
  score += exclamationCount * 0.1;

  // Emotional words
  const emotionalWords = /
    (joy|happiness|glad|pleased|angry|furious|sad|devastated|excited|thrilled| disappointed|frustrated)/i
  ;
  if (emotionalWords.test(text)) {
    score += 0.25;
  }

  // Capitals (emphasis)
  const capitalRatio = (text.match(/[A-Z]/g) || []).length / Math.max(1, text.length);
  score += Math.min(0.2, capitalRatio * 2);

  // Intensifiers
  const intensifiers = /(very|really|extremely|incredibly|totally|completely)/i;
  if (intensifiers.test(text.toLowerCase())) {
    score += 0.1;
  }

  return Math.min(1, Math.max(0, score));
}

/**
 * Evaluate self-contained context of a transcript segment.
 * Higher score = understandable without external information.
 *
 * Factors:
 * - No pronouns referring to earlier unheard content
 * - No references to earlier video parts
 * - Stand-alone statement that makes sense in isolation
 * - Clear subject and predicate
 * - No dependent clauses that require prior context
 */
function evaluateSelfContainedContext(
  segment: TranscriptionResult["segments"][0],
  segmentIndex: number,
  totalSegments: number
): number {
  let score = 0.8; // base score (most segments are somewhat contained)

  const text = segment.text.toLowerCase();

  // Pronouns that reference earlier content (reduce score)
  const referencePronouns = /\b(he|she|it|they|those|this|that|which|who|whom)\b/i;
  const pronounMatches = text.match(referencePronouns) || [];
  const significantPronounMatches = pronounMatches.filter(
    (p) => !["a", "an", "the"].includes(p)
  );
  if (significantPronounMatches.length > 1) {
    score -= 0.1 * significantPronounMatches.length;
  }

  // References to earlier parts (words like "above", "below", "previously")
  const referenceWords = /\b(above|below|previously|mentioned|earlier|above-mentioned)/i;
  if (referenceWords.test(text)) {
    score -= 0.2;
  }

  // Very short segments may lack context
  const wordCount = segment.text.split(/\s+/).length;
  if (wordCount < 5) {
    score -= 0.1;
  }

  return Math.min(1, Math.max(0, score));
}

/**
 * Evaluate narrative completeness of a transcript segment.
 * Higher score = has beginning-middle-end feeling.
 *
 * Factors:
 * - Statement has a clear subject and verb (complete thought)
 * - No trailing clauses without endings
 * - Starts with complete sentence structure
 * - Contains connective words that signal completion
 */
function evaluateNarrativeCompleteness(
  segment: TranscriptionResult["segments"][0],
  segmentIndex: number,
  totalSegments: number
): number {
  let score = 0.5; // base score

  const text = segment.text.trim();

  // Complete sentence (ends with period, exclamation, or question mark)
  if (/[.!?]$/.test(text)) {
    score += 0.2;
  }

  // Has a clear subject-verb structure (simple check: contains a verb-like word)
  const verbPatterns = /(is|are|was|were|has|have|did|do|said|mentioned|spoke|talked)/i;
  if (verbPatterns.test(text)) {
    score += 0.15;
  }

  // Starts with a noun or pronoun (complete thought starter)
  const startsWithNoun = /^(the|a|an|this|that|I|we|you|they|it)/i;
  if (startsWithNoun.test(text)) {
    score += 0.1;
  }

  // Contains transition/connective words that signal completion
  const connectiveWords = /(so|therefore|consequently|thus|hence)/i;
  if (connectiveWords.test(text.toLowerCase())) {
    score += 0.1;
  }

  return Math.min(1, Math.max(0, score));
}

/**
 * Evaluate replay potential of a transcript segment.
 * Higher score = shareable, memorable, clip-worthy.
 *
 * Factors:
 * - Memorable quote or phrase structure
 * - Humor or surprise elements
 * - Relatable situation or statement
 * - Shareable language ("you should", "you need to", "you know")
 * - Emotional resonance that encourages forwarding
 */
function evaluateReplayPotential(
  segment: TranscriptionResult["segments"][0],
  segmentIndex: number,
  totalSegments: number
): number {
  let score = 0.5; // base score

  const text = segment.text.toLowerCase();

  // Shareable language patterns
  const shareablePatterns = /(you should|you need to|you must|everyone should|you know)/i;
  if (shareablePatterns.test(text)) {
    score += 0.2;
  }

  // Humor or surprise elements
  const humorWords = /(funny|haha|laugh|joke|hilarious|ridiculous)/i;
  if (humorWords.test(text)) {
    score += 0.2;
  }

  // Relatable situations
  const relatablePatterns = /(you know|I mean|been there|experienced|experience)/i;
  if (relatablePatterns.test(text)) {
    score += 0.15;
  }

  // Emotional resonance
  const emotionalWords = /
    (love|hate|heart|feel|emotion|passion|strong|deep)/i
  ;
  if (emotionalWords.test(text)) {
    score += 0.1;
  }

  return Math.min(1, Math.max(0, score));
}

/**
 * Evaluate duration suitability of a segment for clipping.
 * Higher score = fits within configurable clip duration limits.
 *
 * Factors:
 * - Segment duration within optimal range (15-30s)
 * - Not too short (< 5s) or too long (> 60s)
 * - Near optimal duration gets higher score
 */
function evaluateDurationSuitability(
  start: number,
  end: number,
  totalSegments: number,
  minDuration: number = 5,
  maxDuration: number = 60,
  optimalMin: number = 15,
  optimalMax: number = 30
): number {
  const duration = end - start;

  if (duration < minDuration) {
    // Too short — linearly reduce score
    return (duration / minDuration) * 0.5; // 0-0.5 range
  }

  if (duration > maxDuration) {
    // Too long — linearly reduce from 1.0
    return Math.max(0, 1 - ((duration - maxDuration) / (120 - maxDuration)) * 0.5);
  }

  // Within valid range — optimal gets full score
  if (duration >= optimalMin && duration <= optimalMax) {
    return 1.0; // perfect fit
  }

  // Outside optimal but within valid range
  if (duration < optimalMin) {
    // Closer to optimal gets higher score
    return 1 - ((optimalMin - duration) / optimalMin) * 0.3;
  }

  // duration > optimalMax but <= maxDuration
  return 1 - ((duration - optimalMax) / (maxDuration - optimalMax)) * 0.3;
}

// ============================================================
// HIGHLIGHT ENGINE CLASS
// ============================================================

/**
 * HighlightEngine — analyzes transcript segments and generates
 * highlight candidates with scores and categories.
 *
 * The engine evaluates each segment on 7 scoring dimensions
 * and produces ranked candidates for clip generation.
 */
export class HighlightEngine {
  private readonly config: HighlightScoringConfig;

  /**
   * Create a HighlightEngine with custom scoring weights.
   * Weights default to balanced values (sum ≈ 1.0).
   *
   * @param customConfig - Optional custom weights override
   */
  constructor(customConfig?: Partial<HighlightScoringConfig>) {
    this.config = {
      hookStrength: 0.2,
      informationValue: 0.2,
      emotionalEngagement: 0.15,
      selfContainedContext: 0.12,
      narrativeCompleteness: 0.13,
      replayPotential: 0.15,
      durationSuitability: 0.05,

      // Override with custom values if provided
      ...customConfig,
    };
  }

  /**
   * Analyze transcript segments and generate highlight candidates.
   *
   * @param transcript - The transcription result with segments
   * @param customConfig - Optional custom scoring configuration
   * @returns Array of highlight candidates, ranked by overall score
   */
  analyze(
    transcript: TranscriptionResult,
    customConfig?: Partial<HighlightScoringConfig>
  ): HighlightCandidate[] {
    // Use custom config if provided, otherwise use instance config
    const scoringConfig = {
      ...this.config,
      ...customConfig,
    };

    const candidates: HighlightCandidate[] = [];
    const segments = transcript.segments || [];
    const totalSegments = segments.length;

    // Evaluate each segment and generate candidates
    segments.forEach((segment, index) => {
      // Skip very short segments (likely incomplete)
      if (segment.text.trim().length < 3) {
        return;
      }

      // Skip segments that are likely incomplete (no ending punctuation
      // unless it's very late in the video)
      const isVeryEarly = index < 2;
      const endsIncomplete = !/[.!?]$/.test(segment.text) && !isVeryEarly;
      if (endsIncomplete && segment.text.split(" ").length < 8) {
        // Very short segments without punctuation are likely incomplete
        return;
      }

      // Evaluate all scoring dimensions
      const hookStrength = evaluateHookStrength(segment, index, totalSegments);
      const informationValue = evaluateInformationValue(segment, index, totalSegments);
      const emotionalEngagement = evaluateEmotionalEngagement(segment, index, totalSegments);
      const selfContainedContext = evaluateSelfContainedContext(segment, index, totalSegments);
      const narrativeCompleteness = evaluateNarrativeCompleteness(segment, index, totalSegments);
      const replayPotential = evaluateReplayPotential(segment, index, totalSegments);
      const durationSuitability = evaluateDurationSuitability(
        segment.start,
        segment.end,
        totalSegments
      );

      // Calculate overall score using configured weights
      const overallScore =
        hookStrength * scoringConfig.hookStrength +
        informationValue * scoringConfig.informationValue +
        emotionalEngagement * scoringConfig.emotionalEngagement +
        selfContainedContext * scoringConfig.selfContainedContext +
        narrativeCompleteness * scoringConfig.narrativeCompleteness +
        replayPotential * scoringConfig.replayPotential +
        durationSuitability * scoringConfig.durationSuitability;

      // Determine category based on highest-scoring individual dimension
      const category = this.determineCategory(
        hookStrength,
        informationValue,
        emotionalEngagement,
        selfContainedContext,
        narrativeCompleteness,
        replayPotential,
        durationSuitability
      );

      // Generate suggested title and hook from the transcript text
      const suggestedTitle = this.generateTitle(segment.text);
      const suggestedHook = this.generateHook(segment.text);

      // Only include candidates with reasonable overall scores
      if (overallScore >= 0.3) {
        candidates.push({
          start: segment.start,
          end: segment.end,
          duration: segment.end - segment.start,
          text: segment.text,
          title: suggestedTitle,
          hook: suggestedHook,
          category,
          scores: {
            hookStrength,
            informationValue,
            emotionalEngagement,
            selfContainedContext,
            narrativeCompleteness,
            replayPotential,
            durationSuitability,
          },
          overallScore: Math.round(overallScore * 100) / 100, // round to 2 decimal places
          reason: this.generateReason(category, {
            hookStrength,
            informationValue,
            emotionalEngagement,
            selfContainedContext,
            narrativeCompleteness,
            replayPotential,
            durationSuitability,
          }),
        });
      }
    });

    // Sort by overall score descending and return
    return candidates
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, 6); // Return top 6 candidates
  }

  /**
   * Determine the highlight category based on which scoring dimensions
   * are highest.
   */
  private determineCategory(
    hookStrength: number,
    informationValue: number,
    emotionalEngagement: number,
    selfContainedContext: number,
    narrativeCompleteness: number,
    replayPotential: number,
    durationSuitability: number
  ): HighlightCategory {
    const scores = {
      hookStrength,
      informationValue,
      emotionalEngagement,
      selfContainedContext,
      narrativeCompleteness,
      replayPotential,
    };

    // Find the highest scoring dimension
    const maxKey = Object.keys(scores).reduce(
      (a, b) => (scores[a] > scores[b] ? a : b),
      "hookStrength" as keyof typeof scores
    );

    // Map dimension to category
    const categoryMap: Record<HighlightCategory, string> = {
      HOOK: "hookStrength",
      FACT: "informationValue",
      EMOTIONAL: "emotionalEngagement",
      CONCLUSION: "selfContainedContext", // self-contained = conclusion-like
      QUESTION_ANSWER: "replayPotential", // questions often have replay potential
      USEFUL_EXPLANATION: "informationValue",
    };

    // Check if duration suitability strongly suggests a category
    if (durationSuitability > 0.8 && hookStrength > 0.6) {
      return "HOOK"; // Very short + strong hook = hook
    }

    if (informationValue > 0.7 && durationSuitability > 0.7) {
      return "FACT"; // High info value + good duration = fact
    }

    if (emotionalEngagement > 0.7 && replayPotential > 0.6) {
      return "EMOTIONAL"; // High emotion + replay = emotional
    }

    if (narrativeCompleteness > 0.7 && selfContainedContext > 0.7) {
      return "CONCLUSION"; // Complete narrative = conclusion
    }

    // Default to the highest-scoring dimension
    switch (maxKey) {
      case "hookStrength":
        return "HOOK";
      case "informationValue":
        return "FACT";
      case "emotionalEngagement":
        return "EMOTIONAL";
      case "selfContainedContext":
        return "CONCLUSION";
      case "replayPotential":
        return "QUESTION_ANSWER";
      default:
        return "HOOK";
    }
  }

  /**
   * Generate a suggested title from transcript excerpt.
   */
  private generateTitle(excerpt: string): string {
    // Take first meaningful sentence and capitalize
    const firstSentence = excerpt.split(". ")[0].trim();
    if (firstSentence.length > 0) {
      // Capitalize first letter
      return firstSentence.charAt(0).toUpperCase() + firstSentence.slice(1);
    }
    return "Highlight Moment";
  }

  /**
   * Generate a suggested hook from transcript excerpt.
   */
  private generateHook(excerpt: string): string {
    // Return first ~60 characters as potential hook
    const firstChunk = excerpt.substring(0, 60);
    if (firstChunk.trim().length > 0) {
      return firstChunk.trim();
    }
    return "Don't miss what happens next";
  }

  /**
   * Generate a human-readable reason for why this segment was selected.
   */
  private generateReason(
    category: HighlightCategory,
    scores: {
      hookStrength: number;
      informationValue: number;
      emotionalEngagement: number;
      selfContainedContext: number;
      narrativeCompleteness: number;
      replayPotential: number;
    }
  ): string {
    const reasonMap: Record<HighlightCategory, string> = {
      HOOK:
        "Strong opening that grabs viewer attention in the first 10 seconds",
      FACT:
        "Valuable information or insight that viewers likely didn't know",
      EMOTIONAL:
        "Expresses strong emotion or relatable feeling that encourages sharing",
      CONCLUSION:
        "Strong closing or takeaway that leaves a lasting impression",
      QUESTION_ANSWER:
        "Question-answer pattern that encourages engagement and comments",
      USEFUL_EXPLANATION:
        "Foundational knowledge or practical explanation applicable to viewers",
    };

    return reasonMap[category] || "Selected as engaging highlight moment";
  }
}

// ============================================================
// EXPORT
// ============================================================

export { HighlightEngine, HighlightScoringConfig };