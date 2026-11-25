import { Suspense } from 'react';

import IntegrationsLayout from '@/components/integrations/IntegrationsLayout';
import ConnectYouTube from '@/components/integrations/ConnectYouTube';
import ConnectedChannel from '@/components/integrations/ConnectedChannel';
import PublishShort from '@/components/integrations/PublishShort';
import PublishingDashboard from '@/components/integrations/PublishingDashboard';

export default function IntegrationsPage() {
  return (
    <IntegrationsLayout>
      <Suspense fallback={<ConnectYouTube />}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* YouTube Connection Card */}
          <ConnectYouTube />

          {/* Publish Short Card */}
          <PublishShort />

          {/* Publishing Dashboard Card */}
          <PublishingDashboard />
        </div>
      </Suspense>
    </IntegrationsLayout>
  );
}