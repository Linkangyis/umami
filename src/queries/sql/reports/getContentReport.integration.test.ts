import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';

test.skipIf(process.env.CONTENT_TEST_DATABASE !== '1')(
  'content SQL counts full URLs, measured dwell, landing sources and overlapping groups',
  async () => {
    const { default: prisma } = await import('@/lib/prisma');
    const { getContentReport } = await import('./getContentReport');
    const { getContentGroups, createContentGroup, updateContentGroup, deleteContentGroup } =
      await import('@/queries/prisma/content-group');
    const { client } = prisma;
    const websiteId = randomUUID();
    const sessions = Array.from({ length: 4 }, () => randomUUID());
    const sharedVisit = randomUUID();
    const event = (
      sessionId: string,
      createdAt: string,
      urlPath = '/',
      urlQuery = 'products/',
      hostname = 'one.example',
      source = '',
      eventType = 1,
      visitId = sharedVisit,
    ) => ({
      id: randomUUID(),
      websiteId,
      sessionId,
      visitId,
      createdAt: new Date(createdAt),
      urlPath,
      urlQuery,
      hostname,
      referrerDomain: source,
      pageTitle: urlQuery === 'products/' ? 'Products' : 'Other',
      eventType,
    });
    try {
      await client.website.create({
        data: { id: websiteId, name: 'Content SQL fixture', domain: 'one.example' },
      });
      await client.session.createMany({
        data: sessions.map(id => ({ id, websiteId, browser: 'Chrome', country: 'US' })),
      });
      await client.websiteEvent.createMany({
        data: [
          event(
            sessions[0],
            '2026-01-01T10:00:00Z',
            '/old',
            '',
            'one.example',
            '',
            1,
            randomUUID(),
          ),
          event(sessions[0], '2026-01-02T10:00:00Z', '/', 'products/', 'one.example', 'google.com'),
          event(sessions[0], '2026-01-02T10:00:30Z', '/detail#specs', 'id=1'),
          event(sessions[0], '2026-01-02T10:01:00Z'),
          event(sessions[0], '2026-01-02T10:02:00Z', '/checkout', ''),
          event(sessions[1], '2026-01-02T10:00:10Z', '/', 'products/', 'one.example', 'bing.com'),
          event(sessions[1], '2026-01-02T10:00:20Z', '/', 'products/', 'one.example', '', 2),
          event(sessions[2], '2026-01-02T10:00:15Z', '/', 'articles/', 'one.example', 'google.com'),
          event(sessions[3], '2026-01-02T10:00:15Z', '/', 'products/', 'two.example'),
        ],
      });
      const filters = {
        startDate: new Date('2026-01-02T09:59:00Z'),
        endDate: new Date('2026-01-02T10:01:30Z'),
      };
      const report = await getContentReport(websiteId, filters, { mode: 'fullUrl' });
      expect(report.summary).toMatchObject({
        pageviews: 6,
        visitors: 4,
        visits: 4,
        newVisitors: 3,
        entrances: 4,
        exits: 3,
        bounces: 2,
        dwellSamples: 3,
        dwellSeconds: 120,
        averageDwell: 40,
        dwellCoverage: 50,
      });
      expect(report.count).toBe(4);
      expect(report.rows[0]).toMatchObject({
        name: 'one.example/?products/',
        pageviews: 3,
        visitors: 2,
        visits: 2,
        newVisitors: 1,
        entrances: 2,
        exits: 1,
        bounces: 0,
        dwellSamples: 2,
        averageDwell: 45,
      });
      expect(report.rows.find(row => row.name === 'one.example/detail?id=1#specs')).toMatchObject({
        averageDwell: 30,
        entrances: 0,
        exits: 0,
      });
      expect(report.rows.find(row => row.name === 'two.example/?products/')).toMatchObject({
        averageDwell: null,
        dwellCoverage: 0,
        bounces: 1,
      });
      const sources = await getContentReport(websiteId, filters, {
        mode: 'entry',
        detail: 'one.example/?products/',
      });
      expect(
        sources.sources.map(row => [row.name, row.entrances, row.bounces, row.contribution]),
      ).toEqual([
        ['bing.com', 1, 0, 50],
        ['google.com', 1, 0, 50],
      ]);
      expect(sources.rows.some(row => row.name.includes('/detail'))).toBe(false);
      const paths = await getContentReport(websiteId, filters, { mode: 'path' });
      expect(paths.rows.map(row => [row.name, row.pageviews])).toEqual([
        ['/', 5],
        ['/detail#specs', 1],
      ]);
      const titles = await getContentReport(websiteId, filters, { mode: 'title' });
      expect(titles.rows.map(row => [row.name, row.pageviews])).toEqual([
        ['Products', 4],
        ['Other', 2],
      ]);
      expect(titles.summary.visitors).toBe(4);
      const hosts = await getContentReport(websiteId, filters, { mode: 'hostname' });
      expect(hosts.rows.map(row => [row.name, row.pageviews])).toEqual([
        ['one.example', 5],
        ['two.example', 1],
      ]);
      const exits = await getContentReport(websiteId, filters, { mode: 'exit' });
      expect(exits.rows.some(row => row.name.includes('/detail'))).toBe(false);
      const filtered = await getContentReport(
        websiteId,
        { ...filters, browser: 'eq.Chrome', path: 'eq./' },
        { mode: 'fullUrl', search: 'articles' },
      );
      expect(filtered.summary).toMatchObject({
        pageviews: 1,
        visitors: 1,
        bounces: 1,
        averageDwell: null,
      });
      const paged = await getContentReport(websiteId, filters, {
        mode: 'fullUrl',
        page: 2,
        pageSize: 1,
      });
      expect(paged.count).toBe(4);
      expect(paged.rows).toHaveLength(1);
      const beyond = await getContentReport(websiteId, filters, {
        mode: 'fullUrl',
        page: 99,
        pageSize: 1,
      });
      expect(beyond.count).toBe(4);
      expect(beyond.rows).toHaveLength(0);

      const products = await createContentGroup(websiteId, {
        name: 'Products',
        rules: [{ field: 'route', operator: 'prefix', value: '/?products/' }],
      });
      await createContentGroup(websiteId, {
        name: 'All routes',
        rules: [{ field: 'route', operator: 'contains', value: '/' }],
      });
      const groups = await getContentGroups(websiteId);
      const grouped = await getContentReport(websiteId, filters, { mode: 'group', groups });
      expect(grouped.rows.map(row => row.pageviews).sort()).toEqual([4, 6]);
      expect(grouped.summary).toMatchObject({ pageviews: 6, visitors: 4, visits: 4 });
      const nameSorted = await getContentReport(websiteId, filters, {
        mode: 'group',
        groups,
        orderBy: 'name',
        sortDescending: true,
      });
      expect(nameSorted.rows.map(row => row.name)).toEqual(['Products', 'All routes']);
      const searchGroup = await getContentReport(websiteId, filters, {
        mode: 'group',
        groups,
        search: 'Products',
      });
      expect(searchGroup.summary).toMatchObject({ pageviews: 4, visitors: 3, visits: 3 });
      expect(
        await updateContentGroup(randomUUID(), products.id, {
          name: 'Wrong site',
          rules: groups[0].rules,
        }),
      ).toBeNull();
      expect((await deleteContentGroup(randomUUID(), products.id)).count).toBe(0);
      await updateContentGroup(websiteId, products.id, {
        name: 'Exact articles',
        rules: [{ field: 'route', operator: 'exact', value: '/?articles/' }],
      });
      const updated = await getContentReport(websiteId, filters, {
        mode: 'group',
        groups: await getContentGroups(websiteId),
        search: 'Exact articles',
      });
      expect(updated.summary.pageviews).toBe(1);
      expect((await deleteContentGroup(websiteId, products.id)).count).toBe(1);
      const empty = await getContentReport(websiteId, filters, {
        mode: 'group',
        groups: [],
        search: 'nothing',
      });
      expect(empty.count).toBe(0);
      expect(empty.summary.averageDwell).toBeNull();
      await client.contentGroup.createMany({
        data: Array.from({ length: 98 }, (_, index) => ({
          id: randomUUID(),
          websiteId,
          name: `Limit fixture ${index}`,
          rules: [{ field: 'route', operator: 'exact', value: '/not-visited' }],
        })),
      });
      const competing = await Promise.allSettled(
        [1, 2].map(index =>
          createContentGroup(websiteId, {
            name: `Concurrent ${index}`,
            rules: [{ field: 'route', operator: 'exact', value: '/' }],
          }),
        ),
      );
      expect(competing.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(await client.contentGroup.count({ where: { websiteId } })).toBe(100);
    } finally {
      await client.contentGroup.deleteMany({ where: { websiteId } });
      await client.websiteEvent.deleteMany({ where: { websiteId } });
      await client.session.deleteMany({ where: { websiteId } });
      await client.website.deleteMany({ where: { id: websiteId } });
      await client.$disconnect();
    }
  },
  30000,
);
