import { expect, test, vi } from 'vitest';
import { GET } from './route';

vi.mock('@/lib/db', () => ({ isRelationalOnly: () => true }));
vi.mock('@/lib/request', () => ({ parseRequest: async () => ({}) }));
vi.mock('@/queries/prisma/branding', () => ({
  getPublicAppBranding: async () => ({ appName: 'Analytics' }),
}));
vi.mock('@/lib/script-versions', () => ({
  getScriptVersions: async () => ({ tracker: '3.3.1-trackerhash', recorder: '3.3.1-recorderhash' }),
}));

test('public configuration exposes deterministic script versions alongside existing configuration', async () => {
  const response = await GET(new Request('http://localhost/api/config'));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    branding: { appName: 'Analytics' },
    sessionDeletionEnabled: true,
    scriptVersions: { tracker: '3.3.1-trackerhash', recorder: '3.3.1-recorderhash' },
  });
});
