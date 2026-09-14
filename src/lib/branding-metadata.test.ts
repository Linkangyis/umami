import { expect, test, vi } from 'vitest';
import { getBrandMetadata } from './branding-metadata';

vi.mock('@/queries/prisma/branding', () => ({
  getPublicAppBranding: async () => ({ appName: '星图统计', logoUrl: '' }),
}));

test('preserves the page and section while replacing the application name in titles', async () => {
  expect(await getBrandMetadata('管理')).toEqual({
    title: { template: '%s | 管理 | 星图统计', default: '管理 | 星图统计' },
  });
  expect(await getBrandMetadata(undefined, '网站')).toEqual({
    title: { template: '%s | 星图统计', default: '网站 | 星图统计' },
  });
});
