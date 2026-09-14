import { beforeEach, expect, test, vi } from 'vitest';
import { contentMetrics } from '@/lib/content-report';
import { contentReportSchema, GET } from './route';

const mocks = vi.hoisted(() => ({
  parseRequest: vi.fn(),
  getQueryFilters: vi.fn(),
  canViewWebsiteSection: vi.fn(),
  canUpdateWebsite: vi.fn(),
  getContentReport: vi.fn(),
  getContentGroups: vi.fn(),
}));
vi.mock('@/lib/request', () => ({
  parseRequest: mocks.parseRequest,
  getQueryFilters: mocks.getQueryFilters,
}));
vi.mock('@/permissions', () => ({
  canViewWebsiteSection: mocks.canViewWebsiteSection,
  canUpdateWebsite: mocks.canUpdateWebsite,
}));
vi.mock('@/queries/sql/reports/getContentReport', () => ({
  getContentReport: mocks.getContentReport,
}));
vi.mock('@/queries/prisma/content-group', () => ({ getContentGroups: mocks.getContentGroups }));
const context = { params: Promise.resolve({ websiteId: 'site-1' }) };
const request = new Request('http://localhost/api/websites/site-1/content');
beforeEach(() => {
  vi.clearAllMocks();
  mocks.parseRequest.mockResolvedValue({
    auth: { user: { id: 'user-1' } },
    query: { mode: 'fullUrl', sortDescending: 'true' },
  });
  mocks.getQueryFilters.mockResolvedValue({ path: 'eq./', country: 'eq.US' });
  mocks.canViewWebsiteSection.mockResolvedValue(true);
  mocks.canUpdateWebsite.mockResolvedValue(true);
  mocks.getContentGroups.mockResolvedValue([]);
  mocks.getContentReport.mockResolvedValue({
    summary: contentMetrics(),
    rows: [],
    sources: [],
    count: 0,
  });
});

test('content access is checked before private analytics or group lookup', async () => {
  mocks.canViewWebsiteSection.mockResolvedValue(false);
  expect((await GET(request, context)).status).toBe(401);
  expect(mocks.getQueryFilters).not.toHaveBeenCalled();
  expect(mocks.getContentReport).not.toHaveBeenCalled();
  expect(mocks.getContentGroups).not.toHaveBeenCalled();
});
test('preserves filters and excludes group-management rights from public shares', async () => {
  mocks.parseRequest.mockResolvedValue({
    auth: { shareToken: { websiteId: 'site-1' } },
    query: { mode: 'group', sortDescending: 'false' },
  });
  const response = await GET(request, context);
  expect((await response.json()).canManageGroups).toBe(false);
  expect(mocks.getContentReport).toHaveBeenCalledWith(
    'site-1',
    { path: 'eq./', country: 'eq.US' },
    expect.objectContaining({ mode: 'group', sortDescending: false, groups: [] }),
  );
});
test('request schema bounds pagination and rejects unsafe sort values or invalid dates', () => {
  const base = { startAt: 1, endAt: 2 };
  expect(contentReportSchema.parse(base).mode).toBe('fullUrl');
  for (const values of [
    { pageSize: 101 },
    { page: 0 },
    { orderBy: 'name; drop table session' },
    { mode: 'sql' },
    { endAt: 0 },
    { startAt: 'invalid' },
  ])
    expect(contentReportSchema.safeParse({ ...base, ...values }).success).toBe(false);
});
