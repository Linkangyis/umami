import { expect, test, vi } from 'vitest';
import { render, screen, within } from '@/test/render';
import type { EngagementResult } from '@/types/engagement';
import { EngagementReport } from './EngagementPage';

vi.mock('./Engagement.module.css', () => ({ default: {} }));

vi.mock('@/app/(main)/websites/[websiteId]/WebsiteControls', () => ({
  WebsiteControls: () => null,
}));

const metric = {
  visitors: 2,
  visits: 4,
  pageviews: 8,
  bounces: 1,
  totaltime: 120,
  bounceRate: 0.25,
  pagesPerVisit: 2,
  avgDuration: 30,
  visitorRatio: 1,
};
const bucket = {
  id: '1',
  min: 1,
  max: 1,
  visitors: 2,
  visits: 2,
  pageviews: 2,
  visitorRatio: 1,
  visitRatio: 0.5,
  pageviewRatio: 0.25,
};
const data: EngagementResult = {
  summary: { all: metric, new: metric, returning: { ...metric, visitors: 0, visitorRatio: 0 } },
  distributions: {
    duration: [{ ...bucket, id: '0-10', min: 0, max: 10 }],
    depth: [bucket],
    frequency: [{ ...bucket, id: '2', min: 2, max: 2 }],
  },
  metadata: {
    identity: 'session',
    saltRotation: 'month',
    newVisitorDefinition: 'first-seen-in-period',
    durationBasis: 'first-to-last-pageview',
    filterScope: 'matching-visits',
  },
};

test('switches distribution views and uses visit and pageview share independently', async () => {
  const { user } = render(<EngagementReport data={data} locale="en-US" filename="engagement" />);
  expect(screen.getByRole('table', { name: 'New & returning visitors' })).toBeInTheDocument();
  const duration = screen.getByRole('table', { name: 'Visit duration' });
  expect(within(duration).getByText('50%')).toBeInTheDocument();
  expect(within(duration).getByText('25%')).toBeInTheDocument();

  await user.click(screen.getByRole('tab', { name: 'Page depth' }));
  expect(screen.getByRole('table', { name: 'Page depth' })).toHaveTextContent('1 pages');
  expect(screen.queryByRole('table', { name: 'Visit duration' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('tab', { name: 'Visit frequency' }));
  expect(screen.getByRole('table', { name: 'Visit frequency' })).toHaveTextContent('Visitor share');
  expect(screen.getByRole('tab', { name: 'Visit frequency' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('renders Chinese labels and explains identity and duration limitations', () => {
  render(<EngagementReport data={data} locale="zh-CN" filename="engagement" />);
  expect(screen.getByRole('table', { name: '新老访客' })).toBeInTheDocument();
  expect(screen.getByText(/默认按月轮换身份/)).toBeInTheDocument();
  expect(screen.getByText(/无法据此得知访客在最后一个页面的实际停留时间/)).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: '下载 CSV' })).toHaveLength(2);
});

test('offers an explicit empty state while preserving metric and bucket context', () => {
  render(
    <EngagementReport
      data={{ ...data, summary: { ...data.summary, all: { ...metric, visits: 0 } } }}
      locale="en-US"
      filename="engagement"
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('No visits in this date range');
  expect(screen.getByRole('table', { name: 'Visit duration' })).toBeInTheDocument();
});
