import { beforeEach, expect, test, vi } from 'vitest';
import { OPTIONS, GET as publicGet } from '@/app/api/event-rules/route';
import { parseRequest } from '@/lib/request';
import { canUpdateWebsite, canViewAuthenticatedWebsite } from '@/permissions';
import {
  createEventRule,
  deleteEventRule,
  EventRuleLimitError,
  getPublicEventRules,
  getWebsiteEventRules,
  updateEventRule,
} from '@/queries/prisma/eventRule';
import { DELETE, PUT } from './[ruleId]/route';
import { GET, POST } from './route';

vi.mock('@/lib/request', () => ({ parseRequest: vi.fn() }));
vi.mock('@/permissions', () => ({
  canUpdateWebsite: vi.fn(),
  canViewAuthenticatedWebsite: vi.fn(),
}));
vi.mock('@/queries/prisma/eventRule', () => ({
  createEventRule: vi.fn(),
  deleteEventRule: vi.fn(),
  getPublicEventRules: vi.fn(),
  getWebsiteEventRules: vi.fn(),
  updateEventRule: vi.fn(),
  EventRuleLimitError: class extends Error {},
  EventRuleWebsiteNotFoundError: class extends Error {},
}));

const websiteId = '11111111-1111-4111-8111-111111111111';
const ruleId = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ websiteId, ruleId }) };
const request = new Request('http://localhost/api/event-rules');
const auth = { user: { id: 'owner' } };
const body = {
  name: 'Buy',
  selector: '#buy',
  urlPath: '/?products/',
  matchType: 'exact',
  eventType: 'click',
  isEnabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(parseRequest).mockResolvedValue({ auth, body, query: { websiteId } });
  vi.mocked(canUpdateWebsite).mockResolvedValue(true);
  vi.mocked(canViewAuthenticatedWebsite).mockResolvedValue(true);
  vi.mocked(getWebsiteEventRules).mockResolvedValue([]);
  vi.mocked(getPublicEventRules).mockResolvedValue([]);
  vi.mocked(createEventRule).mockResolvedValue({ ...body, id: ruleId, websiteId } as any);
  vi.mocked(updateEventRule).mockResolvedValue(null);
  vi.mocked(deleteEventRule).mockResolvedValue({ count: 0 });
});

test('authenticated listing excludes share-only access', async () => {
  vi.mocked(canViewAuthenticatedWebsite).mockResolvedValue(false);
  expect((await GET(request, context)).status).toBe(401);
  expect(canViewAuthenticatedWebsite).toHaveBeenCalledWith(auth, websiteId);
  expect(getWebsiteEventRules).not.toHaveBeenCalled();
});

test('all mutations require website edit permission', async () => {
  vi.mocked(canUpdateWebsite).mockResolvedValue(false);
  for (const handler of [POST, PUT, DELETE])
    expect((await handler(request, context)).status).toBe(401);
  expect(createEventRule).not.toHaveBeenCalled();
  expect(updateEventRule).not.toHaveBeenCalled();
  expect(deleteEventRule).not.toHaveBeenCalled();
});

test('returns a bounded list and creates website-scoped rules', async () => {
  expect(await (await GET(request, context)).json()).toEqual({ data: [], count: 0, limit: 100 });
  expect((await POST(request, context)).status).toBe(200);
  expect(createEventRule).toHaveBeenCalledWith(websiteId, body);
});

test('reports missing/cross-site rules and cap errors', async () => {
  expect((await PUT(request, context)).status).toBe(404);
  expect(updateEventRule).toHaveBeenCalledWith(websiteId, ruleId, body);
  expect((await DELETE(request, context)).status).toBe(404);
  vi.mocked(createEventRule).mockRejectedValue(new EventRuleLimitError());
  const response = await POST(request, context);
  expect(response.status).toBe(400);
  expect((await response.json()).error.code).toBe('event-rule-limit');
});

test('short-circuits invalid inputs before checking permission or querying', async () => {
  vi.mocked(parseRequest).mockResolvedValue({ error: () => new Response(null, { status: 400 }) });
  for (const handler of [GET, POST, PUT, DELETE])
    expect((await handler(request, context)).status).toBe(400);
  expect(canUpdateWebsite).not.toHaveBeenCalled();
  expect(createEventRule).not.toHaveBeenCalled();
});

test('public configuration skips authentication and includes CORS on success, errors and preflight', async () => {
  const response = await publicGet(request);
  expect(await response.json()).toEqual({ rules: [] });
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  expect(parseRequest).toHaveBeenCalledWith(request, expect.anything(), { skipAuth: true });
  expect(OPTIONS().status).toBe(204);
  vi.mocked(parseRequest).mockResolvedValue({ error: () => new Response(null, { status: 400 }) });
  expect((await publicGet(request)).headers.get('Access-Control-Allow-Origin')).toBe('*');
});
