import { NextResponse } from 'next/server';
import { getPublishingJobWithEvents, updatePublishingJobStatus, cancelPublishingJob } from '@/lib/integrations/youtube/publishing';

// GET /api/publishing/jobs/[id]
// Get a specific publishing job with its events/history
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const jobId = params.id;

    if (!jobId) {
      return NextResponse.json(
        { error: ' Publishing job ID is required' },
        { status: 400 }
      );
    }

    // If Google credentials are missing, return mock job with events
    const areMissing = process.env.GOOGLE_CLIENT_ID == null ||
      process.env.GOOGLE_CLIENT_SECRET == null ||
      process.env.GOOGLE_REDIRECT_URI == null;

    if (areMissing) {
      const { getPublishingJobWithEvents } = await import('@/lib/integrations/youtube/publishing');
      const result = await getPublishingJobWithEvents(jobId);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 500 }
        );
      }

      return NextResponse.json(result);
    }

    // Real mode: would query DB for the publishing job and events
    return NextResponse.json({
      success: false,
      error: 'Real database integration required',
      publishingJob: null,
      events: [],
    });
  } catch (error) {
    console.error('Get publishing job error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve publishing job' },
      { status: 500 }
    );
  }
}

// PATCH /api/publishing/jobs/[id]
// Update a publishing job (status, metadata, etc.)
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const jobId = params.id;
    const body = await request.json();
    const updates = body as Partial<{
      status: string;
      youtubeVideoId?: string;
      uploadProgress?: number;
      errorCode?: string;
      errorMessage?: string;
      attempts?: number;
      scheduledAt?: Date;
      privacyStatus?: string;
      title?: string;
      description?: string;
      tags?: string[];
    }>;

    // If Google credentials are missing, simulate the update
    const areMissing = process.env.GOOGLE_CLIENT_ID == null ||
      process.env.GOOGLE_CLIENT_SECRET == null ||
      process.env.GOOGLE_REDIRECT_URI == null;

    if (areMissing) {
      const { updatePublishingJobStatus } = await import('@/lib/integrations/youtube/publishing');
      const result = await updatePublishingJobStatus(jobId, updates);

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
      });
    }

    // Real mode: would update DB record
    return NextResponse.json(
      { error: 'Real database integration required' },
      { status: 501 }
    );
  } catch (error) {
    console.error('Update publishing job error:', error);
    return NextResponse.json(
      { error: 'Failed to update publishing job' },
      { status: 500 }
    );
  }
}

// POST /api/publishing/jobs/[id]/retry
// Re-enqueue a failed publishing job
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const jobId = params.id;

    // If Google credentials are missing, simulate retry
    const areMissing = process.env.GOOGLE_CLIENT_ID == null ||
      process.env.GOOGLE_CLIENT_SECRET == null ||
      process.env.GOOGLE_REDIRECT_URI == null;

    if (areMissing) {
      console.warn('Mock mode: simulating publishing job retry');
      return NextResponse.json({
        success: true,
        message: 'Publishing job retry initiated in mock mode',
        jobId,
      });
    }

    // Real mode: would check retry limits and re-enqueue the BullMQ job
    return NextResponse.json(
      { error: 'Real retry functionality not yet implemented' },
      { status: 501 }
    );
  } catch (error) {
    console.error('Retry publishing job error:', error);
    return NextResponse.json(
      { error: 'Failed to retry publishing job' },
      { status: 500 }
    );
  }
}

// POST /api/publishing/jobs/[id]/cancel
// Cancel a publishing job
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const jobId = params.id;

    // If Google credentials are missing, simulate cancellation
    const areMissing = process.env.GOOGLE_CLIENT_ID == null ||
      process.env.GOOGLE_CLIENT_SECRET == null ||
      process.env.GOOGLE_REDIRECT_URI == null;

    if (areMissing) {
      const { cancelPublishingJob } = await import('@/lib/integrations/youtube/publishing');
      const result = await cancelPublishingJob(jobId);

      return NextResponse.json({
        success: result.success,
        error: result.error,
        mode: 'mock',
      });
    }

    // Real mode: would update the DB job status to CANCELLED
    return NextResponse.json(
      { error: 'Real cancellation not yet implemented' },
      { status: 501 }
    );
  } catch (error) {
    console.error('Cancel publishing job error:', error);
    return NextResponse.json(
      { error: 'Failed to cancel publishing job' },
      { status: 500 }
    );
  }
}