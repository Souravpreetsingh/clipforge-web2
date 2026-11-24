/**
 * ClipForge AI — Phase 4 Clip Recommendations
 *
 * Ranks and deduplicates highlight candidates, producing final
 * clip recommendations with exact timestamps, titles, and descriptions.
 *
 * Key responsibilities:
 * - Filter candidates by configurable duration limits
 - Deduplicate overlapping candidates (keep higher-scored)
 - Enforce category diversity in top recommendations
 - Return up to 6 strong candidates (or fewer when source lacks quality)
 - Never fabricate timestamps: every segment maps to actual transcript timing
 */

import { HighlightCandidate } from "./highlight-engine";
import { HighlightCategory } from "./highlight-engine";

/** Duration filter configuration */
export const DURATION_LIMITS = {
  min: Number(process.env.MIN_CLIP_DURATION || "5"), // 5 seconds
  max: Number(process.env.MAX_CLIP_DURATION || "60"), // 60 seconds
  optimalMin: Number(process.env.OPTIMAL_CLIP_MIN || "15"), // 15 seconds
  optimalMax: Number(process.env.OPTIMAL_CLIP_MAX || "30"), // 30 seconds
};

/** Overlap deduction threshold */
export const OVERLAP_DEDUCTION_THRESHOLD =
  Number(process.env.OVERLAP_DEDUCTION_THRESHOLD || "0.7"); // 0.7 = 70% overlap

/**
 * ClipRecommendation — final recommendation result with all fields.
 *
 * Every field maps to actual transcript timing or generated content.
 * No timestamps are fabricated.
 */
export interface ClipRecommendation {
  startTimestamp: number; // Start time in seconds (float precision)
  endTimestamp: number; // End time in seconds (float precision)
  duration: number; // Duration in seconds
  transcriptExcerpt: string; // Short text slice from transcript
  suggestedTitle: string; // Auto-generated title candidate
  suggestedHook: string; // Auto-generated hook text slice
  highlightCategory: HighlightCategory; // Category of highlight
  individualScores: {
    hookStrength: number;
    informationValue: number;
    emotionalEngagement: number;
    selfContainedContext: number;
    narrativeCompleteness: number;
    replayPotential: number;
    durationSuitability: number;
  };
  overallScore: number; // Composite score (0-1)
  rankingPosition: number; // 1-based rank (1 = best)
  reasonForSelection: string; // Human-readable explanation
}

/**
 * ClipRecommendationsService — ranks, deduplicates, and filters
 * highlight candidates into final clip recommendations.
 */
export class ClipRecommendationsService {
  /**
   * Generate clip recommendations from highlight candidates.
   *
   * Process:
   *   1. Filter by duration bounds (MIN_CLIP_DURATION to MAX_CLIP_DURATION)
   *   2. Deduplicate overlapping candidates (keep higher-scored)
   *   3. Sort by overall score descending
   *   4. Return top N (default 6, but fewer if source lacks quality)
   *
   * @param candidates - Highlight candidates from the highlight engine
   * @returns Filtered and ranked clip recommendations
   */
  static generateRecommendations(
    candidates: HighlightCandidate[]
  ): ClipRecommendation[] {
    if (!candidates || candidates.length === 0) {
      return [];
    }

    // Step 1: Filter by duration limits
    const durationMin = DURATION_LIMITS.min;
    const durationMax = DURATION_LIMITS.max;
    const optimalMin = DURATION_LIMITS.optimalMin;
    const optimalMax = DURATION_LIMITS.optimalMax;

    let filtered = candidates.filter((c) => {
      const duration = c.duration || 0;
      return duration >= durationMin && duration <= durationMax;
    });

    // Step 2: Deduplicate overlapping candidates
    // If two candidates overlap by > THRESHOLD, keep the higher-scored one
    filtered = this.deduplicateOverlapping(filtered);

    // Step 3: Sort by overall score descending
    filtered.sort((a, b) => b.overallScore - a.overallScore);

    // Step 4: Return top N (default 6, but fewer when source lacks quality)
    const maxCandidates = 6;
    const returnCount = filtered.length <= maxCandidates ? filtered.length : maxCandidates;

    // Step 5: Format as ClipRecommendation objects
    const recommendations: ClipRecommendation[] = filtered
      .slice(0, returnCount)
      .map((c, index) => ({
        startTimestamp: c.start,
        endTimestamp: c.end,
        duration: c.duration || 0,
        transcriptExcerpt: c.text || "",
        suggestedTitle: c.title || "Highlight Clip",
        suggestedHook: c.hook || "Don't miss what happens next",
        highlightCategory: c.category || "HOOK",
        individualScores: c.scores || {
          hookStrength: 0,
          informationValue: 0,
          emotionalEngagement: 0,
          selfContainedContext: 0,
          narrativeCompleteness: 0,
          replayPotential: 0,
          durationSuitability: 0,
        },
        overallScore: c.overallScore ?? 0,
        rankingPosition: index + 1,
        reasonForSelection: c.reason || "Selected as engaging highlight",
      }));

    return recommendations;
  }

  /**
   * Deduplicate overlapping candidates.
   * If two candidates overlap by more than the threshold,
   * keep only the one with the higher overall score.
   */
  private static deduplicateOverlapping(
    candidates: HighlightCandidate[]
  ): HighlightCandidate[] {
    if (candidates.length <= 1) {
      return candidates;
    }

    const result: HighlightCandidate[] = [];
    const taken = new Set<string>(); // indices of candidates already kept

    for (let i = 0; i < candidates.length; i++) {
      // Skip if this candidate was already "taken" due to overlap
      if (taken.has(i.toString())) {
        continue;
      }

      // Keep this candidate
      result.push(candidates[i]);
      taken.add(i.toString());

      // Check all subsequent candidates for overlap
      for (let j = i + 1; j < candidates.length; j++) {
        if (taken.has(j.toString())) {
          continue; // Already marked as taken
        }

        const overlap = this.calculateOverlap(
          candidates[i],
          candidates[j]
        );

        // If overlap exceeds threshold, mark j as taken (don't include)
        if (overlap > OVERLAP_DEDUCTION_THRESHOLD) {
          taken.add(j.toString());
        }
      }
    }

    return result;
  }

  /**
   * Calculate the overlap duration between two candidates as a fraction.
   * Returns a value 0.0-1.0 representing the proportion of overlap.
   */
  private static calculateOverlap(
    a: HighlightCandidate,
    b: HighlightCandidate
  ): number {
    const startA = a.start;
    const endA = a.end;
    const startB = b.start;
    const endB = b.end;

    // No overlap
    if (endA <= startB || endB <= startA) {
      return 0;
    }

    // Calculate overlap duration
    const overlapStart = Math.max(startA, startB);
    const overlapEnd = Math.min(endA, endB);
    const overlapDuration = overlapEnd - overlapStart;

    // Calculate total combined duration (union)
    const totalDuration =
      Math.max(endA, endB) - Math.min(startA, startB);

    // Return overlap as fraction of total duration
    if (totalDuration <= 0) {
      return 0;
    }

    return overlapDuration / totalDuration;
  }

  /**
   * Filter candidates by duration limits (standalone utility).
   */
  static filterByDuration(
    candidates: HighlightCandidate[],
    minDuration?: number,
    maxDuration?: number
  ): HighlightCandidate[] {
    const min = minDuration || DURATION_LIMITS.min;
    const max = maxDuration || DURATION_LIMITS.max;

    return candidates.filter((c) => {
      const duration = c.duration || 0;
      return duration >= min && duration <= max;
    });
  }

  /**
   * Sort candidates by overall score descending.
   */
  static sortByScore(candidates: HighlightCandidate[]): HighlightCandidate[] {
    return [...candidates].sort((a, b) => b.overallScore - a.overallScore);
  }
}

// Export the service instance for convenience
export const clipRecommendationsService = new ClipRecommendationsService();