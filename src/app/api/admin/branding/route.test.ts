import { beforeEach, expect, test, vi } from 'vitest';
import { parseRequest } from '@/lib/request';
import { getAppBranding, resetAppBranding, saveAppBranding } from '@/queries/prisma/branding';
import { DELETE, GET, POST } from './route';

vi.mock('@/lib/request', () => ({ parseRequest: vi.fn() }));
vi.mock('@/queries/prisma/branding', () => ({
  getAppBranding: vi.fn(),
  resetAppBranding: vi.fn(),
  saveAppBranding: vi.fn(),
}));
const request = new Request('http://localhost/api/admin/branding');
const value = { appName: '星图统计', logoUrl: '/logo.png' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(parseRequest).mockResolvedValue({ auth: { user: { isAdmin: true } }, body: value });
  vi.mocked(getAppBranding).mockResolvedValue(value);
  vi.mocked(saveAppBranding).mockResolvedValue(value);
  vi.mocked(resetAppBranding).mockResolvedValue({ appName: 'umami', logoUrl: '' });
});

test.each([null, { user: { isAdmin: false } }, { shareToken: { websiteId: 'shared' } }])(
  'denies non-admin access %j',
  async auth => {
    vi.mocked(parseRequest).mockResolvedValue({ auth, body: value });
    for (const handler of [GET, POST, DELETE]) expect((await handler(request)).status).toBe(401);
    expect(getAppBranding).not.toHaveBeenCalled();
    expect(saveAppBranding).not.toHaveBeenCalled();
    expect(resetAppBranding).not.toHaveBeenCalled();
  },
);

test('allows admin save, read and reset without cloud subscriptions', async () => {
  expect(await (await POST(request)).json()).toEqual(value);
  expect(saveAppBranding).toHaveBeenCalledWith(value);
  expect(await (await GET(request)).json()).toEqual(value);
  expect(await (await DELETE(request)).json()).toEqual({ appName: 'umami', logoUrl: '' });
});

test('returns validation failures without persistence', async () => {
  vi.mocked(parseRequest).mockResolvedValue({ error: () => new Response(null, { status: 400 }) });
  expect((await POST(request)).status).toBe(400);
  expect(saveAppBranding).not.toHaveBeenCalled();
});
