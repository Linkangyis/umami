import { z } from 'zod';

export const CONTENT_MODES = [
  'fullUrl',
  'path',
  'title',
  'entry',
  'exit',
  'hostname',
  'group',
] as const;
export type ContentMode = (typeof CONTENT_MODES)[number];
export const CONTENT_SORT_FIELDS = [
  'pageviews',
  'visitors',
  'visits',
  'newVisitors',
  'entrances',
  'exits',
  'exitRate',
  'averageDwell',
  'bounceRate',
  'name',
] as const;
export type ContentSortField = (typeof CONTENT_SORT_FIELDS)[number];

export const contentGroupRuleSchema = z.object({
  field: z.enum(['route', 'path', 'hostname']).default('route'),
  operator: z.enum(['exact', 'prefix', 'contains']),
  value: z.string().min(1).max(1500),
});
export const contentGroupSchema = z.object({
  name: z.string().trim().min(1).max(200),
  rules: z.array(contentGroupRuleSchema).min(1).max(20),
});
export type ContentGroupRule = z.infer<typeof contentGroupRuleSchema>;
export interface ContentGroupDefinition {
  id: string;
  name: string;
  rules: ContentGroupRule[];
}
export interface ContentMetrics {
  pageviews: number;
  visitors: number;
  visits: number;
  newVisitors: number;
  entrances: number;
  exits: number;
  bounces: number;
  dwellSamples: number;
  dwellSeconds: number;
  averageDwell: number | null;
  dwellCoverage: number;
  exitRate: number;
  bounceRate: number;
}
export interface ContentRow extends ContentMetrics {
  key: string;
  name: string;
}
export interface ContentSource extends ContentMetrics {
  name: string;
  contribution: number;
}
export interface ContentReport {
  summary: ContentMetrics;
  rows: ContentRow[];
  sources: ContentSource[];
  count: number;
  page: number;
  pageSize: number;
  mode: ContentMode;
  groupCount: number;
  canManageGroups: boolean;
}

export function contentMetrics(values: Partial<ContentMetrics> = {}): ContentMetrics {
  const number = (key: keyof ContentMetrics) => Math.max(0, Number(values[key]) || 0);
  const pageviews = number('pageviews');
  const entrances = number('entrances');
  const bounces = number('bounces');
  const dwellSamples = number('dwellSamples');
  const dwellSeconds = number('dwellSeconds');
  const exits = number('exits');
  return {
    pageviews,
    visitors: number('visitors'),
    visits: number('visits'),
    newVisitors: number('newVisitors'),
    entrances,
    exits,
    bounces,
    dwellSamples,
    dwellSeconds,
    averageDwell: dwellSamples ? dwellSeconds / dwellSamples : null,
    dwellCoverage: pageviews ? (dwellSamples / pageviews) * 100 : 0,
    exitRate: pageviews ? (exits / pageviews) * 100 : 0,
    bounceRate: entrances ? (bounces / entrances) * 100 : 0,
  };
}

// Query parameters precede the fragment; neither part may be dropped from PHP/hash routes.
export function contentRoute(path: string, query?: string | null): string {
  const index = path.indexOf('#');
  const pathname = index < 0 ? path : path.slice(0, index);
  const fragment = index < 0 ? '' : path.slice(index);
  return `${pathname}${query ? `?${query}` : ''}${fragment}`;
}

export function matchesContentGroup(
  rules: ContentGroupRule[],
  page: { path: string; query?: string | null; hostname?: string | null },
) {
  return rules.some(rule => {
    const value =
      rule.field === 'route'
        ? contentRoute(page.path, page.query)
        : rule.field === 'path'
          ? page.path
          : page.hostname?.toLowerCase() || '';
    if (rule.operator === 'exact') return value === rule.value;
    if (rule.operator === 'prefix') return value.startsWith(rule.value);
    return value.includes(rule.value);
  });
}
