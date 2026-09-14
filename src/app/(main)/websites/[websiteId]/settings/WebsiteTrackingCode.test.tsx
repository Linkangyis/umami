import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@/test/render';
import { WebsiteTrackingCode } from './WebsiteTrackingCode';

const { config } = vi.hoisted(() => ({ config: vi.fn() }));
vi.mock('@/components/hooks', () => ({
  useConfig: config,
  useLocale: () => ({ locale: 'en-US' }),
  useMessages: () => ({
    t: (value: string) => value,
    labels: { trackingCode: 'Tracking code' },
    messages: { trackingCode: 'Install this code.' },
  }),
}));

beforeEach(() =>
  config.mockReturnValue({
    cloudMode: false,
    trackerScriptName: 'custom.js',
    scriptVersions: { tracker: '3.3.1-abcdef' },
  }),
);

test('generated code uses the content version on a custom local tracker alias', () => {
  render(<WebsiteTrackingCode websiteId="test-site" hostUrl="https://stats.example" />);
  expect(screen.getByRole('textbox')).toHaveValue(
    '<script defer src="https://stats.example/custom.js?v=3.3.1-abcdef" data-website-id="test-site" data-auto-events="true"></script>',
  );
});

test('does not alter external signed script URLs', () => {
  config.mockReturnValue({
    trackerScriptName: 'https://cdn.example/script.js?signature=abc',
    scriptVersions: { tracker: 'local-hash' },
  });
  render(<WebsiteTrackingCode websiteId="test-site" />);
  expect(screen.getByRole('textbox')).toHaveValue(
    '<script defer src="https://cdn.example/script.js?signature=abc" data-website-id="test-site" data-auto-events="true"></script>',
  );
});
