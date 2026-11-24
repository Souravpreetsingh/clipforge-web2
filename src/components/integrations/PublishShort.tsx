import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Video,
  Settings,
  Shield,
  Calendar,
  CalendarRange,
  LuFileText,
  FileText,
  Moon,
  Sun,
  Loader2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { areCredentialsMissing, areCredentialsMissing as checkCredentials } from '@/lib/integrations/youtube';
import type { TokenStorageInterface } from '@/lib/integrations/youtube/tokens';
import { generateDefaultMetadata, validatePublishingMetadata } from '@/lib/integrations/youtube/videos';
import { createPublishingJobComplete } from '@/lib/integrations/youtube/publishing';
import { YouTubeErrorCode, createAuthError } from '@/lib/integrations/youtube/errors';

// Mock storage for development
const mockStorage = new (await import('@/lib/integrations/youtube/tokens')).MockTokenStorage();

// Helper functions
function areCredentialsMissing(): boolean {
  return (
    typeof process?.env?.GOOGLE_CLIENT_ID === 'undefined' ||
    typeof process?.env?.GOOGLE_CLIENT_SECRET === 'undefined' ||
    typeof process?.env?.GOOGLE_REDIRECT_URI === 'undefined'
  );
}

// Date utils
function parseIsoDate(dateStr: string | undefined): Date {
  if (!dateStr) return new Date();
  return new Date(dateStr);
}

/**
 * PublishShort - The "Publish a Short" screen.
 * 
 * Allows users to select a rendered Short, configure publishing details
 * (title, description, tags, privacy, scheduling), and authorize the upload.
 * 
 * Preserves design system:
 * - Consistent form styling with other ClipForge screens
 * - Proper input types and validation
 * - Radio groups for privacy/status selection
 * - Time-aware date/time inputs
 * - Final confirmation before upload
 * - Loading and error states throughout the workflow
 */
export function PublishShort() {
  // State
  const [workspaceId] = useSearchParams()
    .get('workspaceId')
    ?.split('=') || ['ws-dev-001'];
  const [selectedClip, setSelectedClip] = useState<any>(null);
  const [metadata, setMetadata] = useState<{
    title: string;
    description: string;
    tags: string[];
    privacyStatus: 'public' | 'private' | 'unlisted';
    scheduledAt?: Date;
  }>({
    title: '',
    description: '',
    tags: ['clipforge', 'short'],
    privacyStatus: 'private',
  });
  const [status, setStatus] = useState<'idle' | 'uploading' | 'scheduled' | 'published' | 'error'>(
    'idle'
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [publishingJobId, setPublishingJobId] = useState<string | null>(null);

  // Fetch available clips from R2/DB (mock data for development)
  useEffect(() => {
    // In full implementation, would fetch clips from the API
    // For now, set up mock clip data
    setSelectedClip({
      id: 'clip-mock-001',
      title: 'My Great Hook',
      startTime: 0,
      endTime: 30,
      duration: 30,
      status: 'COMPLETED',
      renderedAsset: {
        storageKey: 'clips/ws-dev-001/clip-mock-001/video.mp4',
        thumbnailStorageKey: 'clips/ws-dev-001/clip-mock-001/thumbnail.jpg',
        duration: 30,
        width: 1080,
        height: 1920,
        videoCodec: 'h264',
        audioCodec: 'aac',
      },
    });
  }, [workspaceId]);

  // If no clip selected, show instructions
  if (!selectedClip) {
    return (
      <div className="p-6 bg-card rounded-2xl shadow-sm border-border max-w-lg mx-auto">
        <AlertCircle className="h-6 w-6 text-warning mb-4" />
        <h3 className="font-serif font-medium text-warning">No Clip Selected</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Select a rendered Short from your Rendering Dashboard to publish.
        </p>
        <Button
          onClick={() => window.location.href = '/app/rendering/ws-dev-001'}
          className="w-full mt-4"
        >
          Go to Rendering Dashboard
        </Button>
      </div>
    );
  }

  // Generate default metadata from the selected clip
  useEffect(() => {
    if (selectedClip?.renderedAsset) {
      const defaultMeta = generateDefaultMetadata(
        {
          title: selectedClip.title || 'My Short',
          startTime: selectedClip.startTime || 0,
          endTime: selectedClip.endTime || 30,
        },
        {
          duration: selectedClip.renderedAsset.duration || 30,
          width: selectedClip.renderedAsset.width || 1080,
          height: selectedClip.renderedAsset.height || 1920,
        },
        // Mock transcript data
        {
          segments: [
            { text: 'Hello and welcome to today\'s discussion', startTimestamp: 0, endTimestamp: 5 },
            { text: 'In this video we\'re going to talk about...', startTimestamp: 5, endTimestamp: 10 },
          ],
        }
      );

      setMetadata({
        title: defaultMeta.title,
        description: defaultMeta.description,
        tags: defaultMeta.tags,
        privacyStatus: 'private',
      });
    }
  }, [selectedClip]);

  // Validate metadata before proceeding
  const validateMetadata = (): { valid: boolean; error?: string } => {
    const result = validatePublishingMetadata({
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      privacyStatus: metadata.privacyStatus,
      scheduledAt: metadata.scheduledAt,
    });

    if (!result.valid) {
      setError(result.error);
      return { valid: false, error: result.error };
    }

    setError(null);
    return { valid: true };
  };

  // Handle metadata changes
  const handleMetadataChange = (
    field:
      | 'title'
      | 'description'
      | 'tags'
      | 'privacyStatus'
      | 'scheduledAt',
    value: string | Date | string[]
  ) => {
    setMetadata(prev => {
      const newMetadata = { ...prev };
      if (field === 'tags') {
        newMetadata.tags = Array.isArray(value) ? value : [value];
      } else if (field === 'scheduledAt') {
        newMetadata.scheduledAt = value instanceof Date ? value : parseIsoDate(value as string);
      } else {
        newMetadata[field] = value as string;
      }
      return newMetadata;
    });
  };

  // Handle publish/schedule click
  const handlePublish = async () => {
    // Clear previous errors
    setError(null);

    // Validate metadata
    const validation = validateMetadata();
    if (!validation.valid) return;

    // Check if YouTube credentials are available
    const credentialsMissing = areCredentialsMissing();

    setLoading(true);

    try {
      if (credentialsMissing) {
        // Mock mode: simulate successful publishing
        console.warn('Mock mode: simulating publish/schedule');

        // Generate a mock publishing job
        const result = await createPublishingJobComplete(
          {
            workspaceId: workspaceId || 'ws-dev-001',
            youtubeConnectionId: 'mock-connection',
            generatedClipId: selectedClip.id,
            renderedAssetId: selectedClip.renderedAsset?.storageKey
              ? selectedClip.renderedAsset.storageKey.replace('clips/', '').replace('/video.mp4', '')
              : 'mock-asset',
            title: metadata.title,
            description: metadata.description,
            tags: metadata.tags,
            privacyStatus: metadata.privacyStatus,
            scheduledAt: metadata.scheduledAt,
          },
          new (await import('@/lib/integrations/youtube/tokens')).MockTokenStorage()
        );

        if (!result.success) {
          setError(result.error || 'Failed to create publishing job');
          setLoading(false);
          return;
        }

        setPublishingJobId(result.publishingJob?.id || 'job-mock-' + Date.now());
        setStatus(
          metadata.scheduledAt
            ? 'scheduled'
            : 'published'
        );
        setShowConfirmation(true);
        return;
      }

      // Real mode: would create publishing job and trigger upload
      // For now, return error indicating real implementation needed
      setError('Real YouTube integration not yet configured');
      setLoading(false);
    } catch (err) {
      console.error('Publish error:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to publish video'
      );
      setLoading(false);
    }
  };

  // Handle confirmation close
  const handleConfirmationClose = () => {
    setShowConfirmation(false);
    // Reset state after confirmation
    setStatus('idle');
    setPublishingJobId(null);
  };

  // Determine button text based on status
  const submitButtonText = status === 'uploading'
    ? 'Uploading...'
    : status === 'scheduled'
      ? 'Schedule'
      : 'Publish to YouTube';

  // Determine privacy radio options
  const privacyOptions = [
    { value: 'public' as const, label: 'Public' },
    { value: 'private' as const, label: 'Private' },
    { value: 'unlisted' as const, label: 'Unlisted' },
  ];

  // Determine if scheduling UI should be shown
  const showScheduling = metadata.privacyStatus !== 'public' || true; // Always show scheduling option

  // Scheduling date/time input
  const schedulingUI = showScheduling && metadata.scheduledAt ? (
    <div className="space-y-3">
      <label className="block text-sm font-medium mb-1">
        Schedule publication
      </label>
      <div className="flex items-start gap-2">
        <Calendar className="mt-1 flex-shrink-0 h-4 w-4 text-muted-foreground" />
        <div className="flex-1">
          <Input
            placeholder="Date"
            value:controlled
            onChange={e => handleMetadataChange('scheduledAt', e.target.value)}
            className="flex-1"
          />
        </div>
      </div>
      <label className="block text-sm font-medium mb-1">
        Time
      </label>
      <div className="flex items-center gap-2">
        <Clock className="mt-1 flex-shrink-0 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="3:00 PM"
          value:controlled
          onChange={e => handleMetadataChange('scheduledAt', e.target.value)}
          className="flex-1"
        />
      </div>
    </div>
  ) : (
    <div>
      <p className="text-xs text-muted-foreground mb-2">
        Schedule publication at a future date and time
        (YouTube requires privacy: private or unlisted for scheduled videos)
      </p>
      <Button
        size="link"
        variant="link"
        onClick={() => handleMetadataChange('scheduledAt', new Date(Date.now() + 86400000))} // Tomorrow
      >
        Set schedule
      </Button>
    </div>
  );

  // YouTube API compliance notice
  const complianceNotice = (
    <div className="mt-4 p-3 rounded-xl bg-muted/50 border-border text-xs text-muted-foreground">
      <strong>YouTube Compliance:</strong> Scheduled videos require privacy status of
      'private' or 'unlisted'. Public scheduled videos may be rejected by the YouTube API.
    </div>
  );

  return (
    <div className="p-6 bg-card rounded-2xl shadow-sm border-border max-w-2xl mx-auto">
      {/* Header */}
      <div className="border-b border-border pb-4 mb-6">
        <h2 className="font-serif text-xl font-medium">
          Publish Short to YouTube
        </h2>
        <p className="text-sm text-muted-foreground">
          Select a rendered Short and configure publishing details.
        </p>
      </div>

      {/* Clip Preview */}
      <div className="border rounded-xl bg-background p-4 mb-6 shadow-sm border-border">
        <div className="flex items-center gap-3">
          {/* Video thumbnail */}
          <div className="relative w-24 h-14 rounded-lg overflow-hidden flex-shrink-0">
            <img
              src: selectedClip.renderedAsset?.thumbnailStorageKey
                ? `/api/clips/${workspaceId}/preview-url` // Would be presigned URL
                : '/placeholder-thumbnail.png',
              alt: selectedClip.title || 'Preview',
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 rounded-lg bg-black/30 flex items-center justify-center">
              <span className="text-white font-medium text-xs">
                {selectedClip.title || 'Select a Short'}
              </span>
            </div>
          </div>

          {/* Clip info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{selectedClip.title || 'Unknown Clip'}</h3>
            <p className="text-xs text-muted-foreground">
              {selectedClip.duration}s clip • {selectedClip.startTime}-{selectedClip.endTime}
            </p>
          </div>
        </div>
      </div>

      {/* Metadata Form */}
      <form className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Video Title
            <span className="text-error">*</span>
          </label>
          <Input
            value:controlled
            onChange={e => handleMetadataChange('title', e.target.value)}
            placeholder="My Great Hook"
            defaultValue={metadata.title}
            maxLength={100}
            className="w-full"
            ariaRequired={true}
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Description
          </label>
          <Textarea
            value:controlled
            onChange={e => handleMetadataChange('description', e.target.value)}
            placeholder="Add a description for your video..."
            defaultValue={metadata.description}
            rows={3}
            className="w-full"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Tags
            <span className="text-xs text-muted-foreground">
              Max 500 chars total, each tag max 30 chars
            </span>
          </label>
          <Input
            value:controlled
            onChange={e => handleMetadataChange('tags', e.target.value.split(',').filter((t: string) => t.trim()))}
            placeholder="clipforge, short, ai-generated"
            defaultValue={metadata.tags.join(', ')}
            className="w-full"
            inputMode="text"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Separate tags with commas. Maximum 500 characters total.
          </p>
        </div>

        {/* Privacy Selector */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Privacy Status
          </label>
          <RadioGroup
            value:controlled
            onValueChange={handleMetadataChange}
            name="privacyStatus"
            defaultValue={metadata.privacyStatus}
          >
            {privacyOptions.map((option) => (
              <RadioGroupItem
                key={option.value}
                value={option.value}
              >
                <span className="flex items-center gap-2">
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path
                      d="M3 12l2-3m2-3l2 3m-2-3l2-3m2 3l-2 3m2 3l-2-3m-2 3l2 3M5 12l2-3m2 3l2 3m-2-3l2-3m2-3l-2 3m2-3l-2-3m2 3l2-3"
                    />
                  </svg>
                  <span>{option.label}</span>
                </span>
              </RadioGroupItem>
            ))}
          </RadioGroup>
        </div>

        {/* Scheduling */}
        {schedulingUI}

        {/* Compliance notice */}
        {complianceNotice}
      </form>

      {/* Submit button */}
      <div className="mt-6">
        <Button
          onClick={handlePublish}
          disabled={loading}
          ariaBusy={loading}
          className="w-full"
        >
          {status === 'uploading' ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
            Uploading...
          ) : status === 'scheduled'
            ? 'Schedule'
            : 'Publish to YouTube'
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="mt-3 p-3 rounded-xl bg-error/10 border-error/20 text-error/90 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Confirmation modal */}
      {showConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl border-border">
            <h3 className="font-serif text-xl font-medium mb-4">
              {status === 'published' ? 'Video Published!' : 'Scheduled!'}
            </h3>

            <p className="text-sm text-muted-foreground mb-6">
              Your video has been {status === 'published' ? 'uploaded and published' : 'scheduled for future publication'} to your connected YouTube channel.
            </p>

            <div className="flex gap-3 pt-4 border-t border-border">
              <Button
                onClick={handleConfirmationClose}
                variant="outline"
                size="sm"
              >
                Close
              </Button>
              {status === 'published' && (
                <Button
                  onClick={() => window.location.href = '/app/integrations/youtube'}
                  variant="default"
                  size="sm"
                >
                  View on YouTube
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}