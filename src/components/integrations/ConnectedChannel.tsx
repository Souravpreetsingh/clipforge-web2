import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  CheckCircle, 
  LogOut, 
  RefreshCw, 
  Shield,
  Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { areCredentialsMissing } from '@/lib/integrations/youtube';
import { retrieveChannelInfo, hasConnectedChannel, needsReauthorization } from '@/lib/integrations/youtube/channels';
import type { TokenStorageInterface } from '@/lib/integrations/youtube/tokens';

// Mock storage for development
const mockStorage = new (await import('@/lib/integrations/youtube/tokens')).MockTokenStorage();

/**
 * ConnectedChannel - Displays the connected YouTube channel details.
 * 
 * Shows channel name, thumbnail, ID, description, and connection status.
 * Provides actions: Reauthorize, Disconnect.
 * 
 * Preserves design system:
 * - Channel thumbnail with fallback avatar
 * - Consistent typography (Source Serif 4 for title, JetBrains Mono for ID)
 * - Action buttons with proper hover states
 * - Status badges with appropriate colors
 * - Responsive grid for thumbnail + info
 */
export function ConnectedChannel() {
  const [workspaceId] = useSearchParams()
    .get('workspaceId')
    ?.split('=') || ['ws-dev-001'];
  const [mode, setMode] = useState<'connected' | 'reauthorizing' | 'disconnected'>(
    'connected'
  );
  const [channel, setChannel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [needsRefresh, setNeedsRefresh] = useState(false);

  // Initial channel info fetch
  useEffect(() => {
    // If credentials are missing, use mock channel
    if (areCredentialsMissing()) {
      setMode('connected');
      setChannel({
        id: 'UC-mock-workspace-001',
        title: 'Mock Channel',
        thumbnailUrl: 'https://ssl.gstatic.com/youtube/icons/avatar.png',
        description: 'Mock YouTube channel for development purposes.',
      });
      setLoading(false);
      return;
    }

    // In real mode, would fetch from API
    // For now, simulate a short delay then check status
    const checkConnection = async () => {
      const isConnected = await hasConnectedChannel(
        new (await import('@/lib/integrations/youtube/tokens')).MockTokenStorage(),
        workspaceId || 'ws-dev-001'
      );

      setLoading(false);

      if (isConnected) {
        setMode('connected');
        setChannel({
          id: 'UC-connected-001',
          title: 'Connected Channel',
          thumbnailUrl: 'https://ssl.gstatic.com/youtube/icons/avatar.png',
          description: 'Your connected YouTube channel.',
        });
      } else {
        setMode('disconnected');
      }
    };

    checkConnection();
  }, [workspaceId]);

  // Handle reauthorize click
  const handleReauthorize = async () => {
    setMode('reauthorizing');
    setLoading(true);

    try {
      // In real mode, would initiate OAuth reauthorization flow
      // For now, simulate success after a delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      setMode('connected');
      setChannel({
        id: 'UC-reauthorized-001',
        title: 'Reauthorized Channel',
        thumbnailUrl: 'https://ssl.gstatic.com/youtube/icons/avatar.png',
        description: 'Your YouTube channel has been reauthorized.',
      });
      setNeedsRefresh(true);
    } catch (err) {
      setMode('connected');
      setLoading(false);
    }
  };

  // Handle disconnect click
  const handleDisconnect = async () => {
    // In real mode, would revoke tokens and clear DB record
    // For now, simulate disconnection
    setMode('disconnected');
    setChannel(null);
  };

  if (!channel) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading channel...</span>
      </div>
    );
  }

  return (
    <div className="p-6 bg-card rounded-2xl shadow-sm border-border max-w-2xl mx-auto">
      {/* Channel Header */}
      <div className="border-b border-border pb-4 mb-4">
        <div className="flex items-center gap-3">
          {/* Channel Thumbnail */}
          <div className="relative w-24 h-24 rounded-full overflow-hidden flex-shrink-0">
            <img
              src={channel?.thumbnailUrl || '/placeholder-channel-thumbnail.png'}
              alt={channel?.title || 'Channel'}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {/* Connection status indicator */}
            {mode === 'reauthorizing' && (
              <div className="absolute top-0 right-0 bottom-0 left-0 rounded-full border-2 border-primary/50 animate-spin" />
            )}
          </div>

          {/* Channel Info */}
          <div>
            <h2 className="font-serif font-xl font-medium text-foreground">
              {channel.title}
            </h2>
            <p className="text-sm text-muted-foreground">
              {channel.id}
            </p>
          </div>
        </div>
      </div>

      {/* Channel Description */}
      {channel.description && (
        <p className="text-sm text-muted-foreground mb-6 line-clamp-3">
          {channel.description}
        </p>
      )}

      {/* Connection Status Badge */}
      <div className="flex items-center gap-2 mb-6 p-3 rounded-xl bg-muted/50 border-border">
        <Shield className="h-4 w-4" />
        <span className="font-medium">
          {mode === 'reauthorizing'
            ? 'Reauthorizing...'
            : mode === 'disconnected'
              ? 'Disconnected'
              : 'Connected'}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-border">
        {/* Reauthorize button - shown when token needs refresh or for periodic re-auth */}
        {needsRefresh && mode !== 'disconnected' && (
          <Button
            size="icon"
            variant="outline"
            onClick={handleReauthorize}
            title="Reauthorize YouTube Channel"
            className="p-2 rounded-md hover:bg-primary/5 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}

        {/* Disconnect button */}
        {!mode && mode !== 'reauthorizing' && (
          <Button
            size="default"
            variant="outline"
            onClick={handleDisconnect}
            className="w-full sm:w-auto"
          >
            <LogOut className="mr-2 h-4 w-4" />Disconnect Channel
          </Button>
        )}

        {/* Connect button - shown when disconnected */}
        {mode === 'disconnected' && (
          <Button
            size="default"
            onClick={handleDisconnect}
            className="w-full sm:w-auto text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/50"
          >
            <LogOut className="mr-2 h-4 w-4" />Connect Channel
          </Button>
        )}
      </div>
    </div>
  );
}