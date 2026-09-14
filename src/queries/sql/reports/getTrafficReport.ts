import clickhouse from '@/lib/clickhouse';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';
import {
  fillTrafficRows,
  type TrafficPeriod,
  type TrafficUnit,
  type TrafficVisitorType,
  trafficBucketDates,
  trafficMetrics,
} from '@/lib/traffic';
import type { QueryFilters } from '@/lib/types';

export interface TrafficFilters extends QueryFilters {
  startDate: Date;
  endDate: Date;
  unit: TrafficUnit;
  visitorType?: TrafficVisitorType;
}

export async function getTrafficReport(
  websiteId: string,
  filters: TrafficFilters,
): Promise<TrafficPeriod> {
  const { startDate, endDate, unit, timezone = 'UTC' } = filters;
  const dates = trafficBucketDates(startDate, endDate, unit, timezone);
  const records = await runQuery({
    [PRISMA]: () => queryTraffic(websiteId, filters, false),
    [CLICKHOUSE]: () => queryTraffic(websiteId, filters, true),
  });
  return {
    summary: trafficMetrics(records.find(row => row.x === null)),
    rows: fillTrafficRows(
      dates,
      records
        .filter(row => row.x !== null)
        .map(row => ({ ...trafficMetrics(row), x: new Date(Number(row.x) * 1000).toISOString() })),
    ),
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

async function queryTraffic(websiteId: string, filters: TrafficFilters, isClickhouse: boolean) {
  const { unit, timezone = 'UTC', visitorType = 'all' } = filters;
  const database = isClickhouse ? clickhouse : prisma;
  const parsed = database.parseFilters({ ...filters, websiteId });
  const { filterQuery, cohortQuery, excludeBounceQuery, queryParams } = parsed;
  const joinSessionQuery = 'joinSessionQuery' in parsed ? parsed.joinSessionQuery : '';
  const website = isClickhouse ? '{websiteId:UUID}' : '{{websiteId::uuid}}';
  const start = isClickhouse ? '{startDate:DateTime64}' : '{{startDate}}';
  const end = isClickhouse ? '{endDate:DateTime64}' : '{{endDate}}';
  const zone = isClickhouse ? '{trafficTimezone:String}' : '{{trafficTimezone}}';
  const bucket = (field: string) => {
    if (isClickhouse) {
      return `toInt64(toUnixTimestamp(date_trunc('${unit}', ${field}, ${zone})))`;
    }
    // Preserve the UTC offset of each occurrence of an hour during DST rollback.
    if (unit === 'hour') {
      const offset = `extract(epoch from (${field} at time zone ${zone} - ${field} at time zone 'UTC'))`;
      return `(floor((extract(epoch from ${field}) + ${offset}) / 3600) * 3600 - ${offset})::bigint`;
    }
    return `extract(epoch from (date_trunc('${unit}', ${field} at time zone ${zone}) at time zone ${zone}))::bigint`;
  };
  const duration = isClickhouse
    ? `dateDiff('second', min(created_at), max(created_at))`
    : 'floor(extract(epoch from (max(created_at) - min(created_at))))';
  const unique = (field: string) =>
    isClickhouse ? `uniqExact(${field})` : `count(distinct ${field})`;
  const newVisitors = (condition: string) =>
    isClickhouse
      ? `uniqExactIf(v.session_id, ${condition})`
      : `count(distinct case when ${condition} then v.session_id end)`;
  const visitorFilter =
    visitorType === 'all'
      ? ''
      : `where f.first_seen ${visitorType === 'new' ? '>=' : '<'} ${start}`;
  const metrics = (newCondition: string) => `
    coalesce(sum(v.pageviews), 0) as "pageviews",
    ${unique('v.session_id')} as "visitors",
    ${newVisitors(newCondition)} as "newVisitors",
    count(*) as "visits",
    coalesce(sum(case when a.pageviews = 1 and a.custom_events = 0 then 1 else 0 end), 0) as "bounces",
    coalesce(sum(v.duration), 0) as "totalTime"`;

  // Visit identity is (session_id, visit_id), and summary uniqueness is computed separately.
  // Bounce status uses all activity in matching visits so a path filter does not invent bounces.
  return database.rawQuery(
    `with filtered_views as (
      select website_event.session_id, website_event.visit_id, website_event.created_at
      from website_event
      ${cohortQuery}
      ${excludeBounceQuery}
      ${joinSessionQuery}
      where website_event.website_id = ${website}
        and website_event.created_at between ${start} and ${end}
        and website_event.event_type NOT IN (2, 5)
        ${filterQuery}
    ), first_seen as (
      select session_id, min(created_at) as first_seen
      from website_event
      where website_id = ${website}
        and event_type NOT IN (2, 5)
        and session_id in (select session_id from filtered_views)
      group by session_id
    ), selected_views as (
      select e.session_id, e.visit_id, e.created_at, f.first_seen,
        ${bucket('e.created_at')} as bucket
      from filtered_views e join first_seen f on f.session_id = e.session_id
      ${visitorFilter}
    ), full_visits as (
      select session_id, visit_id,
        sum(case when event_type NOT IN (2, 5) then 1 else 0 end) as pageviews,
        sum(case when event_type = 2 then 1 else 0 end) as custom_events
      from website_event
      where website_id = ${website}
        and created_at between ${start} and ${end}
        and session_id in (select session_id from selected_views)
      group by session_id, visit_id
    ), period_visits as (
      select session_id, visit_id, min(first_seen) as first_seen,
        count(*) as pageviews, ${duration} as duration
      from selected_views group by session_id, visit_id
    ), bucket_visits as (
      select bucket, session_id, visit_id, min(first_seen) as first_seen,
        count(*) as pageviews, ${duration} as duration
      from selected_views group by bucket, session_id, visit_id
    )
    select ${isClickhouse ? 'cast(null as Nullable(Int64))' : 'null::bigint'} as x,
      ${metrics(`v.first_seen >= ${start}`)}
    from period_visits v
    join full_visits a on a.session_id = v.session_id and a.visit_id = v.visit_id
    union all
    select v.bucket as x, ${metrics(`${bucket('v.first_seen')} = v.bucket`)}
    from bucket_visits v
    join full_visits a on a.session_id = v.session_id and a.visit_id = v.visit_id
    group by v.bucket
    order by x`,
    { ...queryParams, trafficTimezone: timezone },
    'getTrafficReport',
  );
}
