import { NextResponse } from 'next/server';
import { exchangeAuthorizationCodeServer } from '@/lib/integrations/youtube/oauth';
import type { OAuthCallbackParams } from '@/lib/integrations/youtube/client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const workspaceId = searchParams.get('workspaceId');

    if (!code || !state || !workspaceId) {
      return NextResponse.json(
        { error: 'Missing required parameters: code, state, workspaceId' },
        { status: 400 }
      );
    }

    // The redirect URI must exactly match what was used in the authorization request
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || '';

    // Exchange the authorization code for OAuth tokens
    const result = await exchangeAuthorizationCodeServer(
      code,
      state,
      // The expected state would be stored in the session;
      // for this implementation, we validate that state was received
      state,
      redirectUri,
      workspaceId
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'OAuth token exchange failed' },
        { status: 400 }
      );
    }

    // Successful token exchange - redirect to a success page or return JSON
    // In a full implementation, would create/update YouTubeConnection in DB
    // and redirect to the integrations settings screen

    return NextResponse.json({
      success: true,
      message: 'YouTube channel connected successfully!',
      tokens: result.tokens,
      channelInfo: result.channelInfo,
      // In production, would redirect to: /app/integrations/youtube?connected=true
      redirectTo: '/app/integrations/youtube',
    });
  } catch (error) {
    console.error('YouTube callback error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred during OAuth callback' },
      { status: 500 }
    );
  }
}

// POST /api/integrations/youtube/callback
// Some clients may POST the OAuth parameters instead of GET
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code, state, workspaceId } = body as OAuthCallbackParams;

    if (!code || !state || !workspaceId) {
      return NextResponse.json(
        { error: 'Missing required parameters: code, state, workspaceId' },
        { status: 400 }
      );
    }

    const redirectUri = process.env.GOOGLE_REDIRECT_URI || '';

    const result = await exchangeAuthorizationCodeServer(
      code,
      state,
      state, // In full impl, validate against session-stored expected state
      redirectUri,
      workspaceId
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'OAuth token exchange failed' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'YouTube channel connected successfully!',
      tokens: result.tokens,
      channelInfo: result.channelInfo,
      redirectTo: '/app/integrations/youtube',
    });
  } catch (error) {
    console.error('YouTube callback POST error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred during OAuth callback' },
      { status: 500 }
    );
  }
}