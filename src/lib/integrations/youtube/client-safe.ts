/**
 * Client-safe YouTube helpers.
 *
 * These are browser-safe stand-ins for the server-side YouTube integration.
 * The real implementation lives in the server-only modules under this folder;
 * client components must not import those because they depend on Node built-ins.
 */

export function areCredentialsMissing(): boolean {
  return (
    typeof process === "undefined" ||
    process.env.GOOGLE_CLIENT_ID == null ||
    process.env.GOOGLE_CLIENT_SECRET == null ||
    process.env.GOOGLE_REDIRECT_URI == null
  );
}

export const VERSION = "1.0.0";

export enum YouTubeErrorCode {
  AUTH_FAILED = "AUTH_FAILED",
  VALIDATION_FAILED = "VALIDATION_FAILED",
}

export function createAuthError(message: string): Error {
  return new Error(message);
}

export class MockTokenStorage {
  // In-memory token storage (mock mode only)
}

export function generateDefaultMetadata(clip: any, videoInfo: any, _transcript: any) {
  return {
    title: clip?.title || "My Short",
    description: `Clip from ${clip?.startTime ?? 0}s to ${clip?.endTime ?? 30}s.`,
    tags: ["clipforge", "short"],
  };
}

export function validatePublishingMetadata(meta: {
  title?: string;
  description?: string;
  tags?: string[];
  privacyStatus?: string;
  scheduledAt?: Date;
}): { valid: boolean; error?: string } {
  if (!meta.title || !meta.title.trim()) {
    return { valid: false, error: "Video title is required" };
  }
  if (meta.title.length > 100) {
    return { valid: false, error: "Video title must be 100 characters or fewer" };
  }
  return { valid: true };
}

export async function createPublishingJobComplete(params: any, _storage: any) {
  return {
    success: true,
    publishingJob: { id: `job-mock-${Date.now()}`, ...params },
  };
}

export async function hasConnectedChannel(_storage: any, _workspaceId: string): Promise<boolean> {
  return false;
}

export async function retrieveChannelInfo(_storage: any, _workspaceId: string) {
  return null;
}

export function needsReauthorization(_storage: any, _workspaceId: string): boolean {
  return false;
}

export async function getPublishingHistory(_workspaceId: string) {
  return { success: true, publishingJobs: [] as any[] };
}
