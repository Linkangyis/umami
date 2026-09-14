import { beforeEach, expect, test, vi } from 'vitest';
import { parseRequest } from '@/lib/request';
import { canUpdateWebsite, canViewAuthenticatedWebsite } from '@/permissions';
import {
  createIpRule,
  deleteIpRule,
  getWebsiteIpRules,
  IpRuleLimitError,
  updateIpRule,
} from '@/queries/prisma/ipRule';
import { DELETE, PUT } from './[ruleId]/route';
import { GET, POST } from './route';

vi.mock('@/lib/request', () => ({ parseRequest: vi.fn() }));
vi.mock('@/permissions', () => ({
  canUpdateWebsite: vi.fn(),
  canViewAuthenticatedWebsite: vi.fn(),
}));
vi.mock('@/queries/prisma/ipRule', () => ({
  createIpRule: vi.fn(),
  deleteIpRule: vi.fn(),
  getWebsiteIpRules: vi.fn(),
  updateIpRule: vi.fn(),
  IpRuleLimitError: class extends Error {},
  IpRuleWebsiteNotFoundError: class extends Error {},
}));
const websiteId = '11111111-1111-4111-8111-111111111111';
const ruleId = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ websiteId, ruleId }) };
const request = new Request('http://localhost/api/ip-rules');
const auth = { user: { id: 'owner' } };
const body = { pattern: '192.0.2.0/24', name: 'Office', isEnabled: true };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(parseRequest).mockResolvedValue({ auth, body });
  vi.mocked(canViewAuthenticatedWebsite).mockResolvedValue(true);
  vi.mocked(canUpdateWebsite).mockResolvedValue(true);
  vi.mocked(getWebsiteIpRules).mockResolvedValue([]);
  vi.mocked(createIpRule).mockResolvedValue({ ...body, id: ruleId, websiteId } as any);
  vi.mocked(updateIpRule).mockResolvedValue(null);
  vi.mocked(deleteIpRule).mockResolvedValue({ count: 0 });
});
test('raw rule lists require authenticated site access and are not cached', async () => {
  const response = await GET(request, context);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({ data: [], canEdit: true, limit: 200 });
  vi.mocked(getWebsiteIpRules).mockClear();
  vi.mocked(canViewAuthenticatedWebsite).mockResolvedValue(false);
  expect((await GET(request, context)).status).toBe(401);
  expect(getWebsiteIpRules).not.toHaveBeenCalled();
});
test('all mutations require management permission', async () => {
  vi.mocked(canUpdateWebsite).mockResolvedValue(false);
  for (const handler of [POST, PUT, DELETE])
    expect((await handler(request, context)).status).toBe(401);
  expect(createIpRule).not.toHaveBeenCalled();
  expect(updateIpRule).not.toHaveBeenCalled();
  expect(deleteIpRule).not.toHaveBeenCalled();
});
test('CRUD scopes mutations to the website and maps missing, duplicate, and cap errors', async () => {
  expect((await POST(request, context)).status).toBe(200);
  expect(createIpRule).toHaveBeenCalledWith(websiteId, body);
  expect((await PUT(request, context)).status).toBe(404);
  expect(updateIpRule).toHaveBeenCalledWith(websiteId, ruleId, body);
  expect((await DELETE(request, context)).status).toBe(404);
  vi.mocked(createIpRule).mockRejectedValue(new IpRuleLimitError());
  expect((await (await POST(request, context)).json()).error.code).toBe('ip-rule-limit');
  vi.mocked(createIpRule).mockRejectedValue({ code: 'P2002' });
  expect((await (await POST(request, context)).json()).error.code).toBe('ip-rule-duplicate');
});
