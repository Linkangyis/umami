export interface EngagementMetrics {
  visitors: number;
  pageviews: number;
  visits: number;
  bounces: number;
  /** Sum of first-to-last pageview durations, in whole seconds. */
  totaltime: number;
  /** All ratios in this response range from 0 to 1. */
  bounceRate: number;
  pagesPerVisit: number;
  avgDuration: number;
  visitorRatio: number;
}

export interface EngagementBucket {
  id: string;
  min: number;
  /** Inclusive upper bound; null means no upper bound. */
  max: number | null;
  visitors: number;
  visits: number;
  pageviews: number;
  visitorRatio: number;
  visitRatio: number;
  pageviewRatio: number;
}

export interface EngagementResult {
  summary: Record<'all' | 'new' | 'returning', EngagementMetrics>;
  distributions: Record<'duration' | 'depth' | 'frequency', EngagementBucket[]>;
  metadata: {
    identity: 'session';
    saltRotation: string;
    newVisitorDefinition: 'first-seen-in-period';
    filterScope: 'matching-visits';
    durationBasis: 'first-to-last-pageview';
  };
}
