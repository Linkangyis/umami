import { beforeEach, expect, test, vi } from 'vitest';
import { DELETE, PATCH } from './[groupId]/route';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  parseRequest: vi.fn(),
  canUpdateWebsite: vi.fn(),
  canViewWebsiteSection: vi.fn(),
  createContentGroup: vi.fn(),
  getContentGroups: vi.fn(),
  updateContentGroup: vi.fn(),
  deleteContentGroup: vi.fn(),
}));
vi.mock('@/lib/request', () => ({ parseRequest: mocks.parseRequest }));
vi.mock('@/permissions', () => ({
  canUpdateWebsite: mocks.canUpdateWebsite,
  canViewWebsiteSection: mocks.canViewWebsiteSection,
}));
vi.mock('@/queries/prisma/content-group', () => ({
  createContentGroup: mocks.createContentGroup,
  getContentGroups: mocks.getContentGroups,
  updateContentGroup: mocks.updateContentGroup,
  deleteContentGroup: mocks.deleteContentGroup,
}));
const body = {
  name: 'Products',
  rules: [{ field: 'route', operator: 'prefix', value: '/?products/' }],
};
const request = new Request('http://localhost/api/websites/site-1/content-groups', {
  method: 'POST',
});
const context = { params: Promise.resolve({ websiteId: 'site-1', groupId: 'group-1' }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.parseRequest.mockResolvedValue({ auth: { user: { id: 'owner-1' } }, body });
  mocks.canUpdateWebsite.mockResolvedValue(true);
  mocks.getContentGroups.mockResolvedValue([]);
  mocks.createContentGroup.mockResolvedValue({ id: 'group-1', ...body });
  mocks.updateContentGroup.mockResolvedValue(null);
  mocks.deleteContentGroup.mockResolvedValue({ count: 0 });
});

test('read-only users cannot create, update or delete page-group definitions', async () => {
  mocks.canUpdateWebsite.mockResolvedValue(false);
  for (const handler of [POST, PATCH, DELETE])
    expect((await handler(request, context)).status).toBe(401);
  expect(mocks.createContentGroup).not.toHaveBeenCalled();
  expect(mocks.updateContentGroup).not.toHaveBeenCalled();
  expect(mocks.deleteContentGroup).not.toHaveBeenCalled();
});
test('shares cannot mutate groups even if a user token is also present', async () => {
  mocks.parseRequest.mockResolvedValue({
    auth: { user: { id: 'owner-1' }, shareToken: { websiteId: 'site-1' } },
    body,
  });
  expect((await POST(request, context)).status).toBe(401);
  expect(mocks.createContentGroup).not.toHaveBeenCalled();
});
test('owner writes are scoped to the website and unknown or foreign group IDs return 404', async () => {
  expect((await POST(request, context)).status).toBe(200);
  expect(mocks.createContentGroup).toHaveBeenCalledWith('site-1', body);
  expect((await PATCH(request, context)).status).toBe(404);
  expect(mocks.updateContentGroup).toHaveBeenCalledWith('site-1', 'group-1', body);
  expect((await DELETE(request, context)).status).toBe(404);
  expect(mocks.deleteContentGroup).toHaveBeenCalledWith('site-1', 'group-1');
});
