import { expect, test, vi } from 'vitest';
import { getRealtimeData } from './getRealtimeData';

const { activity } = vi.hoisted(() => ({ activity: vi.fn() }));
vi.mock('@/queries/sql/getRealtimeActivity', () => ({ getRealtimeActivity: activity }));
vi.mock('@/queries/sql/pageviews/getPageviewStats', () => ({ getPageviewStats: async () => [] }));
vi.mock('@/queries/sql/sessions/getSessionStats', () => ({ getSessionStats: async () => [] }));

test('realtime regional counts use the same distinct visitor sample as country counts', async () => {
  activity.mockResolvedValue([
    { sessionId: 'one', country: 'US', region: 'CA', urlPath: '/a' },
    { sessionId: 'one', country: 'US', region: 'CA', urlPath: '/b' },
    { sessionId: 'two', country: 'CN', region: 'CN-GD', urlPath: '/a' },
    { sessionId: 'three', country: 'US', region: null, urlPath: '/' },
  ]);
  const data = await getRealtimeData('site', {});
  expect(data.countries).toEqual({ US: 2, CN: 1 });
  expect(data.regions).toEqual({ 'US-CA': 1, 'CN-GD': 1 });
});
