import { NextResponse } from 'next/server';
import { areCredentialsMissing } from '@/lib/integrations/youtube';
import { getOAuthAuthorizationUrl } from '@/lib/integrations/youtube/oauth';
import type { ConnectYouTubeParams } from '@/lib/integrations/youtube/client';

// POST /api/integrations/youtube/connect
// Initiate the Google OAuth 2.0 authorization flow for YouTube channel connection.
// Redirects the browser to the Google consent screen.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { workspaceId, redirectUri, scopes } = body as ConnectYouTubeParams;

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId is required' },
        { status: 400 }
      );
    }

    // If credentials are missing, return a configuration-required response
    // instead of redirecting. The frontend can display a config required message.
    if (areCredentialsMissing()) {
      return NextResponse.json(
        {
          mode: 'config-required',
          message:
            'Google Cloud Console credentials are not configured. ' +
            'Please set up GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and ' +
            'GOOGLE_REDIRECT_URI in .env.local to enable YouTube integration.',
          connectUrl: `/api/integrations/youtube/connect?workspaceId=${workspaceId}&mock=true&mode=config-required`,
        },
        { status: 200 }
      );
    }

    // Generate the OAuth authorization URL
    const authUrl = getOAuthAuthorizationUrl(
      workspaceId,
      redirectUri,
      scopes
    );

    // Return the authorization URL; the frontend will redirect the browser
    return NextResponse.json({
      mode: 'redirect',
      authorizationUrl: authUrl,
      message: 'Redirecting to Google OAuth consent screen...',
    });
  } catch (error) {
    console.error('YouTube connect error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate YouTube connection' },
      { status: 500 }
    );
  }
}

// GET /api/integrations/youtube/connect?workspaceId=...
// Some frameworks support GET for initiating OAuth; handle gracefully
export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('workspaceId');

  if (!workspaceId) {
    return NextResponse.json(
      { error: 'workspaceId query parameter is required' },
      { status: 400 }
    );
  }

  // If credentials are missing, return config-required response
  if (areCredentialsMissing()) {
    return NextResponse.json(
      {
        mode: 'config-required',
        message:
          'Google Cloud Console credentials are not configured. ' +
          'Please set up GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and ' +
          'GOOGLE_REDIRECT_URI in .env.local to enable YouTube integration.',
      },
      { status: 200 }
    );
  }

  // Generate OAuth URL for GET request as well
  const authUrl = getOAuthAuthorizationUrl(workspaceId);

  return NextResponse.json({
    mode: 'redirect',
    authorizationUrl: authUrl,
    message: 'Redirecting to Google OAuth consent screen...',
  });
}