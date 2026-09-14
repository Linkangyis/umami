import { expect, test, vi } from 'vitest';
import { render, screen } from '@/test/render';
import { WebsiteReplaySettings } from './WebsiteReplaySettings';

vi.mock('@/components/hooks', () => ({
  useConfig: () => ({ scriptVersions: { recorder: '3.3.1-recorderhash' } }),
  useWebsite: () => ({ replayConfig: { replayEnabled: true, heatmapEnabled: true } }),
  useSubscription: () => ({ hasFeature: () => true, cloudMode: false, isLoading: false }),
  useUpdateQuery: () => ({ mutateAsync: vi.fn(), touch: vi.fn(), toast: vi.fn() }),
  useMessages: () => ({
    t: (value: string) => value,
    labels: new Proxy({}, { get: (_target, key) => String(key) }),
    messages: new Proxy({}, { get: (_target, key) => String(key) }),
  }),
}));

test('generated recorder code uses its own content version and retains website identity', () => {
  render(<WebsiteReplaySettings websiteId="test-site" />);
  expect(screen.getByDisplayValue(/<script defer/)).toHaveValue(
    `<script defer src="${window.location.origin}/recorder.js?v=3.3.1-recorderhash" data-website-id="test-site"></script>`,
  );
});
