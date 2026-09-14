import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';

// Opt in only against a dedicated development database: EVENT_RULE_TEST_DATABASE=1.
test.skipIf(process.env.EVENT_RULE_TEST_DATABASE !== '1')(
  'event rules enforce owner access, cross-site isolation, public selection and a concurrent cap',
  async () => {
    const { default: prisma } = await import('@/lib/prisma');
    const {
      createEventRule,
      deleteEventRule,
      EventRuleLimitError,
      getPublicEventRules,
      getWebsiteEventRules,
      updateEventRule,
    } = await import('./eventRule');
    const { resetWebsite, deleteWebsite } = await import('./website');
    const { canUpdateWebsite, canViewAuthenticatedWebsite } = await import('@/permissions');
    const { createEventRuleSchema } = await import('@/lib/event-rules');
    const { client } = prisma;
    const [websiteId, otherWebsiteId, ownerId, otherUserId] = Array.from({ length: 4 }, () =>
      randomUUID(),
    );
    const data = createEventRuleSchema.parse({
      name: 'Buy',
      selector: '#buy',
      urlPath: 'https://shop.example/?products/100.html&utm_source=email',
    });
    const owner = { user: { id: ownerId, username: 'owner', role: 'user', isAdmin: false } };
    const other = { user: { id: otherUserId, username: 'other', role: 'user', isAdmin: false } };

    try {
      await client.user.createMany({
        data: [ownerId, otherUserId].map(id => ({
          id,
          username: `rule-test-${id}`,
          password: 'unused-test-hash',
          role: 'user',
        })),
      });
      await client.website.createMany({
        data: [
          { id: websiteId, name: 'Rule fixture', userId: ownerId },
          { id: otherWebsiteId, name: 'Other rule fixture', userId: otherUserId },
        ],
      });
      expect(await canUpdateWebsite(owner, websiteId)).toBe(true);
      expect(await canUpdateWebsite(other, websiteId)).toBe(false);
      expect(await canViewAuthenticatedWebsite(other, websiteId)).toBe(false);
      expect(await canViewAuthenticatedWebsite({ shareToken: { websiteId } }, websiteId)).toBe(
        false,
      );

      const rule = await createEventRule(websiteId, data);
      expect(rule.websiteId).toBe(websiteId);
      expect(rule.urlPath).toBe('/?products/100.html');
      expect((await getWebsiteEventRules(websiteId)).length).toBe(1);
      expect(await updateEventRule(otherWebsiteId, rule.id, { name: 'Cross site' })).toBeNull();
      expect((await deleteEventRule(otherWebsiteId, rule.id)).count).toBe(0);
      const publicRules = await getPublicEventRules(
        websiteId,
        'https://shop.example/?products/100.html&utm_source=mail',
      );
      expect(publicRules).toHaveLength(1);
      expect(Object.keys(publicRules[0]).sort()).toEqual([
        'eventType',
        'id',
        'matchType',
        'name',
        'selector',
        'urlPath',
      ]);
      expect(await getPublicEventRules(websiteId, '/?products/101.html')).toEqual([]);
      expect(await getPublicEventRules(otherWebsiteId)).toEqual([]);
      await updateEventRule(websiteId, rule.id, { isEnabled: false });
      expect(await getPublicEventRules(websiteId)).toEqual([]);
      expect((await getWebsiteEventRules(websiteId))[0].isEnabled).toBe(false);

      await client.eventRule.createMany({
        data: Array.from({ length: 98 }, (_, index) => ({
          ...data,
          id: randomUUID(),
          websiteId,
          name: `Rule ${index}`,
        })),
      });
      const concurrent = await Promise.allSettled([
        createEventRule(websiteId, { ...data, name: 'Last A' }),
        createEventRule(websiteId, { ...data, name: 'Last B' }),
      ]);
      expect(concurrent.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = concurrent.find(
        result => result.status === 'rejected',
      ) as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(EventRuleLimitError);
      expect(await client.eventRule.count({ where: { websiteId } })).toBe(100);
      expect((await deleteEventRule(websiteId, rule.id)).count).toBe(1);

      await resetWebsite(websiteId);
      expect(await client.eventRule.count({ where: { websiteId } })).toBe(0);
      await createEventRule(websiteId, data);
      await deleteWebsite(websiteId);
      expect(await client.eventRule.count({ where: { websiteId } })).toBe(0);
      await createEventRule(otherWebsiteId, data);
      await client.website.update({
        where: { id: otherWebsiteId },
        data: { deletedAt: new Date() },
      });
      expect(await getPublicEventRules(otherWebsiteId)).toEqual([]);
    } finally {
      await client.eventRule.deleteMany({
        where: { websiteId: { in: [websiteId, otherWebsiteId] } },
      });
      await client.website.deleteMany({ where: { id: { in: [websiteId, otherWebsiteId] } } });
      await client.user.deleteMany({ where: { id: { in: [ownerId, otherUserId] } } });
      await client.$disconnect();
    }
  },
  30000,
);
