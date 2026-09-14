import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';

// Opt in only against a dedicated development database: TRAFFIC_TEST_DATABASE=1.
test.skipIf(process.env.TRAFFIC_TEST_DATABASE !== '1')(
  'PostgreSQL traffic counts composite visits, unique visitors, first seen and filtered bounce status',
  async () => {
    const { default: prisma } = await import('@/lib/prisma');
    const { getTrafficReport } = await import('./getTrafficReport');
    const { createSession } = await import('../sessions/createSession');
    const { getWebsiteSessionIps } = await import('../sessions/getWebsiteSessionIps');
    const { getWebsiteSessions } = await import('../sessions/getWebsiteSessions');
    const websiteId = randomUUID();
    const sessions = [randomUUID(), randomUUID(), randomUUID()];
    const sharedVisit = randomUUID();
    const { client } = prisma;
    const event = (
      sessionId: string,
      visitId: string,
      createdAt: string,
      urlPath = '/a',
      eventType = 1,
    ) => ({
      id: randomUUID(),
      websiteId,
      sessionId,
      visitId,
      createdAt: new Date(createdAt),
      urlPath,
      eventType,
      eventName: eventType === 2 ? 'signup' : undefined,
    });
    try {
      await client.session.createMany({
        data: sessions.map(id => ({ id, websiteId, browser: 'Chrome', country: 'HK' })),
      });
      await client.websiteEvent.createMany({
        data: [
          event(sessions[0], randomUUID(), '2026-01-01T12:00:00Z'),
          event(sessions[0], sharedVisit, '2026-01-02T23:59:00Z'),
          event(sessions[0], sharedVisit, '2026-01-03T00:01:00Z', '/b'),
          event(sessions[1], sharedVisit, '2026-01-02T11:00:00Z'),
          event(sessions[1], sharedVisit, '2026-01-02T11:01:00Z', '/a', 2),
          event(sessions[2], randomUUID(), '2026-01-02T11:30:00Z'),
        ],
      });
      const filters = {
        startDate: new Date('2026-01-02T00:00:00Z'),
        endDate: new Date('2026-01-04T23:59:59.999Z'),
        unit: 'day' as const,
        timezone: 'UTC',
      };
      const report = await getTrafficReport(websiteId, filters);
      expect(report.summary).toMatchObject({
        pageviews: 4,
        visitors: 3,
        newVisitors: 2,
        visits: 3,
        bounces: 1,
        totalTime: 120,
        averageDuration: 40,
      });
      expect(report.summary.bounceRate).toBeCloseTo(100 / 3);
      expect(
        report.rows.map(row => [row.pageviews, row.visitors, row.visits, row.newVisitors]),
      ).toEqual([
        [3, 3, 3, 2],
        [1, 1, 1, 0],
        [0, 0, 0, 0],
      ]);
      expect(report.rows.reduce((sum, row) => sum + row.visitors, 0)).toBe(4);
      expect(report.rows.reduce((sum, row) => sum + row.visits, 0)).toBe(4);

      const filtered = await getTrafficReport(websiteId, {
        ...filters,
        path: 'eq./a',
        browser: 'eq.Chrome',
      });
      expect(filtered.summary).toMatchObject({ pageviews: 3, visitors: 3, visits: 3, bounces: 1 });
      const returning = await getTrafficReport(websiteId, { ...filters, visitorType: 'returning' });
      expect(returning.summary).toMatchObject({
        pageviews: 2,
        visitors: 1,
        visits: 1,
        newVisitors: 0,
      });
      const firstSeen = await getTrafficReport(websiteId, { ...filters, visitorType: 'new' });
      expect(firstSeen.summary).toMatchObject({
        pageviews: 2,
        visitors: 2,
        visits: 2,
        newVisitors: 2,
      });
      const weekly = await getTrafficReport(websiteId, {
        ...filters,
        unit: 'week',
        timezone: 'Asia/Hong_Kong',
      });
      expect(weekly.rows).toHaveLength(2);
      expect(weekly.rows[1]).toMatchObject({ x: '2026-01-04T16:00:00.000Z', pageviews: 0 });
      expect(weekly.rows[0]).toMatchObject({
        x: '2025-12-28T16:00:00.000Z',
        pageviews: 4,
        visitors: 3,
        visits: 3,
      });

      await client.websiteEvent.createMany({
        data: [
          event(sessions[0], randomUUID(), '2025-11-02T05:15:00Z'),
          event(sessions[0], randomUUID(), '2025-11-02T06:15:00Z'),
        ],
      });
      const dst = await getTrafficReport(websiteId, {
        startDate: new Date('2025-11-02T04:00:00Z'),
        endDate: new Date('2025-11-02T07:59:59Z'),
        unit: 'hour',
        timezone: 'America/New_York',
      });
      expect(dst.rows.map(row => row.pageviews)).toEqual([0, 1, 1, 0]);

      // Existing historical rows stay unknown until that visitor returns.
      expect(await getWebsiteSessionIps(websiteId, sessions)).toEqual(
        Object.fromEntries(sessions.map(id => [id, null])),
      );
      await createSession({
        id: sessions[2],
        websiteId,
        ip: '::ffff:203.0.113.8',
        createdAt: new Date(),
      });
      expect(await getWebsiteSessionIps(websiteId, [sessions[2]])).toEqual({
        [sessions[2]]: '203.0.113.8',
      });
      await createSession({ id: sessions[2], websiteId, ip: '203.0.113.9', createdAt: new Date() });
      expect(await getWebsiteSessionIps(websiteId, [sessions[2]])).toEqual({
        [sessions[2]]: '203.0.113.8',
      });
      expect(await getWebsiteSessionIps(randomUUID(), [sessions[2]])).toEqual({});
      const privateSearch = await getWebsiteSessions(
        websiteId,
        { ...filters, search: '203.0.113.8' },
        { includeIpSearch: true },
      );
      expect(privateSearch.data.map(row => row.id)).toEqual([sessions[2]]);
      const sharedSearch = await getWebsiteSessions(websiteId, {
        ...filters,
        search: '203.0.113.8',
      });
      expect(sharedSearch.data).toHaveLength(0);
    } finally {
      await client.websiteEvent.deleteMany({ where: { websiteId } });
      await client.session.deleteMany({ where: { websiteId } });
      await client.$disconnect();
    }
  },
  30_000,
);
