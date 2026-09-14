import clickhouse from '@/lib/clickhouse';
import { EVENT_TYPE, FILTER_COLUMNS } from '@/lib/constants';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';
import type { EngagementBucket, EngagementMetrics, EngagementResult } from '@/types/engagement';

const FUNCTION_NAME = 'getEngagement';
const DURATION_BUCKETS = [
  { id: '0-10', min: 0, max: 10 },
  { id: '11-30', min: 11, max: 30 },
  { id: '31-60', min: 31, max: 60 },
  { id: '61-180', min: 61, max: 180 },
  { id: '181-600', min: 181, max: 600 },
  { id: '601-1800', min: 601, max: 1800 },
  { id: '1801+', min: 1801, max: null },
];
const COUNT_BUCKETS = [
  { id: '1', min: 1, max: 1 },
  { id: '2', min: 2, max: 2 },
  { id: '3', min: 3, max: 3 },
  { id: '4', min: 4, max: 4 },
  { id: '5', min: 5, max: 5 },
  { id: '6-10', min: 6, max: 10 },
  { id: '11-20', min: 11, max: 20 },
  { id: '21+', min: 21, max: null },
];

interface AggregateRow {
  section: 'summary' | 'duration' | 'depth' | 'frequency';
  bucket: string;
  visitors: number | string | bigint;
  visits: number | string | bigint;
  pageviews: number | string | bigint;
  bounces: number | string | bigint;
  totaltime: number | string | bigint;
}

/**
 * Filters select matching visits, then all their in-period pageviews are aggregated.
 * Visitors are rotating session identities, not persistent people or IP addresses.
 * First seen is the earliest retained pageview on both backends. Session creation,
 * custom events and performance samples do not define a pageview visitor's age.
 * Deleted history and salt rotation limit recognition across periods.
 */
export async function getEngagement(
  websiteId: string,
  filters: QueryFilters,
): Promise<EngagementResult> {
  const rows = await runQuery({
    [PRISMA]: () => relationalQuery(websiteId, filters),
    [CLICKHOUSE]: () => clickhouseQuery(websiteId, filters),
  });

  return formatResults(rows || []);
}

async function relationalQuery(websiteId: string, filters: QueryFilters) {
  const { filterQuery, joinSessionQuery, cohortQuery, queryParams } = prisma.parseFilters({
    ...filters,
    websiteId,
  });

  return prisma.rawQuery(
    `with matching_visits as (
      select distinct website_event.session_id, website_event.visit_id
      from website_event
      ${joinSessionQuery}
      ${cohortQuery}
      where website_event.website_id = {{websiteId::uuid}}
        and website_event.created_at between {{startDate}} and {{endDate}}
        and website_event.event_type != ${EVENT_TYPE.performance}
        ${filterQuery}
    ), first_seen as (
      select history.session_id, min(history.created_at) as first_at
      from website_event history
      where history.website_id = {{websiteId::uuid}}
        and history.event_type = ${EVENT_TYPE.pageView}
        and history.created_at <= {{endDate}}
        and history.session_id in (select session_id from matching_visits)
      group by history.session_id
    ), visit_totals as (
      select website_event.session_id, website_event.visit_id,
        sum(case when website_event.event_type = ${EVENT_TYPE.pageView} then 1 else 0 end) as pageviews,
        max(case when website_event.event_type = ${EVENT_TYPE.customEvent} then 1 else 0 end) as has_event,
        floor(extract(epoch from (
          max(case when website_event.event_type = ${EVENT_TYPE.pageView} then website_event.created_at end)
          - min(case when website_event.event_type = ${EVENT_TYPE.pageView} then website_event.created_at end)
        ))) as duration
      from website_event
      inner join matching_visits matched
        on matched.session_id = website_event.session_id
        and matched.visit_id = website_event.visit_id
      where website_event.website_id = {{websiteId::uuid}}
        and website_event.created_at between {{startDate}} and {{endDate}}
        and website_event.event_type in (${EVENT_TYPE.pageView}, ${EVENT_TYPE.customEvent})
      group by website_event.session_id, website_event.visit_id
      having sum(case when website_event.event_type = ${EVENT_TYPE.pageView} then 1 else 0 end) > 0
    ), visits as (
      select totals.session_id, totals.visit_id, totals.pageviews, totals.duration,
        case when totals.pageviews = 1 and totals.has_event = 0 then 1 else 0 end as bounces,
        case when first_seen.first_at >= {{startDate}} then 'new' else 'returning' end as visitor_type
      from visit_totals totals
      inner join first_seen on first_seen.session_id = totals.session_id
      ${filters.excludeBounce ? 'where not (totals.pageviews = 1 and totals.has_event = 0)' : ''}
    )
    ${aggregateSQL(false)}`,
    queryParams,
    FUNCTION_NAME,
  );
}

async function clickhouseQuery(websiteId: string, filters: QueryFilters) {
  const { filterQuery, cohortQuery, queryParams } = clickhouse.parseFilters(
    { ...filters, websiteId },
    {
      columns: Object.fromEntries(
        Object.entries(FILTER_COLUMNS).map(([key, column]) => [key, `website_event.${column}`]),
      ),
    },
  );

  return clickhouse.rawQuery(
    `with matching_visits as (
      select distinct website_event.session_id, website_event.visit_id
      from website_event
      ${cohortQuery}
      where website_event.website_id = {websiteId:UUID}
        and website_event.created_at between {startDate:DateTime64} and {endDate:DateTime64}
        and website_event.event_type != ${EVENT_TYPE.performance}
        ${filterQuery}
    ), first_seen as (
      select history.session_id, min(history.created_at) as first_at
      from website_event history
      where history.website_id = {websiteId:UUID}
        and history.event_type = ${EVENT_TYPE.pageView}
        and history.created_at <= {endDate:DateTime64}
        and history.session_id in (select session_id from matching_visits)
      group by history.session_id
    ), visit_totals as (
      select website_event.session_id as session_id, website_event.visit_id as visit_id,
        countIf(website_event.event_type = ${EVENT_TYPE.pageView}) as pageviews,
        countIf(website_event.event_type = ${EVENT_TYPE.customEvent}) as has_event,
        dateDiff('second',
          minIf(website_event.created_at, website_event.event_type = ${EVENT_TYPE.pageView}),
          maxIf(website_event.created_at, website_event.event_type = ${EVENT_TYPE.pageView})
        ) as duration
      from website_event
      inner join matching_visits matched
        on matched.session_id = website_event.session_id
        and matched.visit_id = website_event.visit_id
      where website_event.website_id = {websiteId:UUID}
        and website_event.created_at between {startDate:DateTime64} and {endDate:DateTime64}
        and website_event.event_type in (${EVENT_TYPE.pageView}, ${EVENT_TYPE.customEvent})
      group by website_event.session_id, website_event.visit_id
      having countIf(website_event.event_type = ${EVENT_TYPE.pageView}) > 0
    ), visits as (
      select totals.session_id as session_id, totals.visit_id as visit_id,
        totals.pageviews as pageviews, totals.duration as duration,
        if(totals.pageviews = 1 and totals.has_event = 0, 1, 0) as bounces,
        if(first_seen.first_at >= {startDate:DateTime64}, 'new', 'returning') as visitor_type
      from visit_totals totals
      inner join first_seen on first_seen.session_id = totals.session_id
      ${filters.excludeBounce ? 'where not (totals.pageviews = 1 and totals.has_event = 0)' : ''}
    )
    ${aggregateSQL(true)}`,
    queryParams,
    FUNCTION_NAME,
  );
}

function bucketSQL(field: string, buckets: { id: string; max: number | null }[]) {
  return `case ${buckets
    .filter(bucket => bucket.max !== null)
    .map(bucket => `when ${field} <= ${bucket.max} then '${bucket.id}'`)
    .join(' ')} else '${buckets[buckets.length - 1].id}' end`;
}

function aggregateSQL(isClickhouse: boolean) {
  const visitors = isClickhouse
    ? 'uniqExact(visits.session_id)'
    : 'count(distinct visits.session_id)';
  const aggregates = `${visitors} as visitors, count(*) as visits,
    coalesce(sum(visits.pageviews), 0) as pageviews, coalesce(sum(visits.bounces), 0) as bounces,
    coalesce(sum(visits.duration), 0) as totaltime`;

  return `select 'summary' as section, 'all' as bucket, ${aggregates} from visits
    union all
    select 'summary' as section, visitor_type as bucket, ${aggregates}
    from visits group by visitor_type
    union all
    select 'duration' as section, ${bucketSQL('visits.duration', DURATION_BUCKETS)} as bucket,
      ${aggregates} from visits group by bucket
    union all
    select 'depth' as section, ${bucketSQL('visits.pageviews', COUNT_BUCKETS)} as bucket,
      ${aggregates} from visits group by bucket
    union all
    select 'frequency' as section, ${bucketSQL('visit_count', COUNT_BUCKETS)} as bucket,
      count(*) as visitors, sum(visit_count) as visits, sum(view_count) as pageviews,
      sum(bounce_count) as bounces, sum(total_duration) as totaltime
    from (
      select session_id, count(*) as visit_count, sum(pageviews) as view_count,
        sum(bounces) as bounce_count, sum(duration) as total_duration
      from visits group by session_id
    ) frequency group by bucket`;
}

const ratio = (value: number, total: number) => (total > 0 ? value / total : 0);

function metrics(row?: AggregateRow, totalVisitors = 0): EngagementMetrics {
  const visitors = Number(row?.visitors || 0);
  const pageviews = Number(row?.pageviews || 0);
  const visits = Number(row?.visits || 0);
  const bounces = Number(row?.bounces || 0);
  const totaltime = Number(row?.totaltime || 0);

  return {
    visitors,
    pageviews,
    visits,
    bounces,
    totaltime,
    bounceRate: ratio(bounces, visits),
    pagesPerVisit: ratio(pageviews, visits),
    avgDuration: ratio(totaltime, visits),
    visitorRatio: ratio(visitors, totalVisitors),
  };
}

function formatResults(rows: AggregateRow[]): EngagementResult {
  const summaryRows = rows.filter(row => row.section === 'summary');
  const allRow = summaryRows.find(row => row.bucket === 'all');
  const all = metrics(allRow, Number(allRow?.visitors || 0));
  const distribution = (section: 'duration' | 'depth' | 'frequency'): EngagementBucket[] =>
    (section === 'duration' ? DURATION_BUCKETS : COUNT_BUCKETS).map(bucket => {
      const row = rows.find(row => row.section === section && row.bucket === bucket.id);
      const visitors = Number(row?.visitors || 0);
      const visits = Number(row?.visits || 0);
      const pageviews = Number(row?.pageviews || 0);

      return {
        ...bucket,
        visitors,
        visits,
        pageviews,
        visitorRatio: ratio(visitors, all.visitors),
        visitRatio: ratio(visits, all.visits),
        pageviewRatio: ratio(pageviews, all.pageviews),
      };
    });

  return {
    summary: {
      all,
      new: metrics(
        summaryRows.find(row => row.bucket === 'new'),
        all.visitors,
      ),
      returning: metrics(
        summaryRows.find(row => row.bucket === 'returning'),
        all.visitors,
      ),
    },
    distributions: {
      duration: distribution('duration'),
      depth: distribution('depth'),
      frequency: distribution('frequency'),
    },
    metadata: {
      identity: 'session',
      saltRotation: process.env.SALT_ROTATION || 'month',
      newVisitorDefinition: 'first-seen-in-period',
      filterScope: 'matching-visits',
      durationBasis: 'first-to-last-pageview',
    },
  };
}
