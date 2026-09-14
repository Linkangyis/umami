import { afterEach, expect, test, vi } from 'vitest';
import { saveEvent } from './saveEvent';

const { insert } = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock('@/lib/db', () => ({
  PRISMA: 'prisma',
  CLICKHOUSE: 'clickhouse',
  runQuery: queries => queries.clickhouse(),
}));
vi.mock('@/lib/clickhouse', () => ({
  default: { insert, getUTCString: () => '2026-01-01 00:00:00' },
}));
vi.mock('@/lib/prisma', () => ({ default: {} }));
vi.mock('@/lib/kafka', () => ({ default: { enabled: false } }));
vi.mock('./saveEventData', () => ({ saveEventData: vi.fn() }));
vi.mock('./saveRevenue', () => ({ saveRevenue: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  insert.mockClear();
});

test('ClickHouse stores canonical IP on the raw event record', async () => {
  await saveEvent({
    websiteId: 'site',
    sessionId: 'session',
    visitId: 'visit',
    eventType: 1,
    urlPath: '/',
    ip: '::ffff:203.0.113.8',
  });
  expect(insert).toHaveBeenCalledWith('website_event', [
    expect.objectContaining({ ip: '203.0.113.8', session_id: 'session' }),
  ]);
});

test('ClickHouse writes an empty IP when storage is disabled', async () => {
  vi.stubEnv('DISABLE_IP_STORAGE', 'true');
  await saveEvent({
    websiteId: 'site',
    sessionId: 'session',
    visitId: 'visit',
    eventType: 1,
    urlPath: '/',
    ip: '203.0.113.8',
  });
  expect(insert).toHaveBeenCalledWith('website_event', [expect.objectContaining({ ip: '' })]);
});
