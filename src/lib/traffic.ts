import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const TRAFFIC_UNITS = ['hour', 'day', 'week', 'month'] as const;
export type TrafficUnit = (typeof TRAFFIC_UNITS)[number];
export type TrafficVisitorType = 'all' | 'new' | 'returning';

export interface TrafficMetrics {
  pageviews: number;
  visitors: number;
  newVisitors: number;
  visits: number;
  bounces: number;
  totalTime: number;
  bounceRate: number;
  averageDuration: number;
  viewsPerVisit: number;
}

export interface TrafficRow extends TrafficMetrics {
  x: string;
}

export interface TrafficPeriod {
  summary: TrafficMetrics;
  rows: TrafficRow[];
  startDate: string;
  endDate: string;
}

export interface TrafficReport extends TrafficPeriod {
  unit: TrafficUnit;
  timezone: string;
  comparison?: TrafficPeriod;
}

export function trafficMetrics(values: Partial<TrafficMetrics> = {}): TrafficMetrics {
  const number = (key: keyof TrafficMetrics) => Math.max(0, Number(values[key]) || 0);
  const visits = number('visits');
  const pageviews = number('pageviews');
  const bounces = Math.min(visits, number('bounces'));
  const totalTime = number('totalTime');
  return {
    pageviews,
    visitors: number('visitors'),
    newVisitors: number('newVisitors'),
    visits,
    bounces,
    totalTime,
    bounceRate: visits ? (bounces / visits) * 100 : 0,
    averageDuration: visits ? totalTime / visits : 0,
    viewsPerVisit: visits ? pageviews / visits : 0,
  };
}

// Hours represent real elapsed hours (including both occurrences during a DST rollback).
// Calendar buckets use the selected timezone and ISO weeks beginning on Monday.
export function trafficBucketStart(date: Date, unit: TrafficUnit, timezone: string): Date {
  if (unit === 'hour') {
    const [minutes, seconds] = formatInTimeZone(date, timezone, 'mm:ss.SSS').split(':');
    return new Date(+date - Number(minutes) * 60_000 - Number(seconds) * 1000);
  }
  const calendar = new Date(`${formatInTimeZone(date, timezone, 'yyyy-MM-dd')}T00:00:00Z`);
  if (unit === 'month') calendar.setUTCDate(1);
  if (unit === 'week')
    calendar.setUTCDate(calendar.getUTCDate() - ((calendar.getUTCDay() + 6) % 7));
  return fromZonedTime(calendar.toISOString().slice(0, 19), timezone);
}

export function trafficBucketDates(
  startDate: Date,
  endDate: Date,
  unit: TrafficUnit,
  timezone: string,
): string[] {
  if (!Number.isFinite(+startDate) || !Number.isFinite(+endDate) || endDate < startDate) {
    throw new Error('Invalid date range');
  }
  const dates: string[] = [];
  let current = trafficBucketStart(startDate, unit, timezone);
  while (current <= endDate) {
    if (dates.length >= 10_000) throw new Error('Select a larger interval or a shorter date range');
    dates.push(current.toISOString());
    if (unit === 'hour') {
      current = new Date(+current + 3_600_000);
    } else {
      const calendar = new Date(`${formatInTimeZone(current, timezone, 'yyyy-MM-dd')}T00:00:00Z`);
      if (unit === 'month') calendar.setUTCMonth(calendar.getUTCMonth() + 1);
      else calendar.setUTCDate(calendar.getUTCDate() + (unit === 'week' ? 7 : 1));
      current = fromZonedTime(calendar.toISOString().slice(0, 19), timezone);
    }
  }
  return dates;
}

export function fillTrafficRows(dates: string[], rows: TrafficRow[]): TrafficRow[] {
  const lookup = new Map(rows.map(row => [row.x, row]));
  return dates.map(x => ({ ...trafficMetrics(lookup.get(x)), x }));
}

export function previousTrafficPeriod(startDate: Date, endDate: Date) {
  const duration = +endDate - +startDate + 1;
  return { startDate: new Date(+startDate - duration), endDate: new Date(+startDate - 1) };
}
