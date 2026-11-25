"use client";

/**
 * Simplified workspace hook.
 * In production this should be replaced with the auth context.
 */
export function useWorkspace() {
  const workspaceId =
    typeof window !== "undefined"
      ? window.localStorage.getItem("workspaceId") || "default-workspace"
      : "default-workspace";

  return { workspaceId };
}
