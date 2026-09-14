import { randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';

// Opt in only for a dedicated development database.
test.skipIf(process.env.WEBSITE_RESET_TEST_DATABASE !== '1')(
  'reset clears analytics while preserving event bindings and content groups; delete removes both',
  async () => {
    vi.stubEnv('CLOUD_MODE', '');
    const { default: prisma } = await import('@/lib/prisma');
    const { resetWebsite, deleteWebsite } = await import('./website');
    const { getPublicEventRules } = await import('./eventRule');
    const { client } = prisma;
    const websiteId = randomUUID();
    const sessionId = randomUUID();
    const ruleId = randomUUID();
    const groupId = randomUUID();
    try {
      await client.website.create({
        data: { id: websiteId, name: 'Reset configuration fixture', domain: 'reset-test.example' },
      });
      await client.eventRule.create({
        data: {
          id: ruleId,
          websiteId,
          name: 'checkout-click',
          selector: '#checkout',
          urlPath: '/?products/',
          matchType: 'exact',
          eventType: 'click',
        },
      });
      await client.contentGroup.create({
        data: {
          id: groupId,
          websiteId,
          name: 'Products',
          rules: [{ field: 'route', operator: 'prefix', value: '/?products/' }],
        },
      });
      await client.session.create({ data: { id: sessionId, websiteId } });
      await client.websiteEvent.create({
        data: {
          id: randomUUID(),
          websiteId,
          sessionId,
          visitId: randomUUID(),
          urlPath: '/',
          urlQuery: 'products/',
          eventType: 1,
        },
      });

      const reset = await resetWebsite(websiteId);
      expect(reset).toHaveProperty('resetAt', expect.any(Date));
      expect(await client.websiteEvent.count({ where: { websiteId } })).toBe(0);
      expect(await client.session.count({ where: { websiteId } })).toBe(0);
      expect(await client.eventRule.findUnique({ where: { id: ruleId } })).toMatchObject({
        name: 'checkout-click',
        selector: '#checkout',
        urlPath: '/?products/',
        isEnabled: true,
      });
      expect(await getPublicEventRules(websiteId, '/?products/')).toEqual([
        expect.objectContaining({ id: ruleId, name: 'checkout-click' }),
      ]);
      expect(await client.contentGroup.findUnique({ where: { id: groupId } })).toMatchObject({
        name: 'Products',
        rules: [{ field: 'route', operator: 'prefix', value: '/?products/' }],
      });

      await deleteWebsite(websiteId);
      expect(await client.eventRule.count({ where: { websiteId } })).toBe(0);
      expect(await client.contentGroup.count({ where: { websiteId } })).toBe(0);
      expect(await client.website.findUnique({ where: { id: websiteId } })).toBeNull();
    } finally {
      await client.eventRule.deleteMany({ where: { websiteId } });
      await client.contentGroup.deleteMany({ where: { websiteId } });
      await client.websiteEvent.deleteMany({ where: { websiteId } });
      await client.session.deleteMany({ where: { websiteId } });
      await client.website.deleteMany({ where: { id: websiteId } });
      await client.$disconnect();
      vi.unstubAllEnvs();
    }
  },
  30000,
);
