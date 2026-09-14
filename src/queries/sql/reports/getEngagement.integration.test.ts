import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'vitest';

// Opt in only against a dedicated development database: ENGAGEMENT_TEST_DATABASE=1.
test.skipIf(process.env.ENGAGEMENT_TEST_DATABASE !== '1')(
  'PostgreSQL engagement preserves visitor identity and filtered visit metrics',
  async () => {
    const { default: prisma } = await import('@/lib/prisma');
    const { getEngagement } = await import('./getEngagement');
    const { client } = prisma;
    const websiteId = randomUUID();
    const [oldSession, newSession, boundarySession] = [randomUUID(), randomUUID(), randomUUID()];
    const [sharedVisit, secondVisit, boundaryVisit] = [randomUUID(), randomUUID(), randomUUID()];
    const startDate = new Date('2026-09-01T00:00:00Z');
    const endDate = new Date('2026-09-01T23:59:59Z');
    const event = (
      sessionId: string,
      visitId: string,
      second: number,
      urlPath: string,
      eventType = 1,
      eventName: string | null = null,
    ) => ({
      id: randomUUID(),
      websiteId,
      sessionId,
      visitId,
      urlPath,
      eventType,
      eventName,
      createdAt: new Date(startDate.getTime() + second * 1000),
    });

    try {
      await client.website.create({
        data: {
          id: websiteId,
          name: 'Temporary engagement validation',
          domain: 'engagement.invalid',
        },
      });
      await client.session.createMany({
        data: [
          {
            id: oldSession,
            websiteId,
            createdAt: new Date('2026-09-14T00:00:00Z'),
            browser: 'chrome',
          },
          {
            id: newSession,
            websiteId,
            createdAt: new Date('2026-08-01T00:01:40Z'),
            browser: 'firefox',
          },
          { id: boundarySession, websiteId, createdAt: startDate, browser: 'chrome' },
        ],
      });
      await client.websiteEvent.createMany({
        data: [
          event(oldSession, randomUUID(), -86400, '/history'),
          event(newSession, randomUUID(), -3600, '/home', 2, 'identify'),
          event(newSession, randomUUID(), -1800, '/home', 5),
          event(oldSession, sharedVisit, 100, '/home'),
          event(oldSession, sharedVisit, 150, '/checkout'),
          event(oldSession, sharedVisit, 190, '/thanks'),
          event(oldSession, sharedVisit, 900, '/home', 5),
          event(oldSession, secondVisit, 1000, '/home'),
          event(oldSession, secondVisit, 1020, '/home', 2, 'purchase'),
          event(newSession, sharedVisit, 100, '/checkout'),
          event(boundarySession, boundaryVisit, 0, '/home'),
          event(boundarySession, boundaryVisit, 10, '/home'),
        ],
      });
      const all = await getEngagement(websiteId, {
        startDate,
        endDate,
        timezone: 'Asia/Hong_Kong',
      });
      assert.deepEqual(all.summary.all, {
        visitors: 3,
        pageviews: 7,
        visits: 4,
        bounces: 1,
        totaltime: 100,
        bounceRate: 0.25,
        pagesPerVisit: 1.75,
        avgDuration: 25,
        visitorRatio: 1,
      });
      assert.equal(all.summary.new.visitors, 2);
      assert.equal(all.summary.returning.visitors, 1);
      assert.equal(all.summary.returning.visits, 2);
      assert.equal(all.distributions.frequency[1].visitors, 1);
      for (const buckets of Object.values(all.distributions)) {
        assert.equal(
          buckets.reduce((total, row) => total + row.visits, 0),
          all.summary.all.visits,
        );
        assert.equal(
          buckets.reduce((total, row) => total + row.pageviews, 0),
          all.summary.all.pageviews,
        );
      }
      const filtered = await getEngagement(websiteId, { startDate, endDate, path: 'eq./checkout' });
      assert.equal(filtered.summary.all.visits, 2);
      assert.equal(filtered.summary.all.pageviews, 4);
      assert.equal(filtered.summary.returning.visitors, 1);
      const engaged = await getEngagement(websiteId, { startDate, endDate, excludeBounce: true });
      assert.equal(engaged.summary.all.visits, 3);
      assert.equal(engaged.summary.all.bounces, 0);
      const purchase = await getEngagement(websiteId, { startDate, endDate, event: 'eq.purchase' });
      assert.equal(purchase.summary.all.pageviews, 1);
      assert.equal(purchase.summary.all.bounces, 0);
      const chrome = await getEngagement(websiteId, { startDate, endDate, browser: 'eq.chrome' });
      assert.equal(chrome.summary.all.visits, 3);
      const empty = await getEngagement(websiteId, { startDate, endDate, path: 'eq./missing' });
      assert.equal(empty.summary.all.visits, 0);
      assert.equal(empty.distributions.duration[0].visitRatio, 0);
    } finally {
      await client.websiteEvent.deleteMany({ where: { websiteId } });
      await client.session.deleteMany({ where: { websiteId } });
      await client.website.deleteMany({ where: { id: websiteId } });
      await client.$disconnect();
    }
  },
  30000,
);
