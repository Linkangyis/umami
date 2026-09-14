import { Column } from '@umami/react-zen';
import { Panel } from '@/components/common/Panel';
import { WebsiteData } from './WebsiteData';
import { WebsiteEditForm } from './WebsiteEditForm';
import { WebsiteEventSetup } from './WebsiteEventSetup';
import { WebsiteReplaySettings } from './WebsiteReplaySettings';
import { WebsiteShareForm } from './WebsiteShareForm';

export function WebsiteSettings({ websiteId }: { websiteId: string; openExternal?: boolean }) {
  return (
    <Column gap="6">
      <Panel>
        <WebsiteEditForm websiteId={websiteId} />
      </Panel>
      <Panel>
        <WebsiteEventSetup websiteId={websiteId} />
      </Panel>
      <Panel>
        <WebsiteReplaySettings websiteId={websiteId} />
      </Panel>
      <Panel>
        <WebsiteShareForm websiteId={websiteId} />
      </Panel>
      <Panel>
        <WebsiteData websiteId={websiteId} />
      </Panel>
    </Column>
  );
}
