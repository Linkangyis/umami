import clickhouse from '@/lib/clickhouse';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';
import {
  sourceCategorySQL,
  sourceEngineSQL,
  sourceHostSQL,
  sourceKeywordCleanSQL,
  sourceKeywordDecodeSQL,
  sourceKeywordRawSQL,
} from '@/lib/source-classification';
import type { QueryFilters } from '@/lib/types';
import type { SourceMetrics, SourceReport, SourceSort, SourceView } from '@/types/sources';

export interface SourceOptions {
  view: SourceView;
  page: number;
  pageSize: number;
  sort: SourceSort;
  direction: 'asc' | 'desc';
  search?: string;
  category?: string;
  engine?: string;
  keywordStatus?: 'all' | 'available' | 'unavailable';
  excludeDomains?: string[];
  excludeKeywords?: string[];
  matrix?: boolean;
}

export async function getSourceReport(
  websiteId: string,
  options: SourceOptions,
  filters: QueryFilters,
): Promise<SourceReport> {
  const records = await runQuery({
    [PRISMA]: () => querySources(websiteId, options, filters, false),
    [CLICKHOUSE]: () => querySources(websiteId, options, filters, true),
  });
  return {
    summary: metrics(records.find(row => row.section === 'summary')),
    viewSummary: metrics(records.find(row => row.section === 'view-summary')),
    rows: records
      .filter(row => row.section === 'row')
      .map(row => ({
        ...metrics(row),
        id: JSON.stringify([row.name, row.engine, row.keyword_status]),
        name: row.name,
        engine: row.engine,
        keywordStatus: row.keyword_status,
      })),
    matrixCells: records
      .filter(row => row.section === 'cell')
      .map(row => ({
        ...metrics(row),
        id: JSON.stringify([row.name, row.engine, row.keyword_status]),
        name: row.name,
        engine: row.engine,
        keywordStatus: row.keyword_status,
      })),
    totalRows: Number(records.find(row => row.section === 'count')?.total_rows || 0),
    view: options.view,
    page: options.page,
    pageSize: options.pageSize,
    metadata: {
      attribution: 'first-recorded-pageview-per-visit',
      filterScope: 'matching-visits',
      metricScope: 'in-period-pageviews',
      bounceScope: 'whole-recorded-visit',
      keywordEncoding: 'utf-8',
      rawIpsExposed: false,
    },
  };
}

function metrics(row: Record<string, unknown> = {}): SourceMetrics {
  const number = (name: string) => Math.max(0, Number(row[name]) || 0);
  const pageviews = number('pageviews');
  const visits = number('visits');
  const bounces = number('bounces');
  const totalTime = number('totalTime');
  const ipVisits = number('ipVisits');
  return {
    pageviews,
    visitors: number('visitors'),
    visits,
    newVisitors: number('newVisitors'),
    bounces,
    totalTime,
    bounceRate: visits ? bounces / visits : 0,
    pagesPerVisit: visits ? pageviews / visits : 0,
    averageDuration: visits ? totalTime / visits : 0,
    ips: ipVisits ? number('ips') : null,
    ipVisits,
    missingIpVisits: visits - ipVisits,
    ipCoverage: visits ? ipVisits / visits : 0,
  };
}

async function querySources(
  websiteId: string,
  options: SourceOptions,
  filters: QueryFilters,
  ch: boolean,
) {
  const db = ch ? clickhouse : prisma;
  const parsed = db.parseFilters({ ...filters, websiteId });
  const joinSession = 'joinSessionQuery' in parsed ? parsed.joinSessionQuery : '';
  const website = ch ? '{websiteId:UUID}' : '{{websiteId::uuid}}';
  const start = ch ? '{startDate:DateTime64}' : '{{startDate}}';
  const end = ch ? '{endDate:DateTime64}' : '{{endDate}}';
  const empty = (value: string) => `coalesce(${value}, '')`;
  const rawHost = sourceHostSQL('entry.referrer_domain', ch);
  const siteHost = sourceHostSQL('entry.hostname', ch);
  const duration = ch
    ? `dateDiff('second', minIf(website_event.created_at, website_event.event_type = 1), maxIf(website_event.created_at, website_event.event_type = 1))`
    : `floor(extract(epoch from (max(case when website_event.event_type = 1 then website_event.created_at end) - min(case when website_event.event_type = 1 then website_event.created_at end))))`;
  const unique = (field: string) => (ch ? `uniqExact(${field})` : `count(distinct ${field})`);
  const conditionalUnique = (field: string, condition: string) =>
    ch
      ? `uniqExactIf(${field}, ${condition})`
      : `count(distinct case when ${condition} then ${field} end)`;
  const aggregate = `coalesce(sum(v.pageviews), 0) as "pageviews", ${unique('v.session_id')} as "visitors",
    count(*) as "visits", ${conditionalUnique('v.session_id', 'v.is_new = 1')} as "newVisitors",
    coalesce(sum(v.bounce), 0) as "bounces", coalesce(sum(v.duration), 0) as "totalTime",
    ${conditionalUnique('v.ip', "v.ip != ''")} as "ips", coalesce(sum(case when v.ip != '' then 1 else 0 end), 0) as "ipVisits"`;
  const rowName = {
    channels: 'v.category',
    domains: 'v.source_host',
    urls: 'v.source_url',
    engines: 'v.engine',
    keywords: 'v.keyword',
  }[options.view];
  const rowEngine = ['engines', 'keywords', 'urls'].includes(options.view) ? 'v.engine' : "''";
  const rowStatus =
    options.view === 'keywords'
      ? "case when v.keyword = '' then 'unavailable' else 'available' end"
      : "'not-search'";
  const viewCondition = ['engines', 'keywords'].includes(options.view)
    ? "v.engine != ''"
    : options.view === 'urls'
      ? "v.source_host != '' and v.engine = '' and v.category != 'search'"
      : options.view === 'domains'
        ? "v.source_host != ''"
        : '1 = 1';
  const excludeDomains = options.excludeDomains || [];
  const excludeKeywords = options.excludeKeywords || [];
  const exclusions = [
    filters.excludeBounce && 'bounce = 0',
    options.category && `category = ${ch ? '{sourceCategory:String}' : '{{sourceCategory}}'}`,
    options.engine && `engine = ${ch ? '{sourceEngine:String}' : '{{sourceEngine}}'}`,
    options.keywordStatus === 'available' && "engine != '' and keyword != ''",
    options.keywordStatus === 'unavailable' && "engine != '' and keyword = ''",
    excludeDomains.length &&
      (ch
        ? 'source_host not in {excludeDomains:Array(String)}'
        : 'source_host != all({{excludeDomains}}::text[])'),
    excludeKeywords.length &&
      (ch
        ? 'keyword not in {excludeKeywords:Array(String)}'
        : 'keyword != all({{excludeKeywords}}::text[])'),
  ]
    .filter(Boolean)
    .map(value => `and (${value})`)
    .join('\n');
  const search = options.search
    ? ch
      ? "where positionCaseInsensitiveUTF8(concat(name, ' ', engine), {sourceSearch:String}) > 0"
      : "where (name || ' ' || engine) ilike {{sourceSearch}}"
    : '';
  const ratio = (numerator: string) =>
    `coalesce(1.0 * ${numerator} / ${ch ? 'nullIf' : 'nullif'}(visits, 0), 0)`;
  const sort =
    {
      name: 'name',
      engine: 'engine',
      pageviews: 'pageviews',
      visitors: 'visitors',
      visits: 'visits',
      newVisitors: '"newVisitors"',
      ips: 'ips',
      bounceRate: ratio('bounces'),
      pagesPerVisit: ratio('pageviews'),
      averageDuration: ratio('"totalTime"'),
    }[options.sort] || 'visitors';
  const direction = options.direction === 'asc' ? 'asc' : 'desc';
  const limit = Math.min(100, Math.max(1, Math.floor(options.pageSize)));
  const offset = Math.max(0, Math.floor(options.page - 1)) * limit;
  const zeroMetrics =
    '0 as "pageviews", 0 as "visitors", 0 as "visits", 0 as "newVisitors", 0 as "bounces", 0 as "totalTime", 0 as "ips", 0 as "ipVisits"';

  const matrix = options.view === 'keywords' && options.matrix;
  const selectMetrics =
    '"pageviews", "visitors", "visits", "newVisitors", "bounces", "totalTime", "ips", "ipVisits"';
  return db.rawQuery(
    `with matching_visits as (
      select distinct website_event.session_id, website_event.visit_id
      from website_event
      ${parsed.cohortQuery}
      ${joinSession}
      where website_event.website_id = ${website}
        and website_event.created_at between ${start} and ${end}
        and website_event.event_type in (1, 2)
        ${parsed.filterQuery}
    ), period_visits as (
      select website_event.session_id as session_id, website_event.visit_id as visit_id,
        sum(case when website_event.event_type = 1 then 1 else 0 end) as pageviews,
        ${duration} as duration,
        ${ch ? "argMaxIf(website_event.ip, website_event.created_at, website_event.ip != '')" : "coalesce(max(source_session.ip), '')"} as ip
      from website_event
      inner join matching_visits m on m.session_id = website_event.session_id and m.visit_id = website_event.visit_id
      ${ch ? '' : 'left join session source_session on source_session.website_id = website_event.website_id and source_session.session_id = website_event.session_id'}
      where website_event.website_id = ${website}
        and website_event.created_at between ${start} and ${end}
        and website_event.event_type in (1, 2)
      group by website_event.session_id, website_event.visit_id
      having sum(case when website_event.event_type = 1 then 1 else 0 end) > 0
    ), whole_visits as (
      select website_event.session_id as session_id, website_event.visit_id as visit_id,
        sum(case when website_event.event_type = 1 then 1 else 0 end) as pageviews,
        sum(case when website_event.event_type = 2 then 1 else 0 end) as custom_events
      from website_event
      inner join period_visits p on p.session_id = website_event.session_id and p.visit_id = website_event.visit_id
      where website_event.website_id = ${website} and website_event.event_type in (1, 2)
      group by website_event.session_id, website_event.visit_id
    ), entry_ranked as (
      select website_event.session_id as session_id, website_event.visit_id as visit_id,
        website_event.referrer_domain, website_event.referrer_path, website_event.referrer_query,
        website_event.hostname, website_event.utm_medium, website_event.utm_source, website_event.utm_campaign,
        case when ${['gclid', 'msclkid', 'ttclid', 'li_fat_id', 'twclid'].map(field => `${empty(`website_event.${field}`)} != ''`).join(' or ')} then 1 else 0 end as paid_click,
        row_number() over (partition by website_event.session_id, website_event.visit_id order by website_event.created_at, website_event.event_id) as entry_number
      from website_event
      inner join period_visits p on p.session_id = website_event.session_id and p.visit_id = website_event.visit_id
      where website_event.website_id = ${website} and website_event.event_type = 1
    ), first_seen as (
      select session_id, min(created_at) as first_seen from website_event
      where website_id = ${website} and event_type = 1
        and session_id in (select session_id from period_visits)
      group by session_id
    ), attributed as (
      select p.session_id, p.visit_id, p.pageviews, p.duration, p.ip,
        case when a.pageviews = 1 and a.custom_events = 0 then 1 else 0 end as bounce,
        case when f.first_seen >= ${start} then 1 else 0 end as is_new,
        case when ${rawHost} = ${siteHost} then '' else ${rawHost} end as source_host,
        ${empty('entry.referrer_path')} as referrer_path, ${empty('entry.referrer_query')} as referrer_query,
        ${empty('entry.utm_medium')} as utm_medium, ${empty('entry.utm_source')} as utm_source, ${empty('entry.utm_campaign')} as utm_campaign, entry.paid_click
      from period_visits p
      inner join whole_visits a on a.session_id = p.session_id and a.visit_id = p.visit_id
      inner join entry_ranked entry on entry.session_id = p.session_id and entry.visit_id = p.visit_id and entry.entry_number = 1
      inner join first_seen f on f.session_id = p.session_id
    ), engines as (
      select a.*, ${sourceEngineSQL('a.source_host')} as engine,
        case when a.source_host = '' then '' else concat(a.source_host, case when a.referrer_path = '' then '/' else a.referrer_path end, case when a.referrer_query = '' then '' else concat('?', a.referrer_query) end) end as source_url
      from attributed a
    ), raw_keywords as (
      select e.*, ${sourceCategorySQL({ host: 'e.source_host', engine: 'e.engine', medium: 'e.utm_medium', source: 'e.utm_source', campaign: 'e.utm_campaign', paid: 'e.paid_click = 1' })} as category,
        ${sourceKeywordRawSQL('e.engine', 'e.referrer_query', ch)} as raw_keyword from engines e
    ), decoded as (
      select r.*, ${sourceKeywordDecodeSQL('r.raw_keyword', ch)} as decoded_keyword from raw_keywords r
    ), classified as (
      select d.*, ${sourceKeywordCleanSQL('d.decoded_keyword', ch)} as keyword from decoded d
    ), eligible as (
      select * from classified where 1 = 1 ${exclusions}
    ), view_values as (
      select v.*, ${rowName} as name, ${rowEngine} as group_engine, ${rowStatus} as keyword_status
      from eligible v where ${viewCondition}
    ), searched as (
      select * from view_values ${search}
    ), grouped as (
      select v.name as name, v.group_engine as engine, v.keyword_status as keyword_status,
        ${aggregate}
      from searched v group by v.name, v.group_engine, v.keyword_status
    ), table_rows as (
      ${
        matrix
          ? `select v.name as name, '' as engine, v.keyword_status as keyword_status, ${aggregate}
        from searched v group by v.name, v.keyword_status`
          : 'select * from grouped'
      }
    ), paged as (
      select *, row_number() over (order by ${sort} ${direction}, name asc, engine asc) as row_order
      from table_rows order by ${sort} ${direction}, name asc, engine asc
      limit ${limit} offset ${offset}
    )
    select 'summary' as section, '' as name, '' as engine, 'not-search' as keyword_status, ${aggregate}, 0 as total_rows, 0 as row_order from eligible v
    union all
    select 'view-summary' as section, '' as name, '' as engine, 'not-search' as keyword_status, ${aggregate}, 0 as total_rows, 0 as row_order from searched v
    union all
    select 'count' as section, '' as name, '' as engine, 'not-search' as keyword_status, ${zeroMetrics}, count(*) as total_rows, 0 as row_order from table_rows
    union all
    select 'row' as section, name, engine, keyword_status, ${selectMetrics}, 0 as total_rows, row_order from paged
    ${
      matrix
        ? `union all select 'cell' as section, g.name, g.engine, g.keyword_status, ${selectMetrics
            .split(', ')
            .map(field => `g.${field}`)
            .join(', ')}, 0 as total_rows, p.row_order
      from grouped g inner join paged p on p.name = g.name and p.keyword_status = g.keyword_status`
        : ''
    }
    order by section, row_order, engine`,
    {
      ...parsed.queryParams,
      sourceCategory: options.category,
      sourceEngine: options.engine,
      sourceSearch: ch ? options.search : `%${options.search?.replace(/[\\%_]/g, '\\$&')}%`,
      excludeDomains,
      excludeKeywords,
    },
    'getSourceReport',
  );
}
