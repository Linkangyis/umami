import clickhouse from '@/lib/clickhouse';
import {
  CONTENT_SORT_FIELDS,
  type ContentGroupDefinition,
  type ContentMetrics,
  type ContentMode,
  type ContentReport,
  type ContentSortField,
  contentMetrics,
} from '@/lib/content-report';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';

export interface ContentReportOptions {
  mode: ContentMode;
  page?: number;
  pageSize?: number;
  search?: string;
  orderBy?: ContentSortField;
  sortDescending?: boolean;
  detail?: string;
  groups?: ContentGroupDefinition[];
}
interface RawContentRow extends Partial<ContentMetrics> {
  section: 'summary' | 'row' | 'source';
  name: string;
  total: number | string | bigint;
}

export async function getContentReport(
  websiteId: string,
  filters: QueryFilters,
  options: ContentReportOptions,
): Promise<Omit<ContentReport, 'canManageGroups'>> {
  const { mode, page = 1, pageSize = 50, groups = [] } = options;
  const records: RawContentRow[] = await runQuery({
    [PRISMA]: () => queryContent(websiteId, filters, options, false),
    [CLICKHOUSE]: () => queryContent(websiteId, filters, options, true),
  });
  const summary = records.find(row => row.section === 'summary');
  const names = new Map(groups.map(group => [group.id, group.name]));
  return {
    summary: contentMetrics(summary),
    rows: records
      .filter(row => row.section === 'row')
      .map(row => ({
        ...contentMetrics(row),
        key: row.name,
        name: mode === 'group' ? names.get(row.name) || row.name : row.name,
      })),
    sources: records
      .filter(row => row.section === 'source')
      .map(row => ({
        ...contentMetrics(row),
        name: row.name,
        contribution: Number(row.total) ? (Number(row.entrances) / Number(row.total)) * 100 : 0,
      })),
    count: Number(summary?.total) || 0,
    page,
    pageSize,
    mode,
    groupCount: groups.length,
  };
}

async function queryContent(
  websiteId: string,
  filters: QueryFilters,
  options: ContentReportOptions,
  ch: boolean,
) {
  const {
    mode,
    page = 1,
    pageSize = 50,
    groups = [],
    orderBy = 'pageviews',
    sortDescending = true,
    search = '',
    detail,
  } = options;
  if (!CONTENT_SORT_FIELDS.includes(orderBy)) throw new Error('Invalid content sort field');
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new Error('Invalid content pagination');
  const database = ch ? clickhouse : prisma;
  const parsed = database.parseFilters({ ...filters, websiteId });
  const { filterQuery, cohortQuery, excludeBounceQuery, queryParams } = parsed;
  const joinSessionQuery = 'joinSessionQuery' in parsed ? parsed.joinSessionQuery : '';
  const site = ch ? '{websiteId:UUID}' : '{{websiteId::uuid}}';
  const start = ch ? '{startDate:DateTime64}' : '{{startDate}}';
  const end = ch ? '{endDate:DateTime64}' : '{{endDate}}';
  const parameter = (key: string) => (ch ? `{${key}:String}` : `{{${key}}}`);
  const concat = (...parts: string[]) => `concat(${parts.join(', ')})`;
  const normalizedHost = `lower(coalesce(website_event.hostname, ''))`;
  const route = ch
    ? `concat(splitByChar('#', url_path)[1], if(coalesce(url_query, '') != '', concat('?', url_query), ''), if(position(url_path, '#') > 0, substring(url_path, position(url_path, '#')), ''))`
    : `concat(split_part(url_path, '#', 1), case when coalesce(url_query, '') != '' then concat('?', url_query) else '' end, case when strpos(url_path, '#') > 0 then substring(url_path from strpos(url_path, '#')) else '' end)`;
  const unique = (field: string) => (ch ? `uniqExact(${field})` : `count(distinct ${field})`);
  const uniqueIf = (field: string, condition: string) =>
    ch
      ? `uniqExactIf(${field}, ${condition})`
      : `count(distinct case when ${condition} then ${field} end)`;
  const visit = ch ? 'tuple(session_id, visit_id)' : '(session_id, visit_id)';
  const matchVisits = ch
    ? `tuple(website_event.session_id, website_event.visit_id) in (select session_id, visit_id from matched)`
    : `exists (select 1 from matched where matched.session_id = website_event.session_id and matched.visit_id = website_event.visit_id)`;
  const next = ch ? 'leadInFrame(toNullable(created_at))' : 'lead(created_at)';
  const dwell = ch
    ? `dateDiff('millisecond', created_at, next_at) / 1000.0`
    : `extract(epoch from (next_at - created_at))`;
  const groupParams: Record<string, string> = {};
  let item =
    mode === 'path'
      ? 'url_path'
      : mode === 'title'
        ? "coalesce(page_title, '')"
        : mode === 'hostname'
          ? 'hostname'
          : 'full_url';
  let groupJoin = '';
  let groupCondition = '';
  if (mode === 'group') {
    if (!groups.length) groupCondition = 'where 1 = 0';
    else {
      groupJoin = `cross join (${groups
        .map((group, i) => {
          groupParams[`group${i}`] = group.id;
          return `select ${parameter(`group${i}`)} as group_id`;
        })
        .join(' union all ')}) content_groups`;
      const matches = groups.map((group, i) => {
        const rules = group.rules.map((rule, r) => {
          const key = `rule${i}_${r}`;
          groupParams[key] = rule.value;
          const field = { route: 'route', path: 'url_path', hostname: 'hostname' }[rule.field];
          const value = parameter(key);
          if (rule.operator === 'exact') return `${field} = ${value}`;
          if (rule.operator === 'prefix')
            return ch
              ? `startsWith(${field}, ${value})`
              : `left(${field}, length(${value})) = ${value}`;
          return ch ? `position(${field}, ${value}) > 0` : `strpos(${field}, ${value}) > 0`;
        });
        return `(content_groups.group_id = ${parameter(`group${i}`)} and (${rules.join(' or ') || '1 = 0'}))`;
      });
      groupCondition = `where ${matches.join(' or ')}`;
      item = 'content_groups.group_id';
    }
  }
  const aggregate = `count(*) as "pageviews",
    ${unique('session_id')} as "visitors",
    ${unique(visit)} as "visits",
    ${uniqueIf('session_id', `first_seen >= ${start}`)} as "newVisitors",
    sum(case when entry_rank = 1 then 1 else 0 end) as "entrances",
    sum(case when exit_rank = 1 then 1 else 0 end) as "exits",
    sum(case when entry_rank = 1 and visit_views = 1 and custom_events = 0 then 1 else 0 end) as "bounces",
    sum(case when next_at is not null then 1 else 0 end) as "dwellSamples",
    coalesce(sum(case when next_at is not null then ${dwell} else 0 end), 0) as "dwellSeconds"`;
  const numericColumns =
    '"pageviews", "visitors", "visits", "newVisitors", "entrances", "exits", "bounces", "dwellSamples", "dwellSeconds"';
  const searchableName =
    mode === 'group' && groups.length > 0
      ? `case ${groups
          .map((group, i) => {
            groupParams[`name${i}`] = group.name;
            return `when name = ${parameter(`group${i}`)} then ${parameter(`name${i}`)}`;
          })
          .join(' ')} else name end`
      : 'name';
  const searchCondition = !search
    ? ''
    : ch
      ? `and positionCaseInsensitive(${searchableName}, {contentSearch:String}) > 0`
      : `and strpos(lower(${searchableName}), lower({{contentSearch}})) > 0`;
  const qualification =
    mode === 'entry' ? 'and "entrances" > 0' : mode === 'exit' ? 'and "exits" > 0' : '';
  const sort =
    {
      name: searchableName,
      exitRate: '"exits" * 1.0 / nullif("pageviews", 0)',
      averageDwell: '"dwellSeconds" / nullif("dwellSamples", 0)',
      bounceRate: '"bounces" * 1.0 / nullif("entrances", 0)',
    }[orderBy] || `"${orderBy}"`;
  return database.rawQuery(
    `with matched as (
      select website_event.event_id, website_event.session_id, website_event.visit_id
      from website_event ${cohortQuery} ${excludeBounceQuery} ${joinSessionQuery}
      where website_event.website_id = ${site}
        and website_event.created_at between ${start} and ${end}
        and website_event.event_type = 1 ${filterQuery}
    ), visit_pages as (
      select website_event.event_id, website_event.session_id, website_event.visit_id,
        website_event.created_at, website_event.url_path, website_event.url_query,
        website_event.page_title, ${normalizedHost} as hostname,
        coalesce(website_event.referrer_domain, '') as source,
        ${route} as route
      from website_event
      where website_event.website_id = ${site} and website_event.event_type = 1 and ${matchVisits}
    ), sequenced as (
      select *, ${concat('hostname', 'route')} as full_url,
        row_number() over (partition by session_id, visit_id order by created_at, event_id) as entry_rank,
        row_number() over (partition by session_id, visit_id order by created_at desc, event_id desc) as exit_rank,
        ${next} over (partition by session_id, visit_id order by created_at, event_id rows between unbounded preceding and unbounded following) as next_at
      from visit_pages
    ), totals as (
      select website_event.session_id, website_event.visit_id,
        sum(case when event_type = 1 then 1 else 0 end) as visit_views,
        sum(case when event_type = 2 then 1 else 0 end) as custom_events
      from website_event where website_id = ${site} and ${matchVisits}
      group by website_event.session_id, website_event.visit_id
    ), first_seen as (
      select session_id, min(created_at) as first_seen from website_event
      where website_id = ${site} and event_type = 1
        and session_id in (select session_id from matched)
      group by session_id
    ), filtered as (
      select s.*, t.visit_views, t.custom_events, f.first_seen
      from sequenced s join totals t on t.session_id = s.session_id and t.visit_id = s.visit_id
      join first_seen f on f.session_id = s.session_id
      where s.event_id in (select event_id from matched)
    ), items as (
      select filtered.*, ${item} as name from filtered ${groupJoin} ${groupCondition}
    ), grouped as (
      select name, ${aggregate} from items group by name
    ), eligible as (
      select * from grouped where 1 = 1 ${qualification} ${searchCondition}
    ), summary_views as (
      select distinct event_id, session_id, visit_id, created_at, next_at, first_seen,
        entry_rank, exit_rank, visit_views, custom_events
      from items where name in (select name from eligible)
    ), source_views as (
      select distinct event_id, session_id, visit_id, created_at, next_at, first_seen,
        entry_rank, exit_rank, visit_views, custom_events, source
      from items where entry_rank = 1 and name in (select name from eligible)
        ${detail !== undefined ? `and name = ${parameter('contentDetail')}` : ''}
    ), source_groups as (
      select source as name, ${aggregate} from source_views group by source
    ), result_rows as (
      select * from eligible order by ${sort} ${sortDescending ? 'desc' : 'asc'} nulls last, name asc
      limit ${pageSize} offset ${(page - 1) * pageSize}
    ), result_sources as (
      select *, sum("entrances") over () as total from source_groups order by "entrances" desc, name asc limit 50
    )
    select 'summary' as section, '' as name, ${aggregate}, (select count(*) from eligible) as total from summary_views
    union all select 'row' as section, name, ${numericColumns}, 0 as total from result_rows
    union all select 'source' as section, name, ${numericColumns}, total from result_sources`,
    { ...queryParams, ...groupParams, contentSearch: search, contentDetail: detail || '' },
    'getContentReport',
  );
}
