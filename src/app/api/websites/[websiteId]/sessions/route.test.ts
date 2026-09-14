import { beforeEach, expect, test, vi } from 'vitest';
import { GET } from './route';

const {
  parseRequest,
  getQueryFilters,
  canViewWebsiteSection,
  getWebsiteSessions,
  getWebsiteSessionIps,
} = vi.hoisted(() => ({
  parseRequest: vi.fn(),
  getQueryFilters: vi.fn(),
  canViewWebsiteSection: vi.fn(),
  getWebsiteSessions: vi.fn(),
  getWebsiteSessionIps: vi.fn(),
}));
vi.mock('@/lib/request', () => ({ parseRequest, getQueryFilters }));
vi.mock('@/permissions', () => ({ canViewWebsiteSection }));
vi.mock('@/queries/sql', () => ({ getWebsiteSessions }));
vi.mock('@/queries/sql/sessions/getWebsiteSessionIps', () => ({ getWebsiteSessionIps }));
const request = new Request('http://localhost/api/websites/website-1/sessions');
const params = { params: Promise.resolve({ websiteId: 'website-1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  parseRequest.mockResolvedValue({ auth: { user: { id: 'user-1' } }, query: {} });
  getQueryFilters.mockResolvedValue({ search: '203.0.113' });
  canViewWebsiteSection.mockResolvedValue(true);
  getWebsiteSessions.mockResolvedValue({ data: [{ id: 'session-1', views: 3 }], count: 1 });
  getWebsiteSessionIps.mockResolvedValue({ 'session-1': '203.0.113.8' });
});

test('enriches authenticated results in one scoped lookup and enables IP search', async () => {
  const response = await GET(request, params);
  expect(await response.json()).toMatchObject({ data: [{ id: 'session-1', ip: '203.0.113.8' }] });
  expect(getWebsiteSessionIps).toHaveBeenCalledWith('website-1', ['session-1']);
  expect(getWebsiteSessions).toHaveBeenCalledWith(
    'website-1',
    { search: '203.0.113' },
    { includeIpSearch: true },
  );
});

test('public shares cannot fetch, search or receive IP addresses', async () => {
  parseRequest.mockResolvedValue({ auth: { shareToken: { websiteId: 'website-1' } }, query: {} });
  getWebsiteSessions.mockResolvedValue({
    data: [{ id: 'session-1', views: 3, ip: '203.0.113.8' }],
    count: 1,
  });
  const response = await GET(request, params);
  expect(await response.json()).toEqual({ data: [{ id: 'session-1', views: 3 }], count: 1 });
  expect(getWebsiteSessionIps).not.toHaveBeenCalled();
  expect(getWebsiteSessions).toHaveBeenCalledWith(
    'website-1',
    { search: '203.0.113' },
    { includeIpSearch: false },
  );
});

test('rejects another website before any session or IP lookup', async () => {
  canViewWebsiteSection.mockResolvedValue(false);
  expect((await GET(request, params)).status).toBe(401);
  expect(getWebsiteSessions).not.toHaveBeenCalled();
  expect(getWebsiteSessionIps).not.toHaveBeenCalled();
});
