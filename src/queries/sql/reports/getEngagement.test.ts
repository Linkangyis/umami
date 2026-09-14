import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getEngagement } from './getEngagement';

const { state, prismaQuery, prismaFilters, clickhouseQuery, clickhouseFilters } = vi.hoisted(
  () => ({
    state: { mode: 'prisma' },
    prismaQuery: vi.fn(),
    prismaFilters: vi.fn(),
    clickhouseQuery: vi.fn(),
    clickhouseFilters: vi.fn(),
  }),
);

vi.mock('@/lib/db', () => ({
  PRISMA: 'prisma',
  CLICKHOUSE: 'clickhouse',
  runQuery: (queries: Record<string, () => unknown>) => queries[state.mode](),
}));
vi.mock('@/lib/prisma', () => ({
  default: { rawQuery: prismaQuery, parseFilters: prismaFilters },
}));
vi.mock('@/lib/clickhouse', () => ({
  default: { rawQuery: clickhouseQuery, parseFilters: clickhouseFilters },
}));

const websiteId = '11111111-1111-4111-8111-111111111111';
const filters = {
  startDate: new Date('2026-09-01T00:00:00Z'),
  endDate: new Date('2026-09-14T23:59:59Z'),
  timezone: 'Asia/Hong_Kong',
  path: 'eq./checkout',
  browser: 'eq.chrome',
};

beforeEach(() => {
  vi.clearAllMocks();
  state.mode = 'prisma';
  prismaFilters.mockReturnValue({
    queryParams: { websiteId, ...filters, path: ['/checkout'] },
    joinSessionQuery: 'join session on session.session_id = website_event.session_id',
    cohortQuery: 'join cohort on cohort.session_id = website_event.session_id',
    filterQuery: 'and website_event.url_path = {{path}}',
  });
  clickhouseFilters.mockReturnValue({
    queryParams: { websiteId, ...filters, path: ['/checkout'] },
    cohortQuery: 'join cohort on cohort.session_id = website_event.session_id',
    filterQuery: 'and website_event.url_path = {path:Array(String)}',
  });
  prismaQuery.mockResolvedValue([]);
  clickhouseQuery.mockResolvedValue([]);
});

describe.each(['prisma', 'clickhouse'])('%s engagement query', mode => {
  test('uses both session and visit identity; filters choose complete visits', async () => {
    state.mode = mode;
    await getEngagement(websiteId, filters);
    const query = mode === 'prisma' ? prismaQuery : clickhouseQuery;
    const [sql, params] = query.mock.calls[0];

    expect(query).toHaveBeenCalledTimes(1);
    expect(sql).toContain('matched.session_id = website_event.session_id');
    expect(sql).toContain('matched.visit_id = website_event.visit_id');
    expect(sql).toContain('group by website_event.session_id, website_event.visit_id');
    expect(sql.split('visit_totals as (')[1]).not.toContain('url_path =');
    expect(sql).toContain('join cohort');
    expect(sql).not.toContain('/checkout');
    expect(params).toMatchObject({ websiteId, timezone: 'Asia/Hong_Kong', path: ['/checkout'] });
    expect(sql).toContain('website_event.event_type in (1, 2)');
    expect(sql).toContain('totals.pageviews = 1 and totals.has_event = 0');
  });

  test('does not classify returning visitors from the first filtered event', async () => {
    state.mode = mode;
    await getEngagement(websiteId, filters);
    const [sql] = (mode === 'prisma' ? prismaQuery : clickhouseQuery).mock.calls[0];
    const firstSeen = sql.split('first_seen as (')[1].split('visit_totals as (')[0];

    expect(firstSeen).not.toContain('url_path =');
    expect(firstSeen).not.toContain('created_at between');
    expect(sql).toContain('first_seen.first_at >=');
    expect(firstSeen).toContain('min(history.created_at)');
    expect(firstSeen).toContain('history.event_type = 1');
    expect(firstSeen).not.toContain('session.created_at');
    if (mode === 'clickhouse') {
      expect(sql).toContain('uniqExact(visits.session_id)');
    }
  });

  test('excludes bounces after complete visit aggregation', async () => {
    state.mode = mode;
    await getEngagement(websiteId, { ...filters, excludeBounce: true });
    const [sql] = (mode === 'prisma' ? prismaQuery : clickhouseQuery).mock.calls[0];
    expect(sql).toContain('where not (totals.pageviews = 1 and totals.has_event = 0)');
  });

  test('returns complete zero-filled distributions without NaN for an empty site', async () => {
    state.mode = mode;
    const result = await getEngagement(websiteId, filters);

    expect(result.summary.all).toEqual({
      visitors: 0,
      pageviews: 0,
      visits: 0,
      bounces: 0,
      totaltime: 0,
      bounceRate: 0,
      pagesPerVisit: 0,
      avgDuration: 0,
      visitorRatio: 0,
    });
    expect(result.summary.new).toEqual(result.summary.all);
    expect(result.summary.returning).toEqual(result.summary.all);
    expect(result.distributions.duration).toHaveLength(7);
    expect(result.distributions.depth).toHaveLength(8);
    expect(result.distributions.frequency).toHaveLength(8);
    for (const buckets of Object.values(result.distributions)) {
      expect(buckets.every(bucket => bucket.visits === 0 && bucket.visitRatio === 0)).toBe(true);
    }
  });
});

test('normalizes database numeric types and calculates ratios with the correct denominators', async () => {
  prismaQuery.mockResolvedValue([
    {
      section: 'summary',
      bucket: 'all',
      visitors: '3',
      visits: 4n,
      pageviews: '8',
      bounces: 1n,
      totaltime: '120',
    },
    {
      section: 'summary',
      bucket: 'new',
      visitors: '2',
      visits: '2',
      pageviews: '3',
      bounces: '1',
      totaltime: '30',
    },
    {
      section: 'summary',
      bucket: 'returning',
      visitors: '1',
      visits: '2',
      pageviews: '5',
      bounces: '0',
      totaltime: '90',
    },
    { section: 'depth', bucket: '1', visitors: '2', visits: '2', pageviews: '2' },
    { section: 'frequency', bucket: '2', visitors: '1', visits: '2', pageviews: '5' },
  ]);

  const result = await getEngagement(websiteId, filters);

  expect(result.summary.all).toMatchObject({
    visitors: 3,
    visits: 4,
    pageviews: 8,
    bounceRate: 0.25,
    pagesPerVisit: 2,
    avgDuration: 30,
  });
  expect(result.summary.new.visitorRatio).toBeCloseTo(2 / 3);
  expect(result.summary.returning.visitorRatio).toBeCloseTo(1 / 3);
  expect(result.distributions.depth[0]).toMatchObject({ visitRatio: 0.5, pageviewRatio: 0.25 });
  expect(result.distributions.frequency[1]).toMatchObject({
    visitors: 1,
    visits: 2,
    pageviewRatio: 0.625,
  });
  expect(result.metadata).toMatchObject({ identity: 'session', filterScope: 'matching-visits' });
});
