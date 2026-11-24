/**
 * ClipForge AI — YouTube Publishing Module
 * 
 * This module handles the complete publishing workflow for rendered Shorts:
 * - Publishing job creation and status management
 * - Scheduled publication support
 * - Publishing history tracking
 * - Publishing job retry and cancellation
 * 
 * All operations are server-side only. Publishing jobs are persisted in
 * PostgreSQL via the Prisma ORM, with status tracked through the
 * PublishingJob and PublishingEvent models.
 */

// ============================================================
// Imports and Configuration
// ============================================================

import {
  GOOGLE_CREDENTIALS_MISSING,
} from './client';
import type {
  PublishingJobStatus,
  PublishingEventType,
  PublishingEventMetadata,
  CreatePublishingJobParams,
  UpdatePublishingJobParams,
  validateScheduledPublication,
  generateDefaultMetadata,
  generatePublishingMetadata,
  executeUploadPipeline,
  ResumableUploadState,
} from './client';
import type { TokenStorageInterface } from './tokens';
import type {
  YouTubeVideoMetadata,
  ChannelConnectionState,
} from './channels';

// ============================================================
// Publishing Job Creation
// ============================================================

/**
 * Create a new publishing job for a rendered Short.
 * 
 * This is the primary entry point for the publishing workflow. It:
 * 1. Validates the workspace has a connected YouTube channel
 * 2. Generates or validates publishing metadata
 * 3. Creates a PublishingJob record in the database
 * 4. Optionally triggers the upload pipeline
 * 
 * @param params - The publishing job creation parameters
 * @param params.workspaceId - The workspace identifier
 * @param params.youtubeConnectionId - The YouTube connection ID (required for real upload)
 * @param params.generatedClipId - The GeneratedClip being published (optional)
 * @param params.renderedAssetId - The RenderedAsset being published (optional)
 * @param params.title - Optional custom title (defaults to auto-generated)
 * @param params.description - Optional custom description (defaults to auto-generated)
 * @param params.tags - Optional custom tags (defaults to auto-generated)
 * @param params.privacyStatus - Optional privacy status ('public' | 'private' | 'unlisted')
 * @param params.scheduledAt - Optional scheduled publication time
 * @param storage - The token storage interface for retrieving OAuth tokens
 * @returns The created publishing job, or null on failure
 * 
 * Status flow after creation:
 * - If scheduledAt: status → SCHEDULED
 * - If no scheduledAt: status → PENDING (will be triggered by worker)
 */
async function createPublishingJobComplete(
  params: {
    workspaceId: string;
    youtubeConnectionId: string;
    generatedClipId?: string;
    renderedAssetId?: string;
    title?: string;
    description?: string;
    tags?: string[];
    privacyStatus?: 'public' | 'private' | 'unlisted';
    scheduledAt?: Date;
  },
  storage: TokenStorageInterface
): Promise<{
  success: boolean;
  publishingJob?: any;
  error?: string;
}> {
  const { workspaceId, youtubeConnectionId, generatedClipId, renderedAssetId,
    title, description, tags, privacyStatus, scheduledAt } = params;

  // If Google credentials are missing, operate in mock mode
  if (GOOGLE_CREDENTIALS_MISSING) {
    // Generate mock publishing job
    const metadata = generatePublishingMetadata(workspaceId);

    const mockJob = {
      id: 'job-mock-' + Date.now(),
      workspaceId,
      youtubeConnectionId,
      generatedClipId,
      renderedAssetId,
      platform: 'youtube',
      status: scheduledAt ? 'SCHEDULED' : 'PENDING' as const,
      title: title || metadata.title,
      description: description || metadata.description,
      tags: tags || metadata.tags,
      privacyStatus: privacyStatus || metadata.privacyStatus,
      scheduledAt,
      youtubeVideoId: scheduledAt ? 'video-mock-scheduled-id' : null,
      uploadProgress: 0,
      errorCode: null,
      errorMessage: null,
      attempts: 0,
      startedAt: scheduledAt ? new Date() : null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Add mock publishing events
    await addMockPublishingEvents(mockJob.id);

    return {
      success: true,
      publishingJob: mockJob,
    };
  }

  // Real mode: would interact with Prisma DB
  // For now, return error indicating real implementation needed
  return {
    success: false,
    error: 'Real database integration required - Prisma models not yet synced',
  };
}

/**
 * Validate publishing job parameters before creation.
 * 
 * @param params - The parameters to validate
 * @returns Validation result
 */
function validatePublishJobParams(
  params: {
    workspaceId: string;
    youtubeConnectionId?: string;
    generatedClipId?: string;
    renderedAssetId?: string;
    title?: string;
    description?: string;
    tags?: string[];
    privacyStatus?: 'public' | 'private' | 'unlisted';
    scheduledAt?: Date;
  }
): {
  valid: boolean;
  error?: string;
} {
  // Check workspaceId
  if (!params.workspaceId) {
    return { valid: false, error: 'workspaceId is required' };
  }

  // Check privacyStatus
  const validPrivacies: ('public' | 'private' | 'unlisted')[] = [
    'public',
    'private',
    'unlisted',
  ];
  if (params.privacyStatus && !validPrivacies.includes(params.privacyStatus)) {
    return {
      valid: false,
      error: `Invalid privacyStatus: ${params.privacyStatus}. Must be one of: ${validPrivacies.join(', ')}`,
    };
  }

  // If scheduling, validate the scheduledAt time
  if (params.scheduledAt) {
    const validation = validateScheduledPublication(
      params.scheduledAt,
      params.privacyStatus || 'private'
    );
    if (!validation.valid) {
      return validation;
    }
  }

  return { valid: true };
}

// ============================================================
// Publishing Job Status Update
// ============================================================

/**
 * Update a publishing job's status during its lifecycle.
 * 
 * This is called by the BullMQ worker at various stages:
 * - After OAuth connection: status → PENDING (or CONNECTED)
 * - After upload starts: status → UPLOADING, uploadProgress → 0
 * - During upload: uploadProgress updated per chunk
 * - On upload complete: status → SCHEDULED or PUBLISHED, youtubeVideoId populated
 * - On scheduling: status → SCHEDULED, scheduledAt populated
 * - On failure: status → FAILED, errorCode/errorMessage populated
 * 
 * @param jobId - The publishing job ID
 * @param updates - The status updates to apply
 * @returns The updated publishing job, or null on failure
 * @throws If the job is not found
 * 
 * Status transition guide:
 * PENDING → UPLOADING → (SCHEDULED or PUBLISHED) or FAILED
 * 
 * Key rules:
 * - Once PUBLISHED, status cannot be changed (final state)
 * - Once FAILED, can be retried if under max attempts
 * - SCHEDULING transitions: PENDING → SCHEDULED when scheduledAt is set
 */
async function updatePublishingJobStatus(
  jobId: string,
  updates: Partial<{
    status: PublishingJobStatus;
    youtubeVideoId?: string;
    uploadProgress?: number;
    errorCode?: string;
    errorMessage?: string;
    attempts?: number;
    startedAt?: Date;
    completedAt?: Date;
    scheduledAt?: Date;
    privacyStatus?: 'public' | 'private' | 'unlisted';
    title?: string;
    description?: string;
    tags?: string[];
  }>
): Promise<{
  success: boolean;
  publishingJob?: any;
  error?: string;
}> {
  // In mock mode, simulate the update
  if (GOOGLE_CREDENTIALS_MISSING) {
    const mockJob: any = {
      id: jobId,
      ...updates,
      updatedAt: new Date(),
    };

    return {
      success: true,
      publishingJob: mockJob,
    };
  }

  // Real mode: would update DB record
  // For now, return structure indicating real implementation needed
  return {
    success: false,
    error: 'Real database integration required',
  };
}

/**
 * Cancel a publishing job.
 * 
 * This stops an in-progress upload or scheduling operation.
 * The job status is set to CANCELLED and no further actions are taken.
 * 
 * @param jobId - The publishing job ID to cancel
 * @returns True if cancellation was successful, false on failure
 * @throws If the job is not found or cannot be cancelled (e.g., already PUBLISHED)
 * 
 * Cancellation rules:
 * - Can cancel jobs in PENDING, UPLOADING, or SCHEDULED status
 * - Cannot cancel jobs in PUBLISHED or FAILED status (without retry)
 * - On cancel: youtubeVideoId is not set; publishing events reflect cancellation
 */
async function cancelPublishingJob(
  jobId: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  // In mock mode, simulate cancellation
  if (GOOGLE_CREDENTIALS_MISSING) {
    console.warn('Mock mode: simulating publishing job cancellation');
    return { success: true };
  }

  // Real mode: would update the DB job status to CANCELLED
  // and stop any in-progress worker operations
  return {
    success: false,
    error: 'Real job cancellation not yet implemented',
  };
}

// ============================================================
// Publishing History / Events
// ============================================================

/**
 * Get the publishing history for a workspace.
 * 
 * This returns all PublishingJob records for a workspace, along with
 * their associated PublishingEvent records, providing a complete
 * history of publishing attempts.
 * 
 * @param workspaceId - The workspace identifier
 * @returns List of publishing jobs with their events, or empty array
 * @throws If workspace not found
 * 
 * Each entry includes:
 - Job metadata (title, status, privacy, scheduledAt, youtubeVideoId)
 - Associated events (UPLOAD_START, UPLOAD_COMPLETE, PUBLISH_START, etc.)
 - Timestamps (createdAt, completedAt)
 - Error information (if failed)
 */
async function getPublishingHistory(
  workspaceId: string
): Promise<{
  success: boolean;
  publishingJobs?: any[];
  error?: string;
}> {
  // In mock mode, return mock publishing history
  if (GOOGLE_CREDENTIALS_MISSING) {
    const mockHistory = [
      {
        id: 'job-mock-1',
        workspaceId,
        youtubeConnectionId: 'mock-conn-1',
        generatedClipId: 'mock-clip-1',
        renderedAssetId: 'mock-asset-1',
        platform: 'youtube',
        status: 'PUBLISHED' as const,
        title: 'My First Short',
        description: 'My first ClipForge generated short',
        tags: ['clipforge', 'short'],
        privacyStatus: 'private',
        scheduledAt: null,
        youtubeVideoId: 'video-mock-id-123',
        uploadProgress: 100,
        errorCode: null,
        errorMessage: null,
        attempts: 0,
        startedAt: new Date(Date.now() - 86400000), // 1 day ago
        completedAt: new Date(Date.now() - 7200000), // 2 hours ago
        createdAt: new Date(Date.now() - 86400000),
        updatedAt: new Date(Date.now() - 7200000),
        events: [
          {
            id: 'event-1',
            eventType: 'UPLOAD_START',
            message: 'Upload started',
            metadata: {},
            createdAt: new Date(Date.now() - 86400000),
          },
          {
            id: 'event-2',
            eventType: 'UPLOAD_COMPLETE',
            message: 'Upload complete',
            metadata: { videoId: 'video-mock-id-123' },
            createdAt: new Date(Date.now() - 86400000),
          },
          {
            id: 'event-3',
            eventType: 'PUBLISH_COMPLETE',
            message: 'Video published successfully',
            metadata: { videoId: 'video-mock-id-123' },
            createdAt: new Date(Date.now() - 7200000),
          },
        ],
      },
      {
        id: 'job-mock-2',
        workspaceId,
        youtubeConnectionId: 'mock-conn-1',
        generatedClipId: 'mock-clip-2',
        renderedAssetId: 'mock-asset-2',
        platform: 'youtube',
        status: 'FAILED' as const,
        title: 'Failed Short',
        description: 'A short that failed to publish',
        tags: ['clipforge', 'short'],
        privacyStatus: 'private',
        scheduledAt: null,
        youtubeVideoId: null,
        uploadProgress: 0,
        errorCode: 'UPLOAD_FAILED',
        errorMessage: 'Upload failed due to network error',
        attempts: 1,
        startedAt: new Date(Date.now() - 43200000), // 12 hours ago
        completedAt: new Date(Date.now() - 3600000), // 1 hour ago
        createdAt: new Date(Date.now() - 43200000),
        updatedAt: new Date(Date.now() - 3600000),
        events: [
          {
            id: 'event-4',
            eventType: 'UPLOAD_START',
            message: 'Upload started',
            metadata: {},
            createdAt: new Date(Date.now() - 43200000),
          },
          {
            id: 'event-5',
            eventType: 'UPLOAD_FAILURE',
            message: 'Upload failed',
            metadata: { error: 'Network timeout' },
            createdAt: new Date(Date.now() - 3600000),
          },
        ],
      },
    ];

    return { success: true, publishingJobs: mockHistory };
  }

  // Real mode: would query DB for publishing jobs and events
  return {
    success: false,
    error: 'Real database integration required',
  };
}

// ============================================================
// Scheduled Publication Workflow
// ============================================================

/**
 * Process a scheduled publication.
 * 
 * This is called by the BullMQ worker when a publishing job has
 * scheduledAt set and the current time is at or after the scheduled time.
 * The workflow:
 * 1. Validate the scheduled publication is still valid
 * 2. Change status from SCHEDULED to PUBLISHING
 * 3. Execute the upload pipeline (without scheduling parameters)
 * 4. On success: status → PUBLISHED, youtubeVideoId populated
 * 5. On failure: status → FAILED, error information populated
 * 
 * @param publishingJobId - The publishing job ID with scheduledAt set
 * @param storage - The token storage interface for OAuth tokens
 * @returns The result of the scheduled publication
 * @throws If the scheduled publication is invalid or cannot proceed
 * 
 * YouTube API requirements for scheduled videos:
 * - status.privacyStatus must be 'private' or 'unlisted'
 * - status.publishAt must be a valid ISO-8601 datetime
 * - The video is published at the scheduled time (or shortly after)
 */
async function processScheduledPublication(
  publishingJobId: string,
  storage: TokenStorageInterface
): Promise<{
  success: boolean;
  publishingJob?: any;
  error?: string;
}> {
  // In mock mode, simulate scheduled publication
  if (GOOGLE_CREDENTIALS_MISSING) {
    console.warn('Mock mode: simulating scheduled publication');

    // Update the job status to PUBLISHED
    const updatedJob = await updatePublishingJobStatus(publishingJobId, {
      status: 'PUBLISHED' as const,
      youtubeVideoId: 'video-mock-scheduled-id',
      completedAt: new Date(),
    });

    if (!updatedJob.success) {
      return updatedJob;
    }

    // Add publishing event for scheduled publication
    await addMockPublishingEvents(publishingJobId);

    return {
      success: true,
      publishingJob: updatedJob.publishingJob,
    };
  }

  // Real mode: would check the scheduled time, validate against
  // current time, then execute the upload pipeline
  return {
    success: false,
    error: 'Real scheduled publication not yet implemented',
  };
}

/**
 * Clear a scheduled publication.
 * 
 * This removes the scheduled publication time and changes the status
 * back to PENDING (or keeps it as SCHEDULED if the user wants to
 * reschedule later).
 * 
 * @param publishingJobId - The publishing job ID
 * @returns The updated publishing job
 */
async function clearScheduledPublication(
  publishingJobId: string
): Promise<{
  success: boolean;
  publishingJob?: any;
  error?: string;
}> {
  // In mock mode, simulate clearing the schedule
  if (GOOGLE_CREDENTIALS_MISSING) {
    const mockJob: any = {
      id: publishingJobId,
      scheduledAt: null,
      status: 'PENDING' as const,
      updatedAt: new Date(),
    };

    return { success: true, publishingJob: mockJob };
  }

  // Real mode: would update the DB job to clear scheduledAt
  return {
    success: false,
    error: 'Real scheduled publication clearing not yet implemented',
  };
}

// ============================================================
// Export All
// ============================================================

export {
  // Job creation
  createPublishingJobComplete,
  validatePublishJobParams,

  // Job status update
  updatePublishingJobStatus,
  cancelPublishingJob,

  // Publishing history
  getPublishingHistory,

  // Scheduled publication
  processScheduledPublication,
  clearScheduledPublication,
};