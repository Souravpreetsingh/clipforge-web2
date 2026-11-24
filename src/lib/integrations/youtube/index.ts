/**
 * ClipForge AI — YouTube Integration Barrel Module
 * 
 * This is the main entry point for the YouTube integration library.
 * All public API functions are re-exported from this module.
 * 
 * Usage:
 * - Development/mock mode: Import directly; functions will operate
 *   with mock data when Google credentials are missing.
 * - Production mode: Configure Google Cloud Console credentials
 *   (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
 *   and YOUTUBE_OAUTH_ENCRYPTION_KEY for token encryption.
 * 
 * Architecture:
 * - All functions are gated behind GOOGLE_CREDENTIALS_MISSING check
 * - If credentials are missing, functions operate in mock mode
 * - Real Google API calls are made only when credentials are configured
 * - Clear separation between mock and real integration modes
 * - Never expose OAuth tokens to the browser (server-side only)
 */

// Re-export all public modules
export * from './client';
export * from './oauth';
export * from './tokens';
export * from './channels';
export * from './videos';
export * from './upload';
export * from './publishing';
export * from './quota';
export * from './errors';

// ============================================================
// Module Configuration Detection
// ============================================================

/**
 * Check if Google Cloud Console credentials are configured.
 * 
 * This is a convenient check for determining whether the integration
 * will operate in real mode or mock/development mode.
 * 
 * @returns True if essential Google credentials are missing
 */
export function areCredentialsMissing(): boolean {
  return process.env.GOOGLE_CLIENT_ID == null ||
    process.env.GOOGLE_CLIENT_SECRET == null ||
    process.env.GOOGLE_REDIRECT_URI == null;
}

// ============================================================
// Version and Metadata
// ============================================================

/**
 * The current version of the YouTube integration module.
 * 
 * @version 1.0.0 (Phase 6 initial implementation)
 */
export const VERSION = '1.0.0';

/**
 * The date of the last module update.
 * 
 * @date 2026-11-21 (Phase 6 implementation)
 */
export const LAST_UPDATED = '2026-11-21';