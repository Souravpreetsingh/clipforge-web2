/**
 * ClipForge AI — YouTube Integration Error Definitions
 * 
 * This module defines the error types and codes used throughout the YouTube
 * integration. All errors are categorized for consistent handling in the
 * API layer, worker, and frontend UI.
 * 
 * Error categories:
 * - AUTHENTICATION: Missing/invalid OAuth credentials, token issues
 * - AUTHORIZATION: Workspace isolation violations, permission errors
 * - UPLOAD: Resumable upload failures, chunk errors, resumable protocol errors
 * - QUOTA: Daily API quota exceeded
 * - VALIDATION: Invalid metadata, scheduling parameters, video constraints
 * - NETWORK: HTTP errors, timeout failures, connection issues
 * - CONFIGURATION: Missing Google Cloud Console setup, API not enabled
 * - OPERATIONAL: Worker failures, retry limits, state reconciliation
 */

// ============================================================
// Error Code Enumeration
// ============================================================

/**
 * YouTube integration error codes.
 * 
 * These codes are used to identify the nature of an error and determine
 * the appropriate recovery action (retry, reauthorize, show UI message, etc.).
 * 
 * Category prefixes:
 * - YT-AUTH-*: Authentication/authorization errors
 * - YT-UPLD-*: Upload-related errors
 * - YT-QUOTA-*: Quota/exceeded errors
 * - YT-VAL-*: Validation errors
 * - YT-NET-*: Network/HTTP errors
 * - YT-CONF-*: Configuration errors (missing Google Cloud setup)
 * - YT-OPE-*: Operational errors (worker, retry limits)
 */
enum YouTubeErrorCode {
  // Authentication errors
  INVALID_CREDENTIALS = 'YT-AUTH-001',
  TOKEN_EXPIRED = 'YT-AUTH-002',
  REFRESH_FAILED = 'YT-AUTH-003',
  REVOKED_TOKEN = 'YT-AUTH-004',

  // Authorization errors
  WORKSPACE_ISOLATION = 'YT-AUTH-101',
  CHANNEL_NOT_CONNECTED = 'YT-AUTH-102',
  WORKSPACE_HAS_NO_CHANNEL = 'YT-AUTH-103',

  // Upload errors
  UPLOAD_INIT_FAILED = 'YT-UPLD-001',
  CHUNK_UPLOAD_FAILED = 'YT-UPLD-002',
  RESUMABLE_COMPLETION_FAILED = 'YT-UPLD-003',
  NETWORK_ERROR_UPLOAD = 'YT-UPLD-004',
  INVALID_VIDEO_FORMAT = 'YT-UPLD-005',
  VIDEO_TOO_LARGE = 'YT-UPLD-006',

  // Quota errors
  QUOTA_EXCEEDED = 'YT-QUOTA-001',
  QUOTA_DAILY_LIMIT = 'YT-QUOTA-002',
  QUOTA_RESET_IN = 'YT-QUOTA-003',

  // Validation errors
  INVALID_TITLE = 'YT-VAL-001',
  INVALID_DESCRIPTION = 'YT-VAL-002',
  INVALID_TAGS = 'YT-VAL-003',
  INVALID_PRIVACY = 'YT-VAL-004',
  INVALID_SCHEDULE = 'YT-VAL-005',
  SCHEDULED_PUBLIC_PUBLIC = 'YT-VAL-006',

  // Network errors
  TIMEOUT_ERROR = 'YT-NET-001',
  HTTP_ERROR = 'YT-NET-002',
  CONNECTION_FAILED = 'YT-NET-003',

  // Configuration errors
  CREDENTIALS_MISSING = 'YT-CONF-001',
  API_NOT_ENABLED = 'YT-CONF-002',
  REDIRECT_URI_MISMATCH = 'YT-CONF-003',

  // Operational errors
  RETRY_EXCEEDED = 'YT-OPE-001',
  STATE_RECONCILIATION_FAILED = 'YT-OPE-001',
  WORKER_INTERRUPTED = 'YT-OPE-101',
}

// ============================================================
// YouTubeIntegrationError Class
// ============================================================

/**
 * Base error class for YouTube integration errors.
 * 
 * All integration errors extend this class and provide:
 * - A standardized error code for machine-readable handling
 * - A human-readable message for UI display
 * - Category information for error handling logic
 * - Retryable flag indicating whether the error can be retried
 * - Timestamp for debugging
 */
class YouTubeIntegrationError extends Error {
  readonly code: YouTubeErrorCode;
  readonly category: 'authentication' | 'authorization' | 'upload' | 'quota' | 'validation' | 'network' | 'configuration' | 'operational';
  readonly retryable: boolean;
  readonly timestamp: Date;

  constructor({
    code,
    message,
    category,
    retryable = false,
  }: {
    code: YouTubeErrorCode;
    message: string;
    category: 'authentication' | 'authorization' | 'upload' | 'quota' | 'validation' | 'network' | 'configuration' | 'operational';
    retryable?: boolean;
  }) {
    super(message);
    this.name = 'YouTubeIntegrationError';
    this.code = code;
    this.category = category;
    this.retryable = retryable;
    this.timestamp = new Date();
  }

  /**
   * Determine if this error should trigger a reauthorization flow.
   * 
   * Errors that indicate the OAuth tokens are invalid, revoked, or expired
   * should trigger a reauthorization flow where the user re-grants permissions.
   */
  shouldTriggerReauthorization(): boolean {
    switch (this.code) {
      case YouTubeErrorCode.TOKEN_EXPIRED:
      case YouTubeErrorCode.REFRESH_FAILED:
      case YouTubeErrorCode.REVOKED_TOKEN:
      case YouTubeErrorCode.INVALID_CREDENTIALS:
        return true;
      default:
        return false;
    }
  }

  /**
   * Determine if this error should trigger a quota check and user notification.
   * 
   * Quota errors should show a user-friendly message with information about
   * when the quota resets and how to obtain more quota (if applicable).
   */
  shouldShowQuotaNotification(): boolean {
    return this.code === YouTubeErrorCode.QUOTA_EXCEEDED || this.code === YouTubeErrorCode.QUOTA_DAILY_LIMIT;
  }

  /**
   * Get a user-friendly error message for display in the UI.
   * 
   * This overrides the default Error.message with a more contextual message
   * based on the error code and category.
   */
  getUserMessage(): string {
    const baseMessage = this.message || 'An unknown error occurred';

    switch (this.code) {
      case YouTubeErrorCode.INVALID_CREDENTIALS:
        return 'Google OAuth credentials are invalid. Please reconnect your YouTube channel.';

      case YouTubeErrorCode.TOKEN_EXPIRED:
        return 'Your YouTube access token has expired. Reconnecting your channel will refresh the token.';

      case YouTubeErrorCode.REFRESH_FAILED:
        return 'Failed to refresh your YouTube access token. Please reconnect your YouTube channel.';

      case YouTubeErrorCode.REVOKED_TOKEN:
        return 'Your YouTube token has been revoked. Please reconnect your YouTube channel.';

      case YouTubeErrorCode.WORKSPACE_ISOLATION:
        return 'You do not have permission to access this YouTube channel from this workspace.';

      case YouTubeErrorCode.CHANNEL_NOT_CONNECTED:
        return 'No YouTube channel is connected to this workspace. Please connect a channel first.';

      case YouTubeErrorCode.UPLOAD_INIT_FAILED:
        return 'Failed to start video upload. Please try again.';

      case YouTubeErrorCode.CHUNK_UPLOAD_FAILED:
        return 'Video chunk upload failed. This may be a network issue. Please try again.';

      case YouTubeErrorCode.RESUMEABLE_COMPLETION_FAILED:
        return 'Failed to complete video upload to YouTube. Please try again.';

      case YouTubeErrorCode.QUOTA_EXCEEDED:
        return 'You have exceeded your daily YouTube API quota. Please try again tomorrow.';

      case YouTubeErrorCode.QUOTA_DAILY_LIMIT:
        return 'Your daily YouTube API quota has been reached. Resets at midnight ' + new Date().toLocaleDateString();

      case YouTubeErrorCode.INVALID_TITLE:
        return 'Title must be between 1 and 100 characters.';

      case YouTubeErrorCode.INVALID_PRIVACY:
        return 'Invalid privacy status. Must be one of: public, private, unlisted.';

      case YouTubeErrorCode.INVALID_SCHEDULE:
        return 'Scheduled publication time must be in the future and privacy must be private or unlisted.';

      case YouTubeErrorCode.TIMEOUT_ERROR:
        return 'The upload timed out. Please check your network connection and try again.';

      case YouTubeErrorCode.HTTP_ERROR:
        return 'YouTube API returned an error. Please try again.';

      case YouTubeErrorCode.CREDENTIALS_MISSING:
        return 'YouTube integration is not configured. Please set up Google Cloud Console credentials.';

      case YouTubeErrorCode.API_NOT_ENABLED:
        return 'YouTube Data API v3 is not enabled in the Google Cloud Console. Please enable it.';

      case YouTubeErrorCode.REDIRECT_URI_MISMATCH:
        return 'OAuth redirect URI mismatch. Please reconnect your YouTube channel.';

      case YouTubeErrorCode.RETRY_EXCEEDED:
        return 'Maximum retry attempts exceeded. Please try again later or contact support.';

      case YouTubeErrorCode.STATE_RECONCILIATION_FAILED:
        return 'Failed to reconcile upload state. Please contact support with error details.';

      case YouTubeErrorCode.WORKER_INTERRUPTED:
        return 'The upload worker was interrupted. Please try again.';

      default:
        return baseMessage;
    }
  }

  /**
   * Get a technical error message for logging and debugging.
   * 
   * This provides more detailed information than getUserMessage(),
   * useful for server logs and support tickets.
   */
  getTechnicalMessage(): string {
    return `[Code: ${this.code}] [Category: ${this.category}] ${this.message || 'No detailed message'}\nTimestamp: ${this.timestamp.toISOString()}\nRetryable: ${this.retryable}`;
  }
}

// ============================================================
// Error Factory Functions
// ============================================================

/**
 * Create an authentication error.
 * 
 * @param code - The specific error code (from YouTubeErrorCode)
 * @param message - Human-readable message
 * @returns A YouTubeIntegrationError instance
 */
function createAuthError(code: YouTubeErrorCode, message: string): YouTubeIntegrationError {
  return new YouTubeIntegrationError({
    code,
    message,
    category: 'authentication',
    retryable: code === YouTubeErrorCode.TOKEN_EXPIRED || code === YouTubeErrorCode.REFRESH_FAILED,
  });
}

/**
 * Create an authorization error.
 * 
 * @param code - The specific error code
 * @param message - Human-readable message
 * @returns A YouTubeIntegrationError instance
 */
function createAuthzError(code: YouTubeErrorCode, message: string): YouTubeIntegrationError {
  return new YouTubeIntegrationError({
    code,
    message,
    category: 'authorization',
    retryable: false,
  });
}

/**
 * Create an upload error.
 * 
 * @param code - The specific error code
 * @param message - Human-readable message
 * @param retryable - Whether this error can be retried
 * @returns A YouTubeIntegrationError instance
 */
function createUploadError(code: YouTubeErrorCode, message: string, retryable: boolean): YouTubeIntegrationError {
  return new YouTubeIntegrationError({
    code,
    message,
    category: 'upload',
    retryable,
  });
}

/**
 * Create a quota error.
 * 
 * @param code - The specific error code
 * @param message - Human-readable message
 * @returns A YouTubeIntegrationError instance
 */
function createQuotaError(code: YouTubeErrorCode, message: string): YouTubeIntegrationError {
  return new YouTubeIntegrationError({
    code,
    message,
    category: 'quota',
    retryable: false, // Quota errors should not be retried; wait for reset
  });
}

/**
 * Create a validation error.
 * 
 * @param code - The specific error code
 * @param message - Human-readable message
 * @returns A YouTubeIntegrationError instance
 */
function createValidationError(code: YouTubeErrorCode, message: string): YouTubeIntegrationError {
  return new YouTubeIntegrationError({
    code,
    message,
    category: 'validation',
    retryable: false, // Validation errors should be fixed, not retried
  });
}

/**
 * Create a network error.
 * 
 * @param code - The specific error code
 * @param message - Human-readable message
 * @param retryable - Whether this error can be retried (usually yes for network errors)
 * @returns A YouTubeIntegrationError instance
 */
function createNetworkError(code: YouTubeErrorCode, message: string, retryable: boolean): YouTubeIntegrationError {
  return new YouTubeIntegrationError({
    code,
    message,
    category: 'network',
    retryable,
  });
}

/**
 * Create a configuration error.
 * 
 * @param code - The specific error code
 * @param message - Human-readable message
 * @returns A YouTubeIntegrationError instance
 */
function createConfigError(code: YouTubeErrorCode, message: string): YouTubeIntegrationError {
  return new YouTubeIntegrationError({
    code,
    message,
    category: 'configuration',
    retryable: false, // Configuration errors require user action, not retries
  });
}

/**
 * Create an operational error.
 * 
 * @param code - The specific error code
 * @param message - Human-readable message
 * @param retryable - Whether this error can be retried
 * @returns A YouTubeIntegrationError instance
 */
function createOperationalError(code: YouTubeErrorCode, message: string, retryable: boolean): YouTubeIntegrationError {
  return new YouTubeIntegrationError({
    code,
    message,
    category: 'operational',
    retryable,
  });
}

// ============================================================
// Export All Error Codes and Factory Functions
// ============================================================

export {
  YouTubeErrorCode,
  YouTubeIntegrationError,

  // Factory functions
  createAuthError,
  createAuthzError,
  createUploadError,
  createQuotaError,
  createValidationError,
  createNetworkError,
  createConfigError,
  createOperationalError,

  // Convenience: create error from error code + message
  createError,

  // Error category type
};

export type { YouTubeErrorCode, YouTubeIntegrationError };