import clickhouse from '@/lib/clickhouse';
import { EVENT_TYPE, FILTER_COLUMNS } from '@/lib/constants';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';
import type { IpAnalyticsOptions, IpAnalyticsResult } from '@/types/ipAnalytics';

export async function getIpAnalytics(
  websiteId: string,
  filters: QueryFilters,
  options: IpAnalyticsOptions = {},
): Promise<IpAnalyticsResult> {
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.max(1, Math.min(10000, options.pageSize || 25));
  const orderBy =
    {
      pageviews: 'pageviews',
      visitors: 'visitors',
      visits: 'visits',
      lastSeen: 'last_seen',
      ip: 'ip',
    }[options.orderBy || 'pageviews'] || 'pageviews';
  const query = async (ch: boolean) => {
    const parsed = ch
      ? clickhouse.parseFilters(
          { ...filters, websiteId },
          {
            columns: Object.fromEntries(
              Object.entries(FILTER_COLUMNS).map(([key, value]) => [key, `website_event.${value}`]),
            ),
          },
        )
      : prisma.parseFilters({ ...filters, websiteId });
    const { filterQuery, cohortQuery, queryParams } = parsed;
    const website = ch ? '{websiteId:UUID}' : '{{websiteId::uuid}}';
    const start = ch ? '{startDate:DateTime64}' : '{{startDate}}';
    const end = ch ? '{endDate:DateTime64}' : '{{endDate}}';
    const search = ch ? '{ipSearch:String}' : '{{ipSearch}}';
    const uniq = (field: string) => (ch ? `uniqExact(${field})` : `count(distinct ${field})`);
    const sql = `with matched as (
      select distinct website_event.session_id, website_event.visit_id
      from website_event
      ${ch ? '' : (parsed as ReturnType<typeof prisma.parseFilters>).joinSessionQuery}
      ${cohortQuery}
      where website_event.website_id = ${website}
        and website_event.created_at between ${start} and ${end}
        and website_event.event_type in (${EVENT_TYPE.pageView}, ${EVENT_TYPE.customEvent})
        ${filterQuery}
    ), visit_totals as (
      select website_event.session_id as session_id, website_event.visit_id as visit_id,
        ${
          ch
            ? "argMaxIf(coalesce(website_event.ip, ''), website_event.created_at, coalesce(website_event.ip, '') != '')"
            : "coalesce(max(session.ip), '')"
        } as ip,
        sum(case when website_event.event_type = ${EVENT_TYPE.pageView} then 1 else 0 end) as pageviews,
        sum(case when website_event.event_type = ${EVENT_TYPE.customEvent} then 1 else 0 end) as custom_events,
        ${ch ? 'toUnixTimestamp(max(website_event.created_at))' : 'floor(extract(epoch from max(website_event.created_at)))'} as last_seen
      from website_event
      inner join matched on matched.session_id = website_event.session_id and matched.visit_id = website_event.visit_id
      ${ch ? '' : 'inner join session on session.session_id = website_event.session_id and session.website_id = website_event.website_id'}
      where website_event.website_id = ${website}
        and website_event.created_at between ${start} and ${end}
        and website_event.event_type in (${EVENT_TYPE.pageView}, ${EVENT_TYPE.customEvent})
      group by website_event.session_id, website_event.visit_id
      having sum(case when website_event.event_type = ${EVENT_TYPE.pageView} then 1 else 0 end) > 0
    ), visits as (
      select * from visit_totals
      ${filters.excludeBounce ? 'where not (pageviews = 1 and custom_events = 0)' : ''}
    ), addresses as (
      select ip, ${uniq('session_id')} as visitors, count(*) as visits,
        sum(pageviews) as pageviews, max(last_seen) as last_seen
      from visits where ip != '' group by ip
    ), found as (
      select * from addresses
      where ${ch ? `positionCaseInsensitive(ip, ${search}) > 0` : `position(lower(${search}) in lower(ip)) > 0`}
    ), paged as (
      select * from found order by ${orderBy} ${options.descending === false ? 'asc' : 'desc'}, ip asc
      limit ${pageSize} offset ${(page - 1) * pageSize}
    )
    select * from (
    select 'summary' as section, '' as ip, ${uniq('session_id')} as visitors, count(*) as visits,
      coalesce(sum(pageviews), 0) as pageviews, 0 as last_seen,
      coalesce(sum(case when ip != '' then 1 else 0 end), 0) as covered_visits,
      (select count(*) from addresses) as addresses, (select count(*) from found) as found_count
    from visits
    union all
    select 'row' as section, ip, visitors, visits, pageviews, last_seen,
      0 as covered_visits, 0 as addresses, 0 as found_count from paged
    ) ip_report order by section desc, ${orderBy} ${options.descending === false ? 'asc' : 'desc'}, ip asc`;
    const params = { ...queryParams, ipSearch: options.search?.trim() || '' };
    return ch
      ? clickhouse.rawQuery(sql, params, 'getIpAnalytics')
      : prisma.rawQuery(sql, params, 'getIpAnalytics');
  };
  const rows = await runQuery({ [PRISMA]: () => query(false), [CLICKHOUSE]: () => query(true) });
  const summary = rows.find(row => row.section === 'summary') || {};
  const data = rows
    .filter(row => row.section === 'row')
    .map(row => ({
      id: row.ip,
      ip: row.ip,
      visitors: Number(row.visitors),
      visits: Number(row.visits),
      pageviews: Number(row.pageviews),
      lastSeen: Number(row.last_seen) * 1000,
    }));
  return {
    data,
    count: Number(summary.found_count || 0),
    page,
    pageSize,
    summary: {
      addresses: Number(summary.addresses || 0),
      visitors: Number(summary.visitors || 0),
      visits: Number(summary.visits || 0),
      pageviews: Number(summary.pageviews || 0),
      coveredVisits: Number(summary.covered_visits || 0),
      missingVisits: Number(summary.visits || 0) - Number(summary.covered_visits || 0),
    },
  };
}
