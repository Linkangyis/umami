export interface IpAnalyticsRow {
  id: string;
  ip: string;
  visitors: number;
  visits: number;
  pageviews: number;
  lastSeen: number;
}

export interface IpAnalyticsResult {
  data: IpAnalyticsRow[];
  count: number;
  page: number;
  pageSize: number;
  summary: {
    addresses: number;
    visitors: number;
    visits: number;
    pageviews: number;
    coveredVisits: number;
    missingVisits: number;
  };
}

export interface IpAnalyticsOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  orderBy?: 'pageviews' | 'visitors' | 'visits' | 'lastSeen' | 'ip';
  descending?: boolean;
}
