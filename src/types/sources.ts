export const SOURCE_VIEWS = ['channels', 'domains', 'urls', 'engines', 'keywords'] as const;
export type SourceView = (typeof SOURCE_VIEWS)[number];
export const SOURCE_SORT_FIELDS = [
  'name',
  'engine',
  'pageviews',
  'visitors',
  'visits',
  'newVisitors',
  'ips',
  'bounceRate',
  'pagesPerVisit',
  'averageDuration',
] as const;
export type SourceSort = (typeof SOURCE_SORT_FIELDS)[number];

export interface SourceMetrics {
  pageviews: number;
  visitors: number;
  visits: number;
  newVisitors: number;
  bounces: number;
  totalTime: number;
  bounceRate: number;
  pagesPerVisit: number;
  averageDuration: number;
  /** Null means no recorded IPs; never substitute visitor counts. */
  ips: number | null;
  ipVisits: number;
  missingIpVisits: number;
  ipCoverage: number;
}
export interface SourceRow extends SourceMetrics {
  id: string;
  name: string;
  engine: string;
  keywordStatus: 'available' | 'unavailable' | 'not-search';
}
export interface SourceReport {
  summary: SourceMetrics;
  viewSummary: SourceMetrics;
  rows: SourceRow[];
  /** Complete engine cells for the keyword rows on the current matrix page. */
  matrixCells: SourceRow[];
  totalRows: number;
  page: number;
  pageSize: number;
  view: SourceView;
  metadata: {
    attribution: 'first-recorded-pageview-per-visit';
    filterScope: 'matching-visits';
    metricScope: 'in-period-pageviews';
    bounceScope: 'whole-recorded-visit';
    keywordEncoding: 'utf-8';
    rawIpsExposed: false;
  };
}
