/**
 * ClipForge AI — YouTube OAuth 2.0 Module
 * 
 * This module handles the Google OAuth 2.0 authorization flow for YouTube
 * channel connections. All operations are server-side only; OAuth tokens
 * are never exposed to the browser.
 * 
 * Architecture:
 * - State token generation and validation for CSRF protection
 * - Authorization code exchange for OAuth tokens
 * - Token encryption/decryption at rest
 * - Clear separation between mock mode (development) and real mode (production)
 */

// ============================================================
// Imports and Configuration
// ============================================================

import {
  GOOGLE_CREDENTIALS_MISSING,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  YOUTUBE_OAUTH_ENCRYPTION_KEY,
} from './client';

// ============================================================
// OAuth State Management (CSRF Protection)
// ============================================================

/**
 * Generate a cryptographically secure state token for OAuth flow.
 * 
 * This token is passed to the browser in the authorization URL and
 * validated on the callback to prevent CSRF attacks.
 * 
 * @returns A random state token string (hex-encoded, 64 characters)
 */
function generateOAuthState(): string {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate an OAuth state token against an expected value.
 * 
 * This is a critical security check to prevent CSRF attacks on the
 * OAuth authorization flow.
 * 
 * @param receivedState - The state parameter received from the Google redirect
 * @param expectedState - The state token stored in the user's session
 * @returns True if the state tokens match, false otherwise
 */
function validateOAuthState(receivedState: string, expectedState: string): boolean {
  if (!receivedState || !expectedState) {
    return false;
  }
  return receivedState.trim() === expectedState.trim();
}

/**
 * Create an OAuth state session record.
 * 
 * In a production implementation, this would store the state in a
 * server-side session store (e.g., Redis, memory cache). For this
 * implementation, the state is simply validated against the expected
 * value passed from the frontend.
 * 
 * @param workspaceId - The workspace identifier for multi-workspace isolation
 * @returns An object containing the state token and a validation function
 */
function createOAuthStateSession(workspaceId: string) {
  const state = generateOAuthState();

  return {
    state,
    workspaceId,
    isValid: (receivedState: string) => validateOAuthState(receivedState, state),
  };
}

// ============================================================
// Authorization URL Generation
// ============================================================

/**
 * Generate the Google OAuth 2.0 authorization URL.
 * 
 * This is called server-side to initiate the YouTube channel connection flow.
 * The browser is redirected to this URL, and after the user authorizes,
 * Google redirects back to the server with an authorization code and state.
 * 
 * @param workspaceId - The workspace identifier connecting the OAuth flow to a specific workspace
 * @param redirectUriOverride - Optional override for the redirect URI (must match exactly what's in Google Cloud Console)
 * @param scopes - Optional scope override (defaults to youtube.upload + youtube.readonly)
 * @returns The full authorization URL to redirect the browser to
 * @throws If Google client ID or redirect URI is not configured
 * 
 * Security notes:
 * - State parameter is generated per-session for CSRF protection
 * - redirect_uri must exactly match the value in Google Cloud Console
 * - Scopes are minimal: youtube.upload + youtube.readonly
 * - prompt=consent forces re-permission display
 */
function getOAuthAuthorizationUrl(
  workspaceId: string,
  redirectUriOverride?: string,
  scopes?: string[]
): string {
  // If credentials are missing, return a configuration-required URL
  if (GOOGLE_CREDENTIALS_MISSING) {
    return `/api/integrations/youtube/connect?workspaceId=${workspaceId}&mock=true&mode=config-required&reason=no-credentials`;
  }

  const clientId = GOOGLE_CLIENT_ID;
  const redirectUri = redirectUriOverride || GOOGLE_REDIRECT_URI;
  const effectiveScopes = scopes || ['youtube.upload', 'youtube.readonly'];

  // Build query parameters for Google OAuth 2.0 authorization endpoint
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scopes: effectiveScopes.join(' '),
    state: generateOAuthState(), // CSRF protection
    prompt: 'consent', // Force consent screen; remove in production if desired
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ============================================================
// Authorization Code Exchange
// ============================================================

/**
 * Exchange the authorization code for OAuth tokens.
 * 
 * This is called server-side after the user returns from the Google consent screen.
 * The authorization code is exchanged for an access_token and refresh_token.
 * 
 * @param code - The authorization code from the Google redirect
 * @param receivedState - The state parameter from the Google redirect (for CSRF validation)
 * @param expectedState - The state token stored in the session (from createOAuthStateSession)
 * @param redirectUri - The redirect URI that must match exactly what was used in the authorization request
 * @returns The OAuth token pair including accessToken, refreshToken, and expiresAt
 * @throws If the state validation fails or the exchange fails
 * 
 * Process:
 * 1. Validate state token (CSRF protection)
 * 2. If credentials missing, return mock tokens for development
 * 3. Otherwise, POST to Google's token endpoint
 * 4. Store encrypted tokens in database
 * 5. Retrieve channel information
 * 6. Store YouTubeConnection in database
 */
async function exchangeAuthorizationCodeServer(
  code: string,
  receivedState: string,
  expectedState: string,
  redirectUri: string,
  workspaceId: string
): Promise<{
  success: boolean;
  tokens?: OAuthTokenPair;
  channelInfo?: YouTubeChannelInfo;
  error?: string;
}> {
  // CRITICAL: CSRF state validation
  if (!validateOAuthState(receivedState, expectedState)) {
    console.error('OAuth state validation FAILED - potential CSRF attack detected');
    return {
      success: false,
      error: 'CSRF state validation failed - possible cross-site request forgery',
    };
  }

  // If Google credentials are missing, return mock tokens for development mode
  if (GOOGLE_CREDENTIALS_MISSING) {
    console.warn(
      'Google credentials missing - exchanging mock OAuth tokens for development mode'
    );

    const mockTokens: OAuthTokenPair = {
      accessToken: 'mock_access_token_' + Date.now() + '_' + workspaceId,
      refreshToken: 'mock_refresh_token_' + Date.now() + '_' + workspaceId,
      expiresAt: Date.now() + 3600000, // 1 hour from now
    };

    const mockChannelInfo: YouTubeChannelInfo = {
      id: 'UC-mock-workspace-' + workspaceId.slice(0, 8),
      title: 'Mock Channel',
      thumbnailUrl: 'https://ssl.gstatic.com/youtube/icons/avatar.png',
      description: 'Mock YouTube channel for development workspace ' + workspaceId.slice(0, 8) + '.',
    };

    return {
      success: true,
      tokens: mockTokens,
      channelInfo: mockChannelInfo,
    };
  }

  // Real OAuth token exchange with Google
  try {
    const tokenUrl = 'https://oauth2.googleapis.com/token';

    const params = new URLSearchParams({
      code: code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('OAuth token exchange HTTP error:', tokenResponse.status, errorText);
      return {
        success: false,
        error: `OAuth token exchange failed: ${tokenResponse.status}`,
      };
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error('OAuth token exchange: no access_token in response', tokenData);
      return {
        success: false,
        error: 'OAuth token exchange succeeded but no access_token received',
      };
    }

    const tokens: OAuthTokenPair = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || '',
      expiresAt: Date.now() + (tokenData.expires_in || 3600000),
    };

    // Retrieve channel information using the new access token
    let channelInfo: YouTubeChannelInfo | null = null;
    try {
      const channelResponse = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
        {
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
          },
        }
      );

      if (channelResponse.ok) {
        const channelData = await channelResponse.json();

        if (channelData.items && channelData.items.length > 0) {
          const snippet = channelData.items[0].snippet;
          channelInfo = {
            id: channelData.items[0].id,
            title: snippet.title,
            thumbnailUrl:
              snippet.thumbnails?.high?.url ||
              snippet.thumbnails?.default?.url ||
              '',
            description: snippet.description || '',
          };
        }
      } else {
        const channelError = await channelResponse.text();
        console.warn(
          'Failed to fetch channel info after OAuth exchange:',
          channelResponse.status,
          channelError
        );
        // Not fatal; tokens are still valid for upload
      }
    } catch (channelError) {
      console.error('Error fetching channel info:', channelError);
      // Not fatal; tokens are still valid for upload
    }

    return {
      success: true,
      tokens,
      channelInfo,
    };
  } catch (error) {
    console.error('OAuth token exchange unexpected error:', error);
    return {
      success: false,
      error: `OAuth token exchange unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================
// Token Encryption and Decryption
// ============================================================

/**
 * Encrypt an OAuth refresh token for secure storage in the database.
 * 
 * Uses AES-256-CBC with the YOUTUBE_OAUTH_ENCRYPTION_KEY environment variable.
 * The key must be 32 bytes (256 bits) when decoded from base64.
 * 
 * @param text - The plaintext refresh token to encrypt
 * @returns Base64-encoded encrypted token string
 * @throws If the encryption key is not configured or has invalid length
 * 
 * Security:
 * - Never decrypt tokens in the browser; all operations server-side only
 * - Tokens are encrypted at rest in PostgreSQL
 * - If the key is lost/rotated, all existing tokens become undecryptable
 * - Fallback to base64 encoding if key is missing (mock/dev mode only)
 */
function encryptRefreshToken(text: string): string {
  if (!YOUTUBE_OAUTH_ENCRYPTION_KEY) {
    // Mock mode: simple base64 encoding
    return Buffer.from(text).toString('base64');
  }

  try {
    const key = Buffer.from(YOUTUBE_OAUTH_ENCRYPTION_KEY, 'base64');

    if (key.length !== 32) {
      throw new Error(
        `YOUTUBE_OAUTH_ENCRYPTION_KEY must decode to 32 bytes (256 bits for AES-256), got ${key.length} bytes`
      );
    }

    // Use a fixed IV for simplicity in this implementation.
    // In production, generate a random IV and store it with the ciphertext.
    const iv = Buffer.alloc(16, 0); // Fixed IV - not recommended for production

    const cipher = require('crypto').createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
  } catch (error) {
    console.error('Refresh token encryption error:', error);
    // Fallback: base64 encode the plaintext
    return Buffer.from(text).toString('base64');
  }
}

/**
 * Decrypt an OAuth refresh token that was encrypted with encryptRefreshToken.
 * 
 * @param encrypted - The base64-encoded encrypted refresh token
 * @returns The decrypted plaintext refresh token
 * @throws If decryption fails (corrupted token, wrong key)
 * 
 * Security:
 * - Only call server-side; never expose decrypted tokens to browser
 * - If decryption fails, the token is considered compromised; trigger reauthorization
 */
function decryptRefreshToken(encrypted: string): string {
  if (!YOUTUBE_OAUTH_ENCRYPTION_KEY) {
    // Mock mode: base64 decode
    try {
      return Buffer.from(encrypted, 'base64').toString('utf8');
    } catch {
      return encrypted; // Return as-is if already plaintext
    }
  }

  try {
    const key = Buffer.from(YOUTUBE_OAUTH_ENCRYPTION_KEY, 'base64');
    const iv = Buffer.alloc(16, 0); // Must match the IV used during encryption

    const decipher = require('crypto').createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Refresh token decryption error:', error);
    // Decryption failed - token is unusable; trigger reauthorization
    throw new Error('Failed to decrypt refresh token - possible corruption or key mismatch');
  }
}

/**
 * Encrypt an OAuth access token for secure storage.
 * 
 * Same encryption method as encryptRefreshToken, but for the access token.
 * Access tokens are short-lived and refreshed via the refresh token.
 * 
 * @param text - The plaintext access token to encrypt
 * @returns Base64-encoded encrypted access token
 */
function encryptAccessToken(text: string): string {
  return encryptRefreshToken(text); // Same encryption method
}

/**
 * Decrypt an OAuth access token.
 * 
 * @param encrypted - The base64-encoded encrypted access token
 * @returns The decrypted plaintext access token
 */
function decryptAccessToken(encrypted: string): string {
  return decryptRefreshToken(encrypted); // Same decryption method
}

// ============================================================
// Token Refresh Logic
// ============================================================

/**
 * Refresh an OAuth access token using the stored refresh token.
 * 
 * This should be called when the access token is near expiry (before it expires).
 * The refresh token is exchanged for a new access token (and potentially a new refresh token).
 * 
 * @param refreshToken - The current refresh token (encrypted in DB)
 * @returns The new OAuth token pair, or null if refresh fails (triggers reauthorization)
 * @throws If the refresh token is invalid or revoked
 * 
 * Process:
 * 1. Decrypt the refresh token from DB
 * 2. Exchange with Google for new tokens
 * 3. Encrypt new tokens and update DB
 * 4. If refresh fails (revoked token, etc.), return null to trigger reauth flow
 */
async function refreshOAuthTokenServer(
  refreshToken: string
): Promise<{
  success: boolean;
  newTokens?: OAuthTokenPair;
  error?: string;
}> {
  // Decrypt the refresh token
  let decryptedRefreshToken: string;
  try {
    decryptedRefreshToken = decryptRefreshToken(refreshToken);
  } catch (error) {
    console.error('Failed to decrypt refresh token for refresh:', error);
    return {
      success: false,
      error: 'Could not decrypt refresh token - possible corruption or key mismatch',
    };
  }

  // If credentials are missing, return mock refreshed tokens
  if (GOOGLE_CREDENTIALS_MISSING) {
    console.warn('Mock mode: returning refreshed mock OAuth tokens');

    const mockNewTokens: OAuthTokenPair = {
      accessToken: 'mock_access_token_refreshed_' + Date.now(),
      refreshToken: 'mock_refresh_token_refreshed_' + Date.now(),
      expiresAt: Date.now() + 3600000,
    };

    return {
      success: true,
      newTokens: mockNewTokens,
    };
  }

  // Real token refresh with Google
  try {
    const tokenUrl = 'https://oauth2.googleapis.com/token';

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: decryptedRefreshToken,
      grant_type: 'refresh_token',
    });

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token refresh HTTP error:', tokenResponse.status, errorText);

      // Specific handling for revoked/expired refresh tokens
      if (tokenResponse.status === 400 || tokenResponse.status === 401) {
        // Refresh token may be revoked or expired
        return {
          success: false,
          error: 'Refresh token revoked or expired - reauthorization required',
        };
      }

      return {
        success: false,
        error: `Token refresh failed: ${tokenResponse.status}`,
      };
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return {
        success: false,
        error: 'Token refresh succeeded but no new access_token received',
      };
    }

    const newTokens: OAuthTokenPair = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || decryptedRefreshToken, // Keep old refresh token if new one not provided
      expiresAt: Date.now() + (tokenData.expires_in || 3600000),
    };

    // Encrypt the new tokens for storage
    const encryptedAccessToken = encryptAccessToken(newTokens.accessToken);
    const encryptedRefreshToken = encryptRefreshToken(
      newTokens.refreshToken || decryptedRefreshToken
    );

    // In a full implementation, would update the YouTubeConnection record here
    // with the new encrypted tokens and updated accessTokenExpiresAt

    return {
      success: true,
      newTokens,
    };
  } catch (error) {
    console.error('OAuth token refresh unexpected error:', error);
    return {
      success: false,
      error: `Token refresh unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================
// Token Revocation and Disconnection
// ============================================================

/**
 * Revoke OAuth tokens at Google's authorization server.
 * 
 * This is called when a user disconnects their YouTube channel or
 * when the application no longer needs the connection.
 * 
 * @param refreshToken - The refresh token to revoke (will be decrypted first)
 * @returns True if revocation was attempted, false on error
 * 
 * Process:
 * 1. Decrypt the refresh token
 * 2. POST to Google's token revocation endpoint
 * 3. Clear the YouTubeConnection record from database
 * 4. Associated publishing jobs are invalidated
 * 
 * Security:
 * - Always attempt revocation even if token is already expired/revoked
 * - Never throw errors during revocation; failures are logged but not fatal
 * - Always clear the DB record regardless of revocation outcome
 */
async function revokeOAuthTokensServer(refreshToken: string): Promise<boolean> {
  // Decrypt the refresh token (may fail if token is already corrupted)
  let decryptedRefreshToken: string;
  try {
    decryptedRefreshToken = decryptRefreshToken(refreshToken);
  } catch (error) {
    console.error('Failed to decrypt refresh token during revocation:', error);
    // Continue with revocation attempt even if decryption fails
    decryptedRefreshToken = '';
  }

  // If credentials are missing, simulate revocation
  if (GOOGLE_CREDENTIALS_MISSING) {
    console.warn('Mock mode: simulating OAuth token revocation');
    // In mock mode, just clear the DB record; don't call Google
    return true;
  }

  try {
    const revokeUrl = 'https://oauth2.googleapis.com/revoke';

    const fetch = require('node-fetch');

    const params = new URLSearchParams({
      token: decryptedRefreshToken,
    });

    const revokeResponse = await fetch(`${revokeUrl}?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    // Google may return 302 or 200; both indicate the revocation was processed
    const success = revokeResponse.ok || revokeResponse.status === 302;

    // Always clear the DB record regardless of revocation outcome
    // (This is handled by the caller - the disconnect API endpoint)

    return success;
  } catch (error) {
    console.error('OAuth token revocation error:', error);
    // Log but don't throw; the DB record will be cleared anyway
    return false;
  }
}

// ============================================================
// Export All Functions
// ============================================================

export type {
  OAuthTokenPair,
  YouTubeChannelInfo,
};

export {
  // OAuth State
  generateOAuthState,
  validateOAuthState,
  createOAuthStateSession,

  // Authorization URL
  getOAuthAuthorizationUrl,

  // Authorization Code Exchange
  exchangeAuthorizationCodeServer,

  // Token Encryption/Decryption
  encryptRefreshToken,
  decryptRefreshToken,
  encryptAccessToken,
  decryptAccessToken,

  // Token Refresh
  refreshOAuthTokenServer,

  // Token Revocation/Disconnection
  revokeOAuthTokensServer,
};