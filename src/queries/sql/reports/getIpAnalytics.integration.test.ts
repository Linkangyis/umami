import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';

test.skipIf(process.env.IP_TEST_DATABASE !== '1')(
  'IP reports preserve visits, IP coverage and site-scoped exclusions in PostgreSQL',
  async () => {
    const database = new URL(process.env.DATABASE_URL || '');
    if (
      !['localhost', '127.0.0.1'].includes(database.hostname) ||
      database.port !== '55432' ||
      database.pathname !== '/umami_dev'
    ) {
      throw new Error('Use the dedicated development database');
    }
    const { default: prisma } = await import('@/lib/prisma');
    const { getIpAnalytics } = await import('./getIpAnalytics');
    const { createIpRule, updateIpRule, deleteIpRule, hasWebsiteBlockedIp, IpRuleLimitError } =
      await import('@/queries/prisma/ipRule');
    const client = prisma.client;
    const websiteId = randomUUID();
    const otherId = randomUUID();
    const sessions = [randomUUID(), randomUUID(), randomUUID()];
    const sharedVisit = randomUUID();
    const nextVisit = randomUUID();
    const startDate = new Date('2026-09-01T00:00:00Z');
    const endDate = new Date('2026-09-02T00:00:00Z');
    const event = (
      sessionId: string,
      visitId: string,
      offset: number,
      urlPath = '/',
      eventType = 1,
    ) => ({
      id: randomUUID(),
      websiteId,
      sessionId,
      visitId,
      urlPath,
      eventType,
      createdAt: new Date(+startDate + offset * 1000),
      eventName: eventType === 2 ? 'buy' : null,
    });
    try {
      await client.website.createMany({
        data: [websiteId, otherId].map(id => ({ id, name: 'Temporary IP validation' })),
      });
      await client.session.createMany({
        data: sessions.map((id, i) => ({
          id,
          websiteId,
          ip: i === 2 ? null : '192.0.2.8',
          browser: i === 1 ? 'firefox' : 'chrome',
        })),
      });
      await client.websiteEvent.createMany({
        data: [
          event(sessions[0], sharedVisit, 100),
          event(sessions[0], sharedVisit, 130, '/products'),
          event(sessions[0], nextVisit, 1000),
          event(sessions[0], nextVisit, 1010, '/', 2),
          event(sessions[1], sharedVisit, 100),
          event(sessions[2], sharedVisit, 100),
          event(sessions[2], randomUUID(), -10),
          event(sessions[2], randomUUID(), 110, '/', 5),
        ],
      });
      const all = await getIpAnalytics(websiteId, { startDate, endDate });
      expect(all.summary).toEqual({
        addresses: 1,
        visitors: 3,
        visits: 4,
        pageviews: 5,
        coveredVisits: 3,
        missingVisits: 1,
      });
      expect(all.count).toBe(1);
      expect(all.data[0]).toMatchObject({ ip: '192.0.2.8', visitors: 2, visits: 3, pageviews: 4 });
      const filtered = await getIpAnalytics(websiteId, {
        startDate,
        endDate,
        path: 'eq./products',
      });
      expect(filtered.summary).toMatchObject({ visits: 1, pageviews: 2, missingVisits: 0 });
      const empty = await getIpAnalytics(websiteId, { startDate, endDate }, { search: '192.0.3' });
      expect(empty.data).toEqual([]);
      expect(empty.count).toBe(0);
      expect(empty.summary).toEqual(all.summary);
      const literal = await getIpAnalytics(websiteId, { startDate, endDate }, { search: '%' });
      expect(literal.count).toBe(0);
      const beyond = await getIpAnalytics(
        websiteId,
        { startDate, endDate },
        { page: 2, pageSize: 1 },
      );
      expect(beyond.count).toBe(1);
      expect(beyond.data).toEqual([]);
      const noBounce = await getIpAnalytics(websiteId, { startDate, endDate, excludeBounce: true });
      expect(noBounce.summary.visits).toBe(2);
      const other = await getIpAnalytics(otherId, { startDate, endDate });
      expect(other.summary.addresses).toBe(0);

      const moreSessions = ['2001:db8::1', '203.0.113.10', '203.0.113.2'].map(ip => ({
        id: randomUUID(),
        websiteId,
        ip,
      }));
      await client.session.createMany({ data: moreSessions });
      await client.websiteEvent.createMany({
        data: moreSessions.map(row => event(row.id, randomUUID(), 1500)),
      });
      for (const orderBy of ['ip', 'pageviews', 'visitors', 'visits', 'lastSeen'] as const) {
        for (const descending of [true, false]) {
          const options = { orderBy, descending };
          const full = await getIpAnalytics(
            websiteId,
            { startDate, endDate },
            { ...options, pageSize: 100 },
          );
          const first = await getIpAnalytics(
            websiteId,
            { startDate, endDate },
            { ...options, pageSize: 2 },
          );
          const second = await getIpAnalytics(
            websiteId,
            { startDate, endDate },
            { ...options, page: 2, pageSize: 2 },
          );
          expect([...first.data, ...second.data].map(row => row.ip)).toEqual(
            full.data.map(row => row.ip),
          );
        }
      }

      const rule = await createIpRule(websiteId, {
        pattern: '192.0.2.0/24',
        name: 'Office',
        isEnabled: true,
      });
      expect(await hasWebsiteBlockedIp(websiteId, '::ffff:192.0.2.8')).toBe(true);
      expect(await hasWebsiteBlockedIp(otherId, '192.0.2.8')).toBe(false);
      expect(await updateIpRule(otherId, rule.id, { isEnabled: false })).toBeNull();
      expect((await deleteIpRule(otherId, rule.id)).count).toBe(0);
      await updateIpRule(websiteId, rule.id, { isEnabled: false });
      expect(await hasWebsiteBlockedIp(websiteId, '192.0.2.8')).toBe(false);
      expect((await client.websiteIpRule.findUnique({ where: { id: rule.id } }))?.name).toBe(
        'Office',
      );
      await updateIpRule(websiteId, rule.id, { isEnabled: true });
      expect(await hasWebsiteBlockedIp(websiteId, '192.0.2.8')).toBe(true);
      await deleteIpRule(websiteId, rule.id);
      expect(await hasWebsiteBlockedIp(websiteId, '192.0.2.8')).toBe(false);
      await client.websiteIpRule.createMany({
        data: Array.from({ length: 199 }, (_, i) => ({
          id: randomUUID(),
          websiteId,
          pattern: `198.51.100.${i}`,
          name: '',
        })),
      });
      const concurrent = await Promise.allSettled([
        createIpRule(websiteId, { pattern: '198.51.100.200', name: '', isEnabled: true }),
        createIpRule(websiteId, { pattern: '198.51.100.201', name: '', isEnabled: true }),
      ]);
      expect(concurrent.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      const failed = concurrent.find(
        result => result.status === 'rejected',
      ) as PromiseRejectedResult;
      expect(failed.reason).toBeInstanceOf(IpRuleLimitError);
      expect(await client.websiteIpRule.count({ where: { websiteId } })).toBe(200);
    } finally {
      await client.websiteIpRule.deleteMany({ where: { websiteId } });
      await client.websiteEvent.deleteMany({ where: { websiteId } });
      await client.session.deleteMany({ where: { websiteId } });
      await client.website.deleteMany({ where: { id: { in: [websiteId, otherId] } } });
      await client.$disconnect();
    }
  },
  30000,
);
