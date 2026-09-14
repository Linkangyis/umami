import { beforeEach, expect, test, vi } from 'vitest';
import { getContentReport } from './getContentReport';

const mocks = vi.hoisted(() => ({ rawQuery: vi.fn(), parseFilters: vi.fn() }));
vi.mock('@/lib/db', () => ({
  PRISMA: 'prisma',
  CLICKHOUSE: 'clickhouse',
  runQuery: handlers => handlers.clickhouse(),
}));
vi.mock('@/lib/clickhouse', () => ({
  default: { rawQuery: mocks.rawQuery, parseFilters: mocks.parseFilters },
}));
vi.mock('@/lib/prisma', () => ({ default: {} }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rawQuery.mockResolvedValue([]);
  mocks.parseFilters.mockReturnValue({
    queryParams: { websiteId: 'site-1' },
    filterQuery: 'and device = {device:String}',
    cohortQuery: '',
    excludeBounceQuery: '',
  });
});

test('ClickHouse keeps nullable next-page timestamps and exact composite visit identity', async () => {
  await getContentReport('site-1', {}, { mode: 'fullUrl' });
  const [query] = mocks.rawQuery.mock.calls[0];
  expect(query).toContain('leadInFrame(toNullable(created_at))');
  expect(query).toContain('partition by session_id, visit_id order by created_at, event_id');
  expect(query).toContain('uniqExact(tuple(session_id, visit_id))');
  expect(query).toContain('next_at is not null');
  expect(query).toContain('and device = {device:String}');
});
test('ClickHouse grouping binds literal match values and deduplicates overlapping summary events', async () => {
  const pattern = "products/%' OR 1=1 --";
  await getContentReport(
    'site-1',
    {},
    {
      mode: 'group',
      groups: [
        {
          id: 'group-1',
          name: 'Products',
          rules: [{ field: 'route', operator: 'contains', value: pattern }],
        },
      ],
    },
  );
  const [query, parameters] = mocks.rawQuery.mock.calls[0];
  expect(query).not.toContain(pattern);
  expect(query).toContain('position(route, {rule0_0:String}) > 0');
  expect(query).toContain('select distinct event_id, session_id, visit_id');
  expect(parameters.rule0_0).toBe(pattern);
});
