import { expect, test } from 'vitest';

// Explicitly opt in on the local development database; restore the original global brand.
test.skipIf(process.env.BRANDING_TEST_DATABASE !== '1')(
  'brand persists in AppSetting and is readable by a fresh database client',
  async () => {
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const { PrismaClient } = await import('@/generated/prisma/client');
    const { default: prisma } = await import('@/lib/prisma');
    const { BRANDING_SETTING_KEY, saveAppBranding, getAppBranding } = await import('./branding');
    const { client } = prisma;
    const original = await client.appSetting.findUnique({ where: { key: BRANDING_SETTING_KEY } });
    const fresh = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    const value = { appName: 'Persistence verification', logoUrl: '/favicon-32x32.png' };
    try {
      await saveAppBranding(value);
      const stored = await fresh.appSetting.findUnique({ where: { key: BRANDING_SETTING_KEY } });
      expect(JSON.parse(stored.value)).toEqual(value);
      expect(await getAppBranding()).toEqual(value);
    } finally {
      if (original)
        await client.appSetting.upsert({
          where: { key: BRANDING_SETTING_KEY },
          create: original,
          update: { value: original.value },
        });
      else await client.appSetting.deleteMany({ where: { key: BRANDING_SETTING_KEY } });
      await fresh.$disconnect();
      await client.$disconnect();
    }
  },
  30000,
);
