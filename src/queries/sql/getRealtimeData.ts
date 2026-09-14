import type { QueryFilters } from '@/lib/types';
import { getRealtimeActivity } from '@/queries/sql/getRealtimeActivity';
import { getPageviewStats } from '@/queries/sql/pageviews/getPageviewStats';
import { getSessionStats } from '@/queries/sql/sessions/getSessionStats';

function increment(data: object, key: string) {
  if (key) {
    if (!data[key]) {
      data[key] = 1;
    } else {
      data[key] += 1;
    }
  }
}

export async function getRealtimeData(websiteId: string, filters: QueryFilters) {
  const [activity, pageviews, sessions] = await Promise.all([
    getRealtimeActivity(websiteId, filters),
    getPageviewStats(websiteId, filters),
    getSessionStats(websiteId, filters),
  ]);

  const uniques = new Set();

  const { countries, regions, urls, referrers, events } = activity.reverse().reduce(
    (
      obj: { countries: any; regions: any; urls: any; referrers: any; events: any },
      event: {
        sessionId: string;
        urlPath: string;
        referrerDomain: string;
        country: string;
        region?: string;
        eventName: string;
      },
    ) => {
      const { countries, regions, urls, referrers, events } = obj;
      const { sessionId, urlPath, referrerDomain, country, region, eventName } = event;

      if (!uniques.has(sessionId)) {
        uniques.add(sessionId);
        increment(countries, country);
        if (region && country)
          increment(regions, region.includes('-') ? region : `${country}-${region}`);

        events.push({ __type: 'session', ...event });
      }

      increment(urls, urlPath);
      increment(referrers, referrerDomain);

      events.push({ __type: eventName ? 'event' : 'pageview', ...event });

      return obj;
    },
    {
      countries: {},
      regions: {},
      urls: {},
      referrers: {},
      events: [],
    },
  );

  return {
    countries,
    regions,
    urls,
    referrers,
    events: events.reverse(),
    series: {
      views: pageviews,
      visitors: sessions,
    },
    totals: {
      views: pageviews.reduce((sum: number, { y }: { y: number }) => Number(sum) + Number(y), 0),
      visitors: sessions.reduce((sum: number, { y }: { y: number }) => Number(sum) + Number(y), 0),
      events: activity.filter(e => e.eventName).length,
      countries: Object.keys(countries).length,
    },
    timestamp: Date.now(),
  };
}
