import { beforeEach, expect, test, vi } from 'vitest';
import { POST as saveParameter } from '../campaign-parameters/route';
import { DELETE, PUT } from './[campaignId]/route';
import { GET, POST } from './route';

const {
  checkAuth,
  canRead,
  canEdit,
  getWebsite,
  createLink,
  getLinks,
  updateLink,
  deleteLink,
  savePreset,
} = vi.hoisted(() => ({
  checkAuth: vi.fn(),
  canRead: vi.fn(),
  canEdit: vi.fn(),
  getWebsite: vi.fn(),
  createLink: vi.fn(),
  getLinks: vi.fn(),
  updateLink: vi.fn(),
  deleteLink: vi.fn(),
  savePreset: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ checkAuth }));
vi.mock('@/lib/load', () => ({ fetchAccount: vi.fn(), fetchWebsite: vi.fn() }));
vi.mock('@/queries/prisma', () => ({ getWebsiteSegment: vi.fn() }));
vi.mock('@/queries/prisma/website', () => ({ getWebsite }));
vi.mock('@/permissions', () => ({
  canViewAuthenticatedWebsite: canRead,
  canUpdateWebsite: canEdit,
}));
vi.mock('@/queries/prisma/campaigns', () => ({
  getCampaignLinks: getLinks,
  createCampaignLink: createLink,
  updateCampaignLink: updateLink,
  deleteCampaignLink: deleteLink,
  saveCampaignParameter: savePreset,
  getCampaignParameters: vi.fn(),
  CampaignLimitError: class extends Error {},
  CampaignDuplicateError: class extends Error {},
  CampaignWebsiteMissingError: class extends Error {},
}));

const websiteId = '11111111-1111-4111-8111-111111111111';
const campaignId = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ websiteId, campaignId }) };
const input = {
  name: 'Newsletter',
  destinationUrl: 'https://example.com/?products/',
  utmSource: 'newsletter',
};
const request = (method: string, body?: unknown) =>
  new Request('http://localhost/api/campaigns', {
    method,
    ...(body
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });

beforeEach(() => {
  vi.clearAllMocks();
  checkAuth.mockResolvedValue({ user: { id: 'owner', role: 'user', isAdmin: false } });
  canRead.mockResolvedValue(true);
  canEdit.mockResolvedValue(true);
  getWebsite.mockResolvedValue({ id: websiteId });
  getLinks.mockResolvedValue([]);
  createLink.mockResolvedValue({ id: campaignId });
  updateLink.mockResolvedValue(null);
  deleteLink.mockResolvedValue({ count: 0 });
  savePreset.mockResolvedValue({ id: 'existing-preset' });
});

test('requires account authentication and does not accept a public share context', async () => {
  checkAuth.mockResolvedValue(null);
  expect((await GET(request('GET'), context)).status).toBe(401);
  checkAuth.mockResolvedValue({ shareToken: { websiteId } });
  expect((await POST(request('POST', input), context)).status).toBe(401);
  expect(createLink).not.toHaveBeenCalled();
});

test('readers may list but cannot mutate, including view-only owners', async () => {
  checkAuth.mockResolvedValue({ user: { id: 'owner', role: 'view-only', isAdmin: false } });
  expect(await (await GET(request('GET'), context)).json()).toMatchObject({
    data: [],
    canEdit: false,
  });
  expect((await POST(request('POST', input), context)).status).toBe(403);
  expect((await DELETE(request('DELETE'), context)).status).toBe(403);
  expect(createLink).not.toHaveBeenCalled();
  expect(deleteLink).not.toHaveBeenCalled();
});

test('validates URLs and parameters and passes only the route website to persistence', async () => {
  expect(
    (await POST(request('POST', { ...input, destinationUrl: 'javascript:alert(1)' }), context))
      .status,
  ).toBe(400);
  expect(
    (await POST(request('POST', { ...input, utmSource: 'a'.repeat(201) }), context)).status,
  ).toBe(400);
  expect((await POST(request('POST', { ...input, websiteId: campaignId }), context)).status).toBe(
    400,
  );
  expect((await POST(request('POST', input), context)).status).toBe(200);
  expect(createLink).toHaveBeenCalledOnce();
  expect(createLink).toHaveBeenCalledWith(
    websiteId,
    expect.objectContaining({ ...input, utmMedium: '' }),
  );
});

test('edit and delete use website plus record identity and return not found on a mismatch', async () => {
  expect((await PUT(request('PUT', { name: 'Renamed' }), context)).status).toBe(404);
  expect(updateLink).toHaveBeenCalledWith(websiteId, campaignId, { name: 'Renamed' });
  expect((await DELETE(request('DELETE'), context)).status).toBe(404);
  expect(deleteLink).toHaveBeenCalledWith(websiteId, campaignId);
});

test('parameter reuse validates the field and retains absence of an optional label', async () => {
  expect(
    (await saveParameter(request('POST', { field: 'secret', value: 'x' }), context)).status,
  ).toBe(400);
  const response = await saveParameter(
    request('POST', { field: 'utmSource', value: 'newsletter' }),
    context,
  );
  expect(await response.json()).toEqual({ id: 'existing-preset' });
  expect(savePreset).toHaveBeenCalledWith(websiteId, { field: 'utmSource', value: 'newsletter' });
});
