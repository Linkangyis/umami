import { describe, expect, test } from 'vitest';
import {
  fillTrafficRows,
  previousTrafficPeriod,
  trafficBucketDates,
  trafficBucketStart,
  trafficMetrics,
} from './traffic';

describe('traffic periods', () => {
  test('aligns ISO weeks to Monday in the selected timezone across a year boundary', () => {
    expect(trafficBucketStart(new Date('2026-01-01T06:00:00Z'), 'week', 'Asia/Hong_Kong')).toEqual(
      new Date('2025-12-28T16:00:00Z'),
    );
  });

  test('uses calendar month boundaries instead of thirty-day intervals', () => {
    expect(
      trafficBucketDates(
        new Date('2024-01-31T10:00:00Z'),
        new Date('2024-03-02T10:00:00Z'),
        'month',
        'UTC',
      ),
    ).toEqual(['2024-01-01T00:00:00.000Z', '2024-02-01T00:00:00.000Z', '2024-03-01T00:00:00.000Z']);
  });

  test('retains both repeated hours during a daylight-saving rollback', () => {
    expect(
      trafficBucketDates(
        new Date('2025-11-02T04:00:00Z'),
        new Date('2025-11-02T08:00:00Z'),
        'hour',
        'America/New_York',
      ),
    ).toEqual([
      '2025-11-02T04:00:00.000Z',
      '2025-11-02T05:00:00.000Z',
      '2025-11-02T06:00:00.000Z',
      '2025-11-02T07:00:00.000Z',
      '2025-11-02T08:00:00.000Z',
    ]);
  });

  test('daily buckets follow a 23-hour daylight-saving day', () => {
    expect(
      trafficBucketDates(
        new Date('2025-03-08T05:00:00Z'),
        new Date('2025-03-10T12:00:00Z'),
        'day',
        'America/New_York',
      ),
    ).toEqual(['2025-03-08T05:00:00.000Z', '2025-03-09T05:00:00.000Z', '2025-03-10T04:00:00.000Z']);
  });

  test('supports fractional-hour timezones', () => {
    expect(
      trafficBucketStart(new Date('2026-01-01T05:28:59.123Z'), 'hour', 'Asia/Kathmandu'),
    ).toEqual(new Date('2026-01-01T05:15:00Z'));
  });

  test('compares equal inclusive durations without sharing a boundary event', () => {
    const start = new Date('2026-01-02T00:00:00Z');
    const end = new Date('2026-01-02T23:59:59.999Z');
    const previous = previousTrafficPeriod(start, end);
    expect(previous.startDate).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(previous.endDate).toEqual(new Date('2026-01-01T23:59:59.999Z'));
    expect(+previous.endDate - +previous.startDate).toBe(+end - +start);
  });

  test('rejects reversed dates and oversized hourly reports', () => {
    expect(() =>
      trafficBucketDates(new Date('2026-01-02'), new Date('2026-01-01'), 'day', 'UTC'),
    ).toThrow('Invalid date range');
    expect(() =>
      trafficBucketDates(new Date('2020-01-01'), new Date('2026-01-01'), 'hour', 'UTC'),
    ).toThrow('larger interval');
  });
});

test('zero-fills missing rows and derives rates using visits, not visitors', () => {
  const row = trafficMetrics({ pageviews: 12, visitors: 2, visits: 4, bounces: 1, totalTime: 180 });
  expect(row).toMatchObject({ bounceRate: 25, averageDuration: 45, viewsPerVisit: 3 });
  const dates = ['2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'];
  expect(fillTrafficRows(dates, [{ x: dates[1], ...row }])).toEqual([
    { x: dates[0], ...trafficMetrics() },
    { x: dates[1], ...row },
  ]);
  expect(Object.values(trafficMetrics()).every(Number.isFinite)).toBe(true);
});
