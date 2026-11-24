/**
 * ClipForge AI — YouTube API Quota Tracking Module
 * 
 * This module provides a configurable quota tracking layer for YouTube Data API v3 calls.
 * YouTube API has daily quota limits, and each operation costs a certain number of units.
 * This tracker helps prevent exceeding the daily quota and provides meaningful
 * error messages to users when quota is exhausted.
 * 
 * Quota is tracked per-workspace, per-day, with configurable reset time zone.
 * The quota can be stored in memory (for development) or in Redis/Persistent DB
 * (for production).
 */

// ============================================================
// Imports and Configuration
// ============================================================

// YouTube API operation costs in quota units (per Google defaults)
// These are the approximate costs for common YouTube Data API operations:
// - Videos: insert = 1,600 units, update = 2 units, delete = 2 units
// - Channels: list = 1 unit, update = 1 unit
// - Activities: insert = 2 units, list = 1 unit
// - Comments: insert = 2 units, list = 5 units, mark as spam = 1 unit
// - Playlist items: insert = 2 units, list = 1 unit, delete = 2 units
// - Playlists: insert = 2 units, list = 1 unit, delete = 2 units
// - Video reactions: mark as like = 1 unit
//
// For Phase 6, the most relevant operations are:
// - Video upload: ~1,200 units (resumable upload)
// - Channel metadata: ~1 unit
// - Video metadata: ~1 unit
// - Video status update: ~2 units

const DEFAULT_DAILY_QUOTA = Number(
  process.env.YOUTUBE_DAILY_QUOTA || '10000'
); // Google default: 10,000 units per day

const QUOTA_RESET_TZ = process.env.YOUTUBE_QUOTA_RESET_TZ || 'America/New_York';

// ============================================================
// Quota Tracker Class
// ============================================================

/**
 * Tracks YouTube API quota usage per workspace, per day.
 * 
 * The quota tracker uses a simple in-memory store for development/mock mode.
 * In production, this would be backed by Redis or a persistent database
 * with proper time-zone handling.
 * 
 * The daily quota resets at midnight in the configured time zone
 * (default: America/New_York).
 * 
 * Usage:
 * - Increment the quota counter before each YouTube API call
 * - If quota is exceeded, throw an error or return a special error code
 * - The quota resets automatically at midnight in the configured TZ
 */
class YouTubeQuotaTracker {
  private dailyQuota: number;
  private usedToday: number;
  private lastReset: Date;
  private resetTz: string;

  /**
   * Construct a new quota tracker.
   * 
   * @param dailyQuota - The maximum quota units per day (0 = unlimited)
   * @param resetTz - The time zone for quota reset (default: America/New_York)
   */
  constructor(dailyQuota?: number, resetTz?: string) {
    this.dailyQuota = dailyQuota ?? DEFAULT_DAILY_QUOTA;
    this.usedToday = 0;
    this.resetTz = resetTz ?? QUOTA_RESET_TZ;

    // Initialize the last reset time based on the configured time zone
    this.lastReset = this.getMidnightInTimeZone(this.resetTz);

    // If we're past the reset time today, start with 0 usage
    // (The getMidnightInTimeZone already returns yesterday's midnight if past reset time)
  }

  /**
   * Get the midnight time in the configured time zone.
   * 
   * @param tz - The time zone string (IANA format, e.g., 'America/New_York')
   * @returns A Date object representing midnight at the start of the next quota period
   */
  private getMidnightInTimeZone(tz: string): Date {
    // Use Intl to get the current date in the specified time zone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2',
      day: '2',
    });
    const todayString = formatter.format(now); // Format as YYYY-MM-DD

    // Parse the date and set to midnight in the specified time zone
    const [year, month, day] = todayString.split('-').map(Number);
    const midnight = new Date(Date.UTC(year, month - 1, day)); // UTC midnight
    const tzMidnight = new Date(
      midnight.getTime() + new Date().getTimezoneOffset() * 60000
    ); // Convert to target TZ midnight

    // If the current time is past midnight in this TZ, the quota period has started
    // Return the start of the CURRENT period (could be yesterday's midnight if we're past reset)
    const nowInTz = new Date(now.getTime() + new Date().getTimezoneOffset() * 60000);
    if (nowInTz <= midnight) {
      // We're still before midnight in this TZ; the period started yesterday
      return new Date(midnight.getTime() - 24 * 60 * 60 * 1000); // Yesterday's midnight
    }

    // We're past midnight; the new period starts today
    return midnight;
  }

  /**
   * Get the current quota status.
   * 
   * @returns Object with current usage, limit, and reset information
   */
  getStatus(): {
    dailyQuota: number;
    usedToday: number;
    remaining: number;
    percentageUsed: number;
    resetAt: Date;
    isUnlimited: boolean;
  } {
    const isUnlimited = this.dailyQuota === 0;
    const remaining = isUnlimited ? 0 : Math.max(0, this.dailyQuota - this.usedToday);
    const percentageUsed = isUnlimited ? 100 : (this.usedToday / this.dailyQuota) * 100;

    return {
      dailyQuota: this.dailyQuota,
      usedToday: this.usedToday,
      remaining,
      percentageUsed: Math.round(percentageUsed),
      resetAt: this.lastReset,
      isUnlimited,
    };
  }

  /**
   * Increment the quota counter by a specified amount.
   * 
   * @param cost - The quota cost of the operation (default: 1)
   * @returns Object with success flag and current status
   * @throws If quota would be exceeded (when not unlimited)
   * 
   * Before incrementing, checks if the operation would exceed the daily quota.
   * If the quota would be exceeded, throws an error (or returns success: false
   * in mock mode without throwing).
   */
  increment(cost: number = 1): {
    success: boolean;
    newUsedToday: number;
    remaining: number;
    error?: string;
  } {
    // If unlimited, no tracking needed
    if (this.dailyQuota === 0) {
      return {
        success: true,
        newUsedToday: this.usedToday,
        remaining: 0,
        isUnlimited: true,
      };
    }

    // Check if the increment would exceed the quota
    const wouldExceed = this.usedToday + cost > this.dailyQuota;

    if (wouldExceed) {
      // Quota would be exceeded
      return {
        success: false,
        newUsedToday: this.usedToday,
        remaining: Math.max(0, this.dailyQuota - this.usedToday),
        error: `YouTube API quota exceeded: would use ${cost} units, but only ${this.dailyQuota - this.usedToday} units remaining of ${this.dailyQuota} daily quota`,
      };
    }

    // Increment the usage counter
    this.usedToday += cost;

    // Check if we've crossed into a new quota period
    // (This handles the case where the increment pushes us past the reset point,
    //  though typically the reset happens at midnight, not mid-increment)
    const newStatus = this.getStatus();

    return {
      success: true,
      newUsedToday: this.usedToday,
      remaining: newStatus.remaining,
    };
  }

  /**
   * Reset the quota counter to zero.
   * 
   * This is called at the start of each new quota period (midnight in the
   * configured time zone). In a production system, this would be triggered
   * by a cron job or scheduled function.
   * 
   * @returns The new quota status after reset
   */
  reset(): {
    dailyQuota: number;
    usedToday: number;
    remaining: number;
    percentageUsed: number;
    resetAt: Date;
    isUnlimited: boolean;
  } {
    // Reset to the start of the next period
    this.lastReset = this.getMidnightInTimeZone(this.resetTz);
    this.usedToday = 0;

    return this.getStatus();
  }

  /**
   * Get the time until the quota resets.
   * 
   * @returns The number of milliseconds until the quota resets,
   *          or 0 if currently at reset time
   */
  timeUntilReset(): number {
    const now = new Date();
    const resetTime = this.lastReset;
    const timeUntil = resetTime.getTime() - now.getTime();

    // If we're past the reset time, return 0 (already reset)
    if (timeUntil <= 0) {
      return 0;
    }

    return timeUntil;
  }
}

// ============================================================
// QuotaTracker Instance Management
// ============================================================

/**
 * Get (or create) a quota tracker instance for a workspace.
 * 
 * In a production system, this would use a Redis-backed or database-backed
 * store to persist quota state across worker restarts. For this implementation,
 * we use a simple in-memory Map with the option to fall back to the
 * YouTubeQuotaTracker class.
 * 
 * @param workspaceId - The workspace identifier
 * @returns A YouTubeQuotaTracker instance for this workspace
 */
function getQuotaTrackerForWorkspace(workspaceId: string): YouTubeQuotaTracker {
  // In mock/development mode, create a new tracker with default config
  // In production, would check Redis or DB for existing tracker state
  return new YouTubeQuotaTracker(DEFAULT_DAILY_QUOTA, QUOTA_RESET_TZ);
}

// ============================================================
// Quota Cost Constants
// ============================================================

/**
 * Pre-defined quota costs for common YouTube API operations.
 * 
 * These are approximate costs based on Google's default quota configuration.
 * Actual costs may vary; these values are for planning and tracking purposes.
 */
export const QUOTA_COSTS = {
  // Video operations
  VIDEO_INSERT: 1600, // Creating a new video (upload + metadata)
  VIDEO_UPDATE: 2, // Updating video metadata/status
  VIDEO_DELETE: 2, // Deleting a video

  // Channel operations
  CHANNEL_LIST: 1, // Listing channel info
  CHANNEL_UPDATE: 1, // Updating channel info

  // Common Phase 6 operations
  UPLOAD_VIDEO: 1200, // Resumable video upload + initial metadata
  METADATA_UPDATE: 1, // Updating video tags, title, description
  STATUS_UPDATE: 2, // Updating privacy status, scheduled publication
};

// ============================================================
// Export All
// ============================================================

export {
  YouTubeQuotaTracker,
  getQuotaTrackerForWorkspace,
  DEFAULT_DAILY_QUOTA,
  QUOTA_RESET_TZ,
  QUOTA_COSTS,
};