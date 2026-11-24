import { NextResponse } from 'next/server';
import { retrieveChannelInfo, hasConnectedChannel, needsReauthorization } from '@/lib/integrations/youtube/channels';
import type { TokenStorageInterface } from '@/lib/integrations/youtube/tokens';

// Mock storage instance for development mode
const mockStorage = new (await import('@/lib/integrations/youtube/tokens')).MockTokenStorage();

// Helper to check if credentials are missing
function areCredentialsMissing(): boolean {
  return process.env.GOOGLE_CLIENT_ID == null ||
    process.env.GOOGLE_CLIENT_SECRET == null ||
    process.env.GOOGLE_REDIRECT_URI == null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId query parameter is required' },
        { status: 400 }
      );
    }

    // Check if a YouTube channel is connected
    const isConnected = await hasConnectedChannel(mockStorage as TokenStorageInterface, workspaceId);

    if (!isConnected) {
      return NextResponse.json({
        connected: false,
        mode: areCredentialsMissing() ? 'config-required' : 'not-connected',
        message: 'No YouTube channel is connected to this workspace.',
        // Prompt to connect
        connectPrompt: {
          text: 'Connect YouTube Channel',
          action: '/api/integrations/youtube/connect',
        },
      });
    }

    // Retrieve full channel information
    const channelInfo = await retrieveChannelInfo(mockStorage as TokenStorageInterface, workspaceId);

    // Check if token refresh is needed
    const refreshStatus = await needsReauthorization(mockStorage as TokenStorageInterface, workspaceId);

    return NextResponse.json({
      connected: true,
      mode: areCredentialsMissing() ? 'mock' : 'real',
      channel: channelInfo || {
        id: 'UC-connected-channel',
        title: 'Connected Channel',
        thumbnailUrl: '/placeholder-channel-thumbnail.png',
        description: 'Your connected YouTube channel.',
      },
      needsTokenRefresh: refreshStatus,
      message: 'YouTube channel connection retrieved successfully.',
    });
  } catch (error) {
    console.error('YouTube channel error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve YouTube channel information' },
      { status: 500 }
    );
  }
}

// POST /api/integrations/youtube/channel
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { workspaceId } = body;

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId is required' },
        { status: 400 }
      );
    }

    const isConnected = await hasConnectedChannel(
      mockStorage as TokenStorageInterface,
      workspaceId
    );

    if (!isConnected) {
      return NextResponse.json(
        { connected: false, message: 'No YouTube channel connected' },
        { status: 404 }
      );
    }

    const channelInfo = await retrieveChannelInfo(mockStorage as TokenStorageInterface, workspaceId);

    return NextResponse.json({
      connected: true,
      channel: channelInfo,
      message: 'YouTube channel details retrieved successfully.',
    });
  } catch (error) {
    console.error('YouTube channel POST error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve YouTube channel information' },
      { status: 500 }
    );
  }
}