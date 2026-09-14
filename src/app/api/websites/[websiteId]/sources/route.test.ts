import { beforeEach, expect, test, vi } from 'vitest';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { canViewWebsiteSection } from '@/permissions';
import { getSourceReport } from '@/queries/sql/reports/getSourceReport';
import { GET } from './route';

vi.mock('@/lib/request', () => ({ parseRequest: vi.fn(), getQueryFilters: vi.fn() }));
vi.mock('@/permissions', () => ({ canViewWebsiteSection: vi.fn() }));
vi.mock('@/queries/sql/reports/getSourceReport', () => ({ getSourceReport: vi.fn() }));
const websiteId = '11111111-1111-4111-8111-111111111111';
const context = { params: Promise.resolve({ websiteId }) };
const request = new Request('http://localhost/api/sources');
const query = {
  startAt: 1000,
  endAt: 2000,
  timezone: 'Asia/Hong_Kong',
  view: 'channels',
  page: 1,
  pageSize: 20,
  sort: 'visitors',
  direction: 'desc',
  keywordStatus: 'all',
  matrix: false,
  excludeDomains: [],
  excludeKeywords: [],
};
const auth = { user: { id: 'user-1' } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(parseRequest).mockResolvedValue({ auth, query });
  vi.mocked(canViewWebsiteSection).mockResolvedValue(true);
  vi.mocked(getQueryFilters).mockResolvedValue({
    startDate: new Date(1000),
    endDate: new Date(2000),
    timezone: query.timezone,
  });
  vi.mocked(getSourceReport).mockResolvedValue({ rows: [] } as any);
});

test('rejects unauthorized access before querying any source data', async () => {
  vi.mocked(canViewWebsiteSection).mockResolvedValue(false);
  expect((await GET(request, context)).status).toBe(401);
  expect(getSourceReport).not.toHaveBeenCalled();
});

test('supports overview-authorized shares without adding a raw-IP surface', async () => {
  const share = { shareToken: { websiteId, parameters: { overview: true } } };
  vi.mocked(parseRequest).mockResolvedValue({ auth: share, query });
  expect((await GET(request, context)).status).toBe(200);
  expect(canViewWebsiteSection).toHaveBeenCalledWith(share, websiteId, 'overview');
  expect(getQueryFilters).toHaveBeenCalledWith(
    expect.objectContaining({ startAt: 1000, endAt: 2000, timezone: query.timezone }),
    websiteId,
  );
});

test('normalizes domain exclusions and preserves matrix options and date-only inputs', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth,
    query: {
      ...query,
      startAt: undefined,
      endAt: undefined,
      startDate: new Date(1000),
      endDate: new Date(2000),
      view: 'keywords',
      matrix: true,
      excludeDomains: ['WWW.Noise.Example.'],
    },
  });
  await GET(request, context);
  expect(getSourceReport).toHaveBeenCalledWith(
    websiteId,
    expect.objectContaining({ view: 'keywords', matrix: true, excludeDomains: ['noise.example'] }),
    expect.anything(),
  );
  expect(getQueryFilters).toHaveBeenCalledWith(
    expect.objectContaining({ startAt: 1000, endAt: 2000 }),
    websiteId,
  );
});

test('validates date order, timezone, sort, page sizes, exclusions and view parameters', async () => {
  await GET(request, context);
  const schema = vi.mocked(parseRequest).mock.calls[0][1];
  for (const invalid of [
    { endAt: 0 },
    { timezone: 'Not/AZone' },
    { pageSize: 1000 },
    { sort: 'drop table' },
    { view: 'raw-ips' },
    { excludeKeywords: '[bad]' },
    { matrix: 'yes' },
  ]) {
    expect(schema.safeParse({ startAt: 1000, endAt: 2000, ...invalid }).success).toBe(false);
  }
  expect(
    schema.safeParse({ startAt: 1000, endAt: 2000, matrix: 'true', excludeKeywords: '["spam"]' })
      .data,
  ).toMatchObject({ matrix: true, excludeKeywords: ['spam'] });
});
