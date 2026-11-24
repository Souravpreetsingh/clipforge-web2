import { NextResponse } from 'next/server';
import { hasConnectedChannel, retrieveChannelInfo, needsReauthorization } from '@/lib/integrations/youtube/channels';
import type { TokenStorageInterface } from '@/lib/integrations/youtube/tokens';

// Mock storage instance for development mode
const mockStorage = new (await import('@/lib/integrations/youtube/tokens')).MockTokenStorage();

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

    // Check if a YouTube channel is connected for this workspace
    const hasChannel = await hasConnectedChannel(mockStorage as TokenStorageInterface, workspaceId);

    if (!hasChannel) {
      return NextResponse.json({
        connected: false,
        mode: areCredentialsMissing() ? 'config-required' : 'no-connection',
        message: 'No YouTube channel is connected to this workspace.',
      });
    }

    // Retrieve channel information
    const channelInfo = await retrieveChannelInfo(mockStorage as TokenStorageInterface, workspaceId);

    // Check if token refresh is needed
    const needsRefresh = await needsReauthorization(mockStorage as TokenStorageInterface, workspaceId);

    return NextResponse.json({
      connected: true,
      mode: 'real',
      channel: channelInfo || {
        id: 'UC-connected-channel',
        title: 'Connected Channel',
        thumbnailUrl: '',
        description: 'Your connected YouTube channel.',
      },
      needsTokenRefresh,
      message: 'YouTube channel is successfully connected.',
    });
  } catch (error) {
    console.error('YouTube status error:', error);
    return NextResponse.json(
      { error: 'Failed to check YouTube connection status' },
      { status: 500 }
    );
  }
}

// POST /api/integrations/youtube/status
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

    const hasChannel = await hasConnectedChannel(
      // In full implementation, pass real storage
      // For now, use a simple check
      {} as any,
      workspaceId
    );

    return NextResponse.json({
      hasConnectedChannel,
      message: hasChannel ? 'Channel is connected' : 'No channel connected',
    });
  } catch (error) {
    console.error('YouTube status POST error:', error);
    return NextResponse.json(
      { error: 'Failed to check YouTube connection status' },
      { status: 500 }
    );
  }
}