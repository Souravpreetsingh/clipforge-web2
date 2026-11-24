import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Loader2, Moon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { areCredentialsMissing, VERSION } from '@/lib/integrations/youtube';

/**
 * ConnectYouTube - YouTube channel connection card.
 * 
 * Displays the connection status and provides the "Connect YouTube" button.
 * Operates in three modes:
 * 1. Config-required: Google Cloud Console credentials are missing
 * 2. Not-connected: No channel connected (credentials available but not connected)
 * 3. Connected: Channel is already connected
 * 
 * Preserves design system:
 * - Consistent card styling (24px radius, elevated)
 * - Primary/secondary button styles
 * - Material Symbols Outlined icons
 * - Responsive layout
 * - Loading and error states
 */
export function ConnectYouTube() {
  const [mode, setMode] = useState<'config-required' | 'not-connected' | 'connected'>(
    'not-connected'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if Google credentials are configured
  const credentialsMissing = typeof window !== 'undefined' &&
    (process?.env?.GOOGLE_CLIENT_ID == null ||
     process?.env?.GOOGLE_CLIENT_SECRET == null ||
     process?.env?.GOOGLE_REDIRECT_URI == null);

  // Initial mode detection
  useEffect(() => {
    if (credentialsMissing) {
      setMode('config-required');
    } else {
      // Check if a channel is already connected (would call API)
      // For now, default to not-connected
      setMode('not-connected');
    }
  }, [credentialsMissing]);

  // Handle connect button click
  const handleConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      if (credentialsMissing) {
        // Show configuration required state
        setMode('config-required');
        setError(
          'Google Cloud Console credentials are not configured. Please set up GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in .env.local.'
        );
        return;
      }

      // Redirect to the OAuth connect API endpoint
      // The API will redirect the browser to Google's consent screen
      window.location.href = `/api/integrations/youtube/connect?workspaceId=ws-dev-001`;
    } catch (err) {
      setError('Failed to initiate YouTube connection');
      setLoading(false);
    }
  };

  // If already connected, show connected state
  if (mode === 'connected') {
    return (
      <div className="space-y-4 p-6 bg-card rounded-2xl shadow-sm border-border">
        <div className="flex items-center gap-3">
          <CheckCircle className="h-6 w-6 text-primary" />
          <div>
            <h3 className="font-serif font-medium">YouTube Connected</h3>
            <p className="text-sm text-muted-foreground">
              Your YouTube channel is connected and ready for publishing.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <Button
            asChild
            variant="outline"
            size="sm"
            onClick={() => window.location.href = '/api/integrations/youtube/callback?reconnect=true'}
          >
            Reauthorize
          </Button>
          <Button
            asChild
            variant="default"
            size="sm"
            onClick={() => window.location.href = '/app/integrations/youtube'}
          >
            View Channel
          </Button>
        </div>
      </div>
    );
  }

  // If config-required, show configuration needed state
  if (mode === 'config-required') {
    return (
      <div className="space-y-4 p-6 bg-card rounded-2xl shadow-sm border-border bg-warning/10 border-warning/20">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-6 w-6 text-warning" />
          <div>
            <h3 className="font-serif font-medium text-warning">Google Cloud Configuration Required</h3>
            <p className="text-sm text-muted-foreground">
              ClipForge AI needs Google Cloud Console credentials to integrate with YouTube.
            </p>
          </div>
        </div>

        <div className="mt-4 p-4 bg-background rounded-xl border-border border-gray/20">
          <h4 className="font-medium mb-2">Setup Required</h4>
          <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
            <li>
              Create a Google Cloud project at console.cloud.google.com
            </li>
            <li>
              Configure OAuth 2.0 client ID (Web application type)
            </li>
            <li>
              Set authorized redirect URI: http://localhost:3000/api/integrations/youtube/callback
            </li>
            <li>
              Enable YouTube Data API v3
            </li>
            <li>
              Add YOUTUBE_OAUTH_ENCRYPTION_KEY to .env.local (32 bytes base64)
            </li>
          </ol>
        </div>

        <div className="mt-6">
          <Button
            onClick={handleConnect}
            className="w-full"
          >
            Configure Google Cloud Console
          </Button>
        </div>
      </div>
    );
  }

  // If not-connected, show the connect button
  return (
    <div className="space-y-4 p-6 bg-card rounded-2xl shadow-sm border-border">
      <div className="flex items-center gap-3">
        <AlertCircle className="h-6 w-6 text-muted-foreground" />
        <h3 className="font-serif font-medium">Connect YouTube Channel</h3>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Connect your YouTube channel to upload and schedule Shorts videos.
      </p>

      <Button
        onClick={handleConnect}
        className="w-full"
        disabled={loading}
        ariaBusy={loading}
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Connecting...
        ) : (
          'Connect YouTube'
        )}
      </Button>

      {error && (
        <div className="mt-3 p-3 rounded-xl bg-error/10 border-error/20 text-error/90 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}