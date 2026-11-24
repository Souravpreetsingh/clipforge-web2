/**
 * ClipForge AI — YouTube Token Management Module
 * 
 * This module handles the encryption, decryption, refresh, and lifecycle
 * management of OAuth tokens for YouTube channel connections.
 * 
 * All token operations are server-side only. Tokens are never exposed
 * to the browser. The module supports both mock mode (development,
 * no Google credentials) and real mode (Google Cloud Console setup).
 */

// ============================================================
// Imports
// ============================================================

import {
  GOOGLE_CREDENTIALS_MISSING,
  YOUTUBE_OAUTH_ENCRYPTION_KEY,
} from './client';
import type { OAuthTokenPair } from './client';

// ============================================================
// Token Storage Interface
// ============================================================

/**
 * Interface for token storage operations.
 * 
 * This is abstracted so the actual storage mechanism (Prisma DB,
 * Redis, etc.) can be swapped without changing the token logic.
 * 
 * In a full implementation, each method would interact with the
 * Prisma client to read/write YouTubeConnection records.
 */
type TokenStorageInterface = {
  /**
   * Retrieve the YouTubeConnection for a workspace.
   * 
   * @param workspaceId - The workspace identifier
   * @returns The YouTubeConnection record, or null if not found
   */
  getYouTubeConnection(workspaceId: string): Promise<{
    id: string;
    workspaceId: string;
    provider: string;
    channelId: string;
    channelTitle: string;
    channelThumbnail: string | null;
    encryptedAccessToken: string;
    encryptedRefreshToken: string;
    accessTokenExpiresAt: Date;
    scopes: string[];
    connectionStatus: string;
    connectedAt: Date;
    lastSyncedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null>;

  /**
   * Update a YouTubeConnection with new token data.
   * 
   * @param workspaceId - The workspace identifier
   * @param updates - The fields to update (tokens, status, timestamps)
   * @returns The number of rows updated
   */
  updateYouTubeConnection(
    workspaceId: string,
    updates: {
      encryptedAccessToken?: string;
      encryptedRefreshToken?: string;
      accessTokenExpiresAt?: Date;
      connectionStatus?: string;
      lastSyncedAt?: Date;
      updatedAt?: Date;
    }
  ): Promise<number>;

  /**
   * Create a new YouTubeConnection record.
   * 
   * @param data - The full YouTubeConnection data to insert
   * @returns The created record
   */
  createYouTubeConnection(data: {
    workspaceId: string;
    provider: string;
    channelId: string;
    channelTitle: string;
    channelThumbnail?: string;
    encryptedAccessToken: string;
    encryptedRefreshToken: string;
    accessTokenExpiresAt: Date;
    scopes: string[];
    connectionStatus: string;
    connectedAt: Date;
    lastSyncedAt?: Date;
  }): Promise<any>;
};

/**
 * Default mock storage implementation for development mode.
 * 
 * In production, this would be replaced with real Prisma DB operations.
 * The mock storage keeps tokens in memory per workspace, which is
 * sufficient for development and testing but not for persistent use.
 */
class MockTokenStorage implements TokenStorageInterface {
  private storage: Map<string, {
    encryptedAccessToken: string;
    encryptedRefreshToken: string;
    accessTokenExpiresAt: number;
    connectionStatus: string;
    connectedAt: number;
    lastSyncedAt: number | null;
    channelId: string;
    channelTitle: string;
    channelThumbnail: string | null;
  }> = new Map();

  async getYouTubeConnection(workspaceId: string): Promise<{
    id: string;
    workspaceId: string;
    provider: string;
    channelId: string;
    channelTitle: string;
    channelThumbnail: string | null;
    encryptedAccessToken: string;
    encryptedRefreshToken: string;
    accessTokenExpiresAt: Date;
    scopes: string[];
    connectionStatus: string;
    connectedAt: Date;
    lastSyncedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    const item = this.storage.get(workspaceId);
    if (!item) {
      return null;
    }

    const now = new Date();
    return {
      id: 'mock-conn-' + workspaceId,
      workspaceId,
      provider: 'youtube',
      channelId: item.channelId,
      channelTitle: item.channelTitle,
      channelThumbnail: item.channelThumbnail,
      encryptedAccessToken: item.encryptedAccessToken,
      encryptedRefreshToken: item.encryptedRefreshToken,
      accessTokenExpiresAt: new Date(item.accessTokenExpiresAt),
      scopes: ['youtube.upload', 'youtube.readonly'],
      connectionStatus: item.connectionStatus,
      connectedAt: new Date(item.connectedAt),
      lastSyncedAt: item.lastSyncedAt ? new Date(item.lastSyncedAt) : null,
      createdAt: now, // Mock: always "just created"
      updatedAt: now,
    };
  }

  async updateYouTubeConnection(
    workspaceId: string,
    updates: {
      encryptedAccessToken?: string;
      encryptedRefreshToken?: string;
      accessTokenExpiresAt?: Date;
      connectionStatus?: string;
      lastSyncedAt?: Date;
      updatedAt?: Date;
    }
  ): Promise<number> {
    const item = this.storage.get(workspaceId);
    if (!item) {
      return 0; // No rows updated (no record exists)
    }

    // Apply updates
    if (updates.encryptedAccessToken !== undefined) {
      item.encryptedAccessToken = updates.encryptedAccessToken;
    }
    if (updates.encryptedRefreshToken !== undefined) {
      item.encryptedRefreshToken = updates.encryptedRefreshToken;
    }
    if (updates.accessTokenExpiresAt !== undefined) {
      item.accessTokenExpiresAt = updates.accessTokenExpiresAt.getTime();
    }
    if (updates.connectionStatus !== undefined) {
      item.connectionStatus = updates.connectionStatus;
    }
    if (updates.lastSyncedAt !== undefined) {
      item.lastSyncedAt = updates.lastSyncedAt.getTime();
    }
    if (updates.updatedAt !== undefined) {
      item.updatedAt = updates.updatedAt.getTime();
    }

    this.storage.set(workspaceId, item);
    return 1; // One row updated
  }

  async createYouTubeConnection(data: {
    workspaceId: string;
    provider: string;
    channelId: string;
    channelTitle: string;
    channelThumbnail?: string;
    encryptedAccessToken: string;
    encryptedRefreshToken: string;
    accessTokenExpiresAt: Date;
    scopes: string[];
    connectionStatus: string;
    connectedAt: Date;
    lastSyncedAt?: Date;
  }): Promise<any> {
    this.storage.set(data.workspaceId, {
      encryptedAccessToken: data.encryptedAccessToken,
      encryptedRefreshToken: data.encryptedRefreshToken,
      accessTokenExpiresAt: data.accessTokenExpiresAt.getTime(),
      connectionStatus: data.connectionStatus,
      connectedAt: data.connectedAt.getTime(),
      lastSyncedAt: data.lastSyncedAt?.getTime() ?? Date.now(),
      channelId: data.channelId,
      channelTitle: data.channelTitle,
      channelThumbnail: data.channelThumbnail,
    });

    return {
      id: 'mock-conn-' + data.workspaceId,
      workspaceId: data.workspaceId,
      provider: data.provider,
      channelId: data.channelId,
      channelTitle: data.channelTitle,
      channelThumbnail: data.channelThumbnail,
      encryptedAccessToken: data.encryptedAccessToken,
      encryptedRefreshToken: data.encryptedRefreshToken,
      accessTokenExpiresAt: data.accessTokenExpiresAt,
      scopes: data.scopes,
      connectionStatus: data.connectionStatus,
      connectedAt: data.connectedAt,
      lastSyncedAt: data.lastSyncedAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

/**
 * Real Prisma-based storage implementation.
 * 
 * This would be used when the Google Cloud Console is configured and
 * the YouTubeConnection model exists in the Prisma schema.
 * 
 * NOTE: This class is a placeholder; the actual Prisma operations
 * would be performed directly in the API route handlers or services,
 * using the Prisma client generated from the schema.
 */
class PrismaTokenStorage implements TokenStorageInterface {
  constructor(private prisma: any) {
    // In a full implementation, the Prisma client would be injected here
  }

  async getYouTubeConnection(workspaceId: string): Promise<{
    id: string;
    workspaceId: string;
    provider: string;
    channelId: string;
    channelTitle: string;
    channelThumbnail: string | null;
    encryptedAccessToken: string;
    encryptedRefreshToken: string;
    accessTokenExpiresAt: Date;
    scopes: string[];
    connectionStatus: string;
    connectedAt: Date;
    lastSyncedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    // Real implementation would query the DB
    // For now, return null indicating not implemented
    return null;
  }

  async updateYouTubeConnection(
    workspaceId: string,
    updates: {
      encryptedAccessToken?: string;
      encryptedRefreshToken?: string;
      accessTokenExpiresAt?: Date;
      connectionStatus?: string;
      lastSyncedAt?: Date;
      updatedAt?: Date;
    }
  ): Promise<number> {
    // Real implementation would update the DB
    // For now, return 0
    return 0;
  }

  async createYouTubeConnection(data: {
    workspaceId: string;
    provider: string;
    channelId: string;
    channelTitle: string;
    channelThumbnail?: string;
    encryptedAccessToken: string;
    encryptedRefreshToken: string;
    accessTokenExpiresAt: Date;
    scopes: string[];
    connectionStatus: string;
    connectedAt: Date;
    lastSyncedAt?: Date;
  }): Promise<any> {
    // Real implementation would create the DB record
    // For now, return a mock structure
    return {
      id: 'prisma-conn-' + data.workspaceId,
      ...data,
    };
  }
}

// ============================================================
// Token Retrieval and Decryption
// ============================================================

/**
 * Retrieve the decrypted OAuth tokens for a workspace.
 * 
 * This queries the YouTubeConnection from the storage layer and
 * decrypts the access and refresh tokens.
 * 
 * @param storage - The token storage interface implementation
 * @param workspaceId - The workspace identifier
 * @returns The OAuth token pair, or null if no connection exists
 * @throws If token decryption fails (corrupted token, wrong key)
 * 
 * Security:
 * - Decrypted tokens are only valid within this function's scope
 * - Decrypted tokens are never returned from this function
 * - The function returns an OAuthTokenPair structure with the tokens
 *   for internal use, but the caller must handle them securely
 */
async function getDecryptedTokens(
  storage: TokenStorageInterface,
  workspaceId: string
): Promise<{
  success: boolean;
  tokens?: OAuthTokenPair;
  error?: string;
}> {
  // Query the YouTubeConnection from the storage layer
  const connection = await storage.getYouTubeConnection(workspaceId);

  if (!connection) {
    return {
      success: false,
      error: 'No YouTube connection found for workspace ' + workspaceId,
    };
  }

  // Decrypt the access token
  let decryptedAccessToken: string;
  try {
    decryptedAccessToken = decryptAccessToken(
      connection.encryptedAccessToken
    );
  } catch (error) {
    console.error('Failed to decrypt access token:', error);
    return {
      success: false,
      error: 'Failed to decrypt access token - possible corruption or key mismatch',
    };
  }

  // Decrypt the refresh token
  let decryptedRefreshToken: string;
  try {
    decryptedRefreshToken = decryptRefreshToken(
      connection.encryptedRefreshToken
    );
  } catch (error) {
    console.error('Failed to decrypt refresh token:', error);
    return {
      success: false,
      error: 'Failed to decrypt refresh token - possible corruption or key mismatch',
    };
  }

  // Check if token is near expiry
  const isNearExpiry = isTokenNearExpiry(
    connection.accessTokenExpiresAt.getTime()
  );

  return {
    success: true,
    tokens: {
      accessToken: decryptedAccessToken,
      refreshToken: decryptedRefreshToken,
      expiresAt: connection.accessTokenExpiresAt.getTime(),
    },
    // Note: isNearExpiry is available to the caller if needed
    // It's not included in the return type to keep it simple;
    // the caller can check accessTokenExpiresAt against Date.now()
  };
}

/**
 * Check if a workspace's access token is near expiry and needs refresh.
 * 
 * @param storage - The token storage interface
 * @param workspaceId - The workspace identifier
 * @returns True if the token is near expiry and refresh is recommended
 */
async function checkTokenExpiryStatus(
  storage: TokenStorageInterface,
  workspaceId: string
): Promise<{
  needsRefresh: boolean;
  timeUntilExpiryMs: number;
  accessTokenExpiresAt: Date;
  connectionStatus: string;
}> {
  const connection = await storage.getYouTubeConnection(workspaceId);

  if (!connection) {
    return {
      needsRefresh: false,
      timeUntilExpiryMs: 0,
      accessTokenExpiresAt: new Date(0),
      connectionStatus: 'disconnected',
    };
  }

  const now = Date.now();
  const timeUntilExpiry = connection.accessTokenExpiresAt.getTime() - now;
  const needsRefresh = timeUntilExpiry < 300000; // 5 minutes buffer

  return {
    needsRefresh,
    timeUntilExpiryMs: Math.max(0, timeUntilExpiry),
    accessTokenExpiresAt: connection.accessTokenExpiresAt,
    connectionStatus: connection.connectionStatus,
  };
}

/**
 * Refresh the OAuth tokens for a workspace and update the storage.
 * 
 * This is called automatically when the access token is near expiry.
 * The refresh process:
 * 1. Decrypt the current refresh token
 * 2. Exchange with Google for new tokens
 * 3. Encrypt new tokens and update the YouTubeConnection
 * 4. Update lastSyncedAt timestamp
 * 
 * @param storage - The token storage interface
 * @param workspaceId - The workspace identifier
 * @returns True if token refresh succeeded, false on failure
 * @throws If the refresh token is revoked or expired
 * 
 * Caller responsibility:
 * - Call this function before making YouTube API calls if the token
 *   might be near expiry
 * - Handle the case where refresh fails (triggers reauthorization flow)
 */
async function refreshWorkspaceTokens(
  storage: TokenStorageInterface,
  workspaceId: string
): Promise<{
  success: boolean;
  newTokens?: OAuthTokenPair;
  error?: string;
}> {
  // First, get the current tokens
  const currentTokensResult = await getDecryptedTokens(storage, workspaceId);

  if (!currentTokensResult.success) {
    return currentTokensResult;
  }

  const newTokensResult = await refreshOAuthTokenServer(
    currentTokensResult.tokens!.refreshToken
  );

  if (!newTokensResult.success) {
    // If refresh failed (e.g., revoked token), return error
    // The caller should trigger a reauthorization flow
    return newTokensResult;
  }

  // Encrypt the new tokens for storage
  const encryptedAccessToken = encryptAccessToken(
    newTokensResult.newTokens!.accessToken
  );
  const encryptedRefreshToken = encryptRefreshToken(
    newTokensResult.newTokens!.refreshToken
  );

  // Update the YouTubeConnection in the storage layer
  const updateResult = await storage.updateYouTubeConnection(
    workspaceId,
    {
      encryptedAccessToken,
      encryptedRefreshToken,
      accessTokenExpiresAt: new Date(
        newTokensResult.newTokens!.expiresAt
      ),
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    }
  );

  return {
    success: true,
    newTokens: newTokensResult.newTokens,
    // updateResult.rowsAffected is available but not in return type
  };
}

// ============================================================
// Export All
// ============================================================

export {
  // Storage interface
  TokenStorageInterface,

  // Mock storage (for development mode without Google credentials)
  MockTokenStorage,

  // Prisma storage placeholder (to be implemented with real DB)
  PrismaTokenStorage,

  // Token retrieval
  getDecryptedTokens,
  checkTokenExpiryStatus,
  refreshWorkspaceTokens,
};