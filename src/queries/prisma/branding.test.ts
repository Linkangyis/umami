import { beforeEach, expect, test, vi } from 'vitest';
import {
  BRANDING_SETTING_KEY,
  getAppBranding,
  resetAppBranding,
  saveAppBranding,
} from './branding';

const { findUnique, upsert, deleteMany } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({
  default: { client: { appSetting: { findUnique, upsert, deleteMany } } },
}));

beforeEach(() => vi.clearAllMocks());

test('reads only the branding key and returns defaults for malformed stored data', async () => {
  findUnique.mockResolvedValue({ value: '{bad-json' });
  expect(await getAppBranding()).toEqual({ appName: 'umami', logoUrl: '' });
  expect(findUnique).toHaveBeenCalledWith({
    where: { key: BRANDING_SETTING_KEY },
    select: { value: true },
  });
});

test('persists validated branding and resets only its own setting', async () => {
  const value = { appName: 'My Analytics', logoUrl: '/logo.png' };
  expect(await saveAppBranding(value)).toEqual(value);
  expect(upsert).toHaveBeenCalledWith({
    where: { key: BRANDING_SETTING_KEY },
    update: { value: JSON.stringify(value) },
    create: { key: BRANDING_SETTING_KEY, value: JSON.stringify(value) },
  });
  await resetAppBranding();
  expect(deleteMany).toHaveBeenCalledWith({ where: { key: BRANDING_SETTING_KEY } });
});
