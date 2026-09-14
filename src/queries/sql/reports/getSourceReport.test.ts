import { beforeEach, expect, test, vi } from 'vitest';
import { getSourceReport } from './getSourceReport';

const { state, query, parseFilters } = vi.hoisted(() => ({
  state: { mode: 'prisma' },
  query: vi.fn(),
  parseFilters: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  PRISMA: 'prisma',
  CLICKHOUSE: 'clickhouse',
  runQuery: (queries: Record<string, () => unknown>) => queries[state.mode](),
}));
vi.mock('@/lib/prisma', () => ({ default: { rawQuery: query, parseFilters } }));
vi.mock('@/lib/clickhouse', () => ({ default: { rawQuery: query, parseFilters } }));

const options = {
  view: 'keywords' as const,
  page: 1,
  pageSize: 20,
  sort: 'visitors' as const,
  direction: 'desc' as const,
};
const filters = {
  startDate: new Date('2026-09-01T00:00:00Z'),
  endDate: new Date('2026-09-02T00:00:00Z'),
  timezone: 'Asia/Hong_Kong',
  path: 'eq./checkout',
};

beforeEach(() => {
  vi.clearAllMocks();
  state.mode = 'prisma';
  parseFilters.mockReturnValue({
    filterQuery: 'and website_event.url_path = {{path}}',
    cohortQuery: 'join cohort_sessions using (session_id)',
    joinSessionQuery: 'join session on session.session_id = website_event.session_id',
    queryParams: { websiteId: 'site', path: ['/checkout'], ...filters },
  });
  query.mockResolvedValue([]);
});

test.each(['prisma', 'clickhouse'])(
  '%s source query keeps full entry attribution and uses composite visit identity',
  async mode => {
    state.mode = mode;
    await getSourceReport('site', options, filters);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain(
      'm.session_id = website_event.session_id and m.visit_id = website_event.visit_id',
    );
    expect(sql).toContain(
      'partition by website_event.session_id, website_event.visit_id order by website_event.created_at, website_event.event_id',
    );
    expect(sql).toContain('a.pageviews = 1 and a.custom_events = 0');
    expect(sql).toContain('join cohort_sessions');
    const entry = sql.split('entry_ranked as (')[1].split('first_seen as (')[0];
    expect(entry).not.toContain('between');
    expect(entry).not.toContain('url_path =');
    expect(params).toMatchObject({ path: 'eq./checkout', timezone: 'Asia/Hong_Kong' });
    expect(sql).not.toContain('/checkout');
    if (mode === 'clickhouse') expect(sql).toContain('uniqExactIf(v.session_id');
  },
);

test('binds row search and noise filters instead of interpolating their content', async () => {
  const search = "%' or true --";
  await getSourceReport(
    'site',
    {
      ...options,
      search,
      excludeDomains: ['noise.example'],
      excludeKeywords: ['spam term'],
      matrix: true,
    },
    filters,
  );
  const [sql, params] = query.mock.calls[0];
  expect(sql).not.toContain(search);
  expect(sql).not.toContain('noise.example');
  expect(params).toMatchObject({
    excludeDomains: ['noise.example'],
    excludeKeywords: ['spam term'],
  });
  expect(sql).toContain('from grouped g inner join paged p');
  expect(sql).toContain('group by v.name, v.keyword_status');
  expect(sql).toContain('order by section, row_order, engine');
});

test('returns nullable IP counts, coverage and numeric metrics without exposing address values', async () => {
  query.mockResolvedValue([
    {
      section: 'summary',
      visitors: '4',
      visits: '5',
      pageviews: '10',
      newVisitors: '2',
      bounces: '1',
      totalTime: '50',
      ips: '2',
      ipVisits: '3',
    },
    {
      section: 'row',
      name: '',
      engine: 'google',
      keyword_status: 'unavailable',
      visitors: '1',
      visits: '2',
      pageviews: '2',
      ips: '0',
      ipVisits: '0',
      ip: '203.0.113.10',
    },
    { section: 'count', total_rows: '1' },
  ]);
  const result = await getSourceReport('site', options, filters);
  expect(result.summary).toMatchObject({
    visitors: 4,
    visits: 5,
    ips: 2,
    ipCoverage: 0.6,
    missingIpVisits: 2,
    bounceRate: 0.2,
    pagesPerVisit: 2,
    averageDuration: 10,
  });
  expect(result.rows[0]).toMatchObject({
    ips: null,
    ipCoverage: 0,
    missingIpVisits: 2,
    keywordStatus: 'unavailable',
  });
  expect(JSON.stringify(result)).not.toContain('203.0.113.10');
  expect(result.totalRows).toBe(1);
});
