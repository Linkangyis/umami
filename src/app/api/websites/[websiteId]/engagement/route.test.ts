import { beforeEach, expect, test, vi } from 'vitest';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { canViewWebsiteSection } from '@/permissions';
import { getEngagement } from '@/queries/sql/reports/getEngagement';
import { GET } from './route';

vi.mock('@/lib/request', () => ({ parseRequest: vi.fn(), getQueryFilters: vi.fn() }));
vi.mock('@/permissions', () => ({ canViewWebsiteSection: vi.fn() }));
vi.mock('@/queries/sql/reports/getEngagement', () => ({ getEngagement: vi.fn() }));

const websiteId = '11111111-1111-4111-8111-111111111111';
const context = { params: Promise.resolve({ websiteId }) };
const request = new Request(`http://localhost/api/websites/${websiteId}/engagement`);
const auth = { user: { id: 'user-1' } };
const query = { startAt: 1000, endAt: 2000, timezone: 'Asia/Hong_Kong', path: 'eq./pricing' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(parseRequest).mockResolvedValue({ auth, query });
  vi.mocked(canViewWebsiteSection).mockResolvedValue(true);
  vi.mocked(getQueryFilters).mockResolvedValue({
    startDate: new Date(1000),
    endDate: new Date(2000),
  });
  vi.mocked(getEngagement).mockResolvedValue({ summary: {} } as any);
});

test('returns parse/authentication failures without querying analytics', async () => {
  vi.mocked(parseRequest).mockResolvedValue({ error: () => new Response(null, { status: 400 }) });
  expect((await GET(request, context)).status).toBe(400);
  expect(canViewWebsiteSection).not.toHaveBeenCalled();
  expect(getEngagement).not.toHaveBeenCalled();
});

test('enforces the existing sessions share permission before accessing site data', async () => {
  vi.mocked(canViewWebsiteSection).mockResolvedValue(false);
  expect((await GET(request, context)).status).toBe(401);
  expect(canViewWebsiteSection).toHaveBeenCalledWith(auth, websiteId, 'sessions');
  expect(getQueryFilters).not.toHaveBeenCalled();
  expect(getEngagement).not.toHaveBeenCalled();
});

test('passes date, timezone and filters through website-scoped filter resolution', async () => {
  const response = await GET(request, context);
  expect(response.status).toBe(200);
  expect(getQueryFilters).toHaveBeenCalledWith(query, websiteId);
  expect(getEngagement).toHaveBeenCalledWith(websiteId, {
    startDate: new Date(1000),
    endDate: new Date(2000),
  });
  expect(await response.json()).toEqual({ summary: {} });
});

test('normalizes ISO date inputs to timestamps for the shared filter resolver', async () => {
  vi.mocked(parseRequest).mockResolvedValue({
    auth,
    query: { startDate: new Date(1000), endDate: new Date(2000), timezone: 'UTC' },
  });
  await GET(request, context);
  expect(getQueryFilters).toHaveBeenCalledWith(
    expect.objectContaining({ startAt: 1000, endAt: 2000 }),
    websiteId,
  );
});

test('validates missing, reversed, out-of-range dates and invalid timezones', async () => {
  await GET(request, context);
  const schema = vi.mocked(parseRequest).mock.calls[0][1];
  expect(schema.safeParse({}).success).toBe(false);
  expect(schema.safeParse({ startAt: 2, endAt: 1 }).success).toBe(false);
  expect(schema.safeParse({ startAt: 0, endAt: 1e20 }).success).toBe(false);
  expect(schema.safeParse({ startAt: 1, endAt: 2, timezone: 'not/a/timezone' }).success).toBe(
    false,
  );
  expect(schema.safeParse({ startAt: 1, endAt: 2, timezone: 'Asia/Hong_Kong' }).success).toBe(true);
  expect(schema.safeParse({ startDate: '2026-09-01', endDate: '2026-09-14' }).success).toBe(true);
});
