import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';

test.skipIf(process.env.SOURCE_TEST_DATABASE !== '1')(
  'PostgreSQL sources attribute full visits, decode keywords and disclose only recorded IP coverage',
  async () => {
    const { default: prisma } = await import('@/lib/prisma');
    const { getSourceReport } = await import('./getSourceReport');
    const { sourceKeywordDecodeSQL } = await import('@/lib/source-classification');
    const websiteId = randomUUID();
    const ids = Array.from({ length: 6 }, () => randomUUID());
    const visits = Array.from({ length: 6 }, () => randomUUID());
    const startDate = new Date('2026-09-01T00:00:00Z');
    const endDate = new Date('2026-09-01T23:59:59Z');
    const options = {
      view: 'channels' as const,
      page: 1,
      pageSize: 20,
      sort: 'visitors' as const,
      direction: 'desc' as const,
    };
    const filters = { startDate, endDate, timezone: 'Asia/Hong_Kong' };
    const event = (
      session: number,
      visitId: string,
      seconds: number,
      path: string,
      referrerDomain = '',
      referrerQuery = '',
      type = 1,
    ) => ({
      id: randomUUID(),
      websiteId,
      sessionId: ids[session],
      visitId,
      urlPath: path,
      createdAt: new Date(+startDate + seconds * 1000),
      hostname: 'site.example',
      eventType: type,
      eventName: type === 2 ? 'signup' : null,
      referrerDomain,
      referrerPath: referrerDomain ? '/search' : '',
      referrerQuery,
    });
    try {
      await prisma.client.website.create({
        data: { id: websiteId, name: 'Sources test', domain: 'site.example' },
      });
      await prisma.client.session.createMany({
        data: ids.map((id, index) => ({
          id,
          websiteId,
          browser: index === 2 ? 'firefox' : 'chrome',
          createdAt: startDate,
          ip: [0, 1].includes(index)
            ? '203.0.113.1'
            : [3, 4].includes(index)
              ? '2001:db8::1'
              : null,
        })),
      });
      await prisma.client.websiteEvent.createMany({
        data: [
          event(0, visits[0], -20, '/entry', 'www.google.com', 'q=hello+world'),
          event(0, visits[0], 10, '/landing'),
          event(0, visits[0], 30, '/checkout'),
          event(1, visits[0], 1, '/entry', 'm.baidu.com', 'wd=%E6%B5%8B%E8%AF%95&ie=utf-8'),
          event(1, visits[0], 11, '/checkout'),
          event(2, visits[2], 1, '/entry', 'google.com', 'q=(not+provided)'),
          event(2, visits[1], 200, '/entry'),
          event(2, visits[1], 202, '/entry', '', '', 2),
          event(3, visits[3], 1, '/entry', 'google.com.evil.example'),
          event(4, visits[4], 1, '/entry', 't.co'),
          event(4, visits[4], 86401, '/entry', '', '', 2),
          event(5, visits[5], 1, '/entry', 'google.com', 'q=%68ello%20world'),
        ],
      });
      const report = await getSourceReport(websiteId, options, filters);
      expect(report.summary).toMatchObject({
        pageviews: 9,
        visitors: 6,
        visits: 7,
        newVisitors: 5,
        bounces: 3,
        totalTime: 30,
        ips: 2,
        ipVisits: 4,
        missingIpVisits: 3,
      });
      expect(report.rows.map(row => row.name).sort()).toEqual([
        'direct',
        'external',
        'search',
        'social',
      ]);
      expect(report.rows.reduce((total, row) => total + row.visits, 0)).toBe(7);
      expect(JSON.stringify(report)).not.toContain('203.0.113.1');
      const keywords = await getSourceReport(websiteId, { ...options, view: 'keywords' }, filters);
      expect(keywords.totalRows).toBe(3);
      expect(keywords.rows.find(row => row.name === 'hello world')).toMatchObject({
        engine: 'google',
        pageviews: 3,
        visitors: 2,
        visits: 2,
        bounces: 1,
        newVisitors: 1,
        ips: 1,
        ipVisits: 1,
      });
      expect(keywords.rows.find(row => row.keywordStatus === 'unavailable')).toMatchObject({
        engine: 'google',
        pageviews: 1,
        ips: null,
        ipCoverage: 0,
      });
      expect(keywords.rows.find(row => row.name === '测试')?.engine).toBe('baidu');
      const external = await getSourceReport(websiteId, { ...options, view: 'urls' }, filters);
      expect(external.rows.map(row => row.name).sort()).toEqual([
        'google.com.evil.example/search',
        't.co/search',
      ]);
      const engines = await getSourceReport(websiteId, { ...options, view: 'engines' }, filters);
      expect(engines.rows.some(row => row.name === 'google')).toBe(true);
      const filtered = await getSourceReport(websiteId, options, {
        ...filters,
        path: 'eq./checkout',
      });
      expect(filtered.summary).toMatchObject({
        pageviews: 4,
        visitors: 2,
        visits: 2,
        newVisitors: 1,
        bounces: 0,
        totalTime: 30,
        ips: 1,
      });
      expect(filtered.rows).toHaveLength(1);
      expect(filtered.rows[0].name).toBe('search');
      const excluded = await getSourceReport(
        websiteId,
        { ...options, excludeDomains: ['google.com'] },
        filters,
      );
      expect(excluded.summary).toMatchObject({ pageviews: 5, visits: 4, visitors: 4 });
      const search = await getSourceReport(
        websiteId,
        { ...options, view: 'keywords', search: 'hello', pageSize: 1 },
        filters,
      );
      expect(search.totalRows).toBe(1);
      expect(search.viewSummary.pageviews).toBe(3);
      const beyond = await getSourceReport(websiteId, { ...options, page: 100 }, filters);
      expect(beyond.rows).toEqual([]);
      expect(beyond.totalRows).toBe(4);
      for (const raw of ['%FF', '%00', '%ZZ', '%E0%A4%A']) {
        const [decoded] = await prisma.rawQuery(
          `select ${sourceKeywordDecodeSQL('{{raw}}', false)} as decoded`,
          { raw },
        );
        expect(decoded.decoded).toBe('');
      }
      await prisma.client.websiteEvent.create({
        data: event(0, randomUUID(), 300, '/entry', 'bing.com', 'q=hello+world'),
      });
      const matrix = await getSourceReport(
        websiteId,
        { ...options, view: 'keywords', matrix: true },
        filters,
      );
      expect(matrix.rows.find(row => row.name === 'hello world')).toMatchObject({
        visitors: 2,
        visits: 3,
        pageviews: 4,
        ips: 1,
      });
      expect(
        matrix.matrixCells
          .filter(row => row.name === 'hello world')
          .map(row => [row.engine, row.visitors])
          .sort(),
      ).toEqual([
        ['bing', 1],
        ['google', 2],
      ]);
      await prisma.client.websiteEvent.create({
        data: { ...event(0, randomUUID(), 400, '/campaign'), utmCampaign: 'launch-only' },
      });
      const campaignOnly = await getSourceReport(websiteId, options, filters);
      expect(campaignOnly.rows.find(row => row.name === 'campaign')).toMatchObject({
        visits: 1,
        pageviews: 1,
      });
    } finally {
      await prisma.client.websiteEvent.deleteMany({ where: { websiteId } });
      await prisma.client.session.deleteMany({ where: { websiteId } });
      await prisma.client.website.deleteMany({ where: { id: websiteId } });
      await prisma.client.$disconnect();
    }
  },
  30000,
);
