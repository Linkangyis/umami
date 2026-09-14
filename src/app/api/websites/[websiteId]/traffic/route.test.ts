import { beforeEach, expect, test, vi } from 'vitest';
import { trafficMetrics } from '@/lib/traffic';
import { GET, trafficSchema } from './route';

const { parseRequest, getQueryFilters, canViewWebsiteSection, getTrafficReport } = vi.hoisted(
  () => ({
    parseRequest: vi.fn(),
    getQueryFilters: vi.fn(),
    canViewWebsiteSection: vi.fn(),
    getTrafficReport: vi.fn(),
  }),
);
vi.mock('@/lib/request', () => ({ parseRequest, getQueryFilters }));
vi.mock('@/permissions', () => ({ canViewWebsiteSection }));
vi.mock('@/queries/sql/reports/getTrafficReport', () => ({ getTrafficReport }));

const startDate = new Date('2026-01-02T00:00:00Z');
const endDate = new Date('2026-01-02T23:59:59.999Z');
const request = new Request('http://localhost/api/websites/website-1/traffic');
const params = { params: Promise.resolve({ websiteId: 'website-1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  parseRequest.mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    query: { unit: 'day', timezone: 'UTC', compare: 'prev', visitorType: 'all' },
  });
  getQueryFilters.mockResolvedValue({
    startDate,
    endDate,
    path: 'eq./pricing',
    browser: 'eq.Chrome',
  });
  canViewWebsiteSection.mockResolvedValue(true);
  getTrafficReport.mockResolvedValue({
    summary: trafficMetrics(),
    rows: [],
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });
});

test('rejects unauthorized website access before looking up filters or querying analytics', async () => {
  canViewWebsiteSection.mockResolvedValue(false);
  const result = await GET(request, params);
  expect(result.status).toBe(401);
  expect(canViewWebsiteSection).toHaveBeenCalledWith(
    { user: { id: 'user-1' } },
    'website-1',
    'overview',
  );
  expect(getQueryFilters).not.toHaveBeenCalled();
  expect(getTrafficReport).not.toHaveBeenCalled();
});

test('preserves all filters in both current and nonoverlapping comparison periods', async () => {
  expect((await GET(request, params)).status).toBe(200);
  expect(getTrafficReport).toHaveBeenNthCalledWith(
    1,
    'website-1',
    expect.objectContaining({ startDate, endDate, path: 'eq./pricing', browser: 'eq.Chrome' }),
  );
  expect(getTrafficReport).toHaveBeenNthCalledWith(
    2,
    'website-1',
    expect.objectContaining({
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2026-01-01T23:59:59.999Z'),
      path: 'eq./pricing',
      browser: 'eq.Chrome',
    }),
  );
});

test('rejects bad dates, invalid units and incomplete custom comparison at the request boundary', () => {
  for (const input of [
    { startAt: 2, endAt: 1 },
    { startAt: 'not-a-date', endAt: 1 },
    { startAt: 1, endAt: 2, unit: 'minute' },
    { startAt: 1, endAt: 2, timezone: 'Invalid/Zone' },
    { startAt: 1, endAt: 2, compare: 'custom' },
  ])
    expect(trafficSchema.safeParse(input).success).toBe(false);
  expect(trafficSchema.safeParse({ startAt: 1, endAt: 2, unit: 'week' }).success).toBe(true);
});

test('returns parser errors without querying private data', async () => {
  parseRequest.mockResolvedValue({ error: () => new Response(null, { status: 400 }) });
  expect((await GET(request, params)).status).toBe(400);
  expect(canViewWebsiteSection).not.toHaveBeenCalled();
  expect(getTrafficReport).not.toHaveBeenCalled();
});
