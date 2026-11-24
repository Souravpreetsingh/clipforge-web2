import { NextResponse } from 'next/server';
import { createPublishingJobComplete, validatePublishJobParams } from '@/lib/integrations/youtube/publishing';
import type { CreatePublishingJobParams } from '@/lib/integrations/youtube/client';

// POST /api/publishing/jobs
// Create a new publishing job for a rendered Short.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      workspaceId,
      youtubeConnectionId,
      generatedClipId,
      renderedAssetId,
      title,
      description,
      tags,
      privacyStatus,
      scheduledAt,
    } = body as CreatePublishingJobParams;

    // Validate the publishing job parameters
    const validation = validatePublishJobParams({
      workspaceId,
      youtubeConnectionId,
      generatedClipId,
      renderedAssetId,
      title,
      description,
      tags,
      privacyStatus,
      scheduledAt,
    });

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 422 }
      );
    }

    // If Google credentials are missing, operate in mock mode
    const areMissing = process.env.GOOGLE_CLIENT_ID == null ||
      process.env.GOOGLE_CLIENT_SECRET == null ||
      process.env.GOOGLE_REDIRECT_URI == null;

    if (areMissing) {
      // Create mock publishing job
      const result = await createPublishingJobComplete(
        {
          workspaceId,
          youtubeConnectionId: youtubeConnectionId || 'mock-connection',
          generatedClipId,
          renderedAssetId,
          title,
          description,
          tags,
          privacyStatus,
          scheduledAt,
        },
        // Mock storage
        new (await import('@/lib/integrations/youtube/tokens')).MockTokenStorage()
      );

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        publishingJob: result.publishingJob,
        mode: 'mock',
        message: 'Publishing job created in mock mode.',
      });
    }

    // Real mode: would interact with Prisma DB
    // For now, return error indicating real implementation needed
    return NextResponse.json(
      { error: 'Real database integration required - Prisma models not yet synced' },
      { status: 501 }
    );
  } catch (error) {
    console.error('Create publishing job error:', error);
    return NextResponse.json(
      { error: 'Failed to create publishing job' },
      { status: 500 }
    );
  }
}

// GET /api/publishing/jobs
// List all publishing jobs for a workspace
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

    // If Google credentials are missing, return mock history
    const areMissing = process.env.GOOGLE_CLIENT_ID == null ||
      process.env.GOOGLE_CLIENT_SECRET == null ||
      process.env.GOOGLE_REDIRECT_URI == null;

    if (areMissing) {
      const { getPublishingHistory } = await import('@/lib/integrations/youtube/publishing');
      const result = await getPublishingHistory(workspaceId);

      return NextResponse.json(result);
    }

    // Real mode: would query DB for publishing jobs
    return NextResponse.json({
      success: false,
      error: 'Real database integration required',
      publishingJobs: [],
    });
  } catch (error) {
    console.error('List publishing jobs error:', error);
    return NextResponse.json(
      { error: 'Failed to list publishing jobs' },
      { status: 500 }
    );
  }
}