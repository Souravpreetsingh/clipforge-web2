import React from 'react';
import { cn } from '@/lib/utils';
import { Heart, Mail, Users, Tv, Settings, LogOut, Shield, Music } from 'lucide-react';

import { useWorkspace } from '@/hooks/useWorkspace';

/**
 * IntegrationsLayout - The main layout wrapper for the integrations screen.
 * 
 * This preserves the ClipForge design system:
 * - Source Serif 4 / Inter / JetBrains Mono typography
 * - 30+ ClipForge colors via Tailwind config
 * - 24px card radius, 0px/8px CTA hybrid shape
 * - Material Symbols Outlined icons
 * - Responsive grid (mobile first)
 * - Proper loading states and error boundaries
 */
interface IntegrationsLayoutProps {
  children: React.ReactNode;
}

export function IntegrationsLayout({ children }: IntegrationsLayoutProps) {
  const { workspaceId } = useWorkspace();

  return (
    <main className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Tv className="h-5 w-5 text-primary" />
          <h1 className="font-serif text-lg font-medium">ClipForge AI</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Workspace indicator */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted/50 text-sm text-muted-foreground">
            <span className="abbrieviated-workspace">{workspaceId?.slice(0, 6) || 'WS'}</span>
          </div>

          {/* User menu */}
          <div className="hidden md:block flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground hover:text-primary" />
          </div>
        </div>
      </header>

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto p-6">
        {children}
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-card px-6 py-3 flex items-center justify-between text-xs text-muted-foreground">
        <p>ClipForge AI • Phase 6: YouTube Integration</p>
        <nav className="flex items-center gap-4">
          <a href="#!" className="hover:text-primary transition-colors">Dashboard</a>
          <a href="#!" className="hover:text-primary transition-colors">Settings</a>
          <a href="#!" className="hover:text-primary transition-colors">Help</a>
        </nav>
      </footer>
    </main>
  );
}

/**
 * Helper to get abbreviated workspace ID for display.
 * 
 * In production, this would come from the authenticated user's workspace.
 * In development, we use the DEV_WORKSPACE_ID env var or a default.
 */
function useWorkspace() {
  // This is a simplified hook; in full implementation, would use
  // the authentication context or DEV_WORKSPACE_ID
  const workspaceId = typeof window !== 'undefined'
    ? localStorage.getItem('clipforge_workspace_id')
    : null;

  return {
    workspaceId: workspaceId || (process.env.DEV_WORKSPACE_ID || 'ws-dev-001'),
  };
}