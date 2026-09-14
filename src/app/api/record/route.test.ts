import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CACHE_TOKEN_TYPE } from '@/lib/constants';
import { getClientInfo, hasBlockedIp } from '@/lib/detect';
import { parseToken } from '@/lib/jwt';
import { parseRequest } from '@/lib/request';
import { getCollectorWebsite as getWebsite } from '@/queries/prisma/collectorWebsite';
import { hasWebsiteBlockedIp } from '@/queries/prisma/ipRule';
import { saveRecording } from '@/queries/sql';
import { saveHeatmapEvents } from '@/queries/sql/heatmap/saveHeatmapEvents';
import { OPTIONS, POST } from './route';

vi.mock('@/lib/detect', () => ({
  getClientInfo: vi.fn(),
  hasBlockedIp: vi.fn(),
}));
vi.mock('@/queries/prisma/ipRule', () => ({ hasWebsiteBlockedIp: vi.fn() }));
vi.mock('@/queries/prisma/collectorWebsite', () => ({ getCollectorWebsite: vi.fn() }));

vi.mock('@/lib/jwt', () => ({
  parseToken: vi.fn(),
}));

vi.mock('@/lib/request', () => ({
  parseRequest: vi.fn(),
}));

vi.mock('@/queries/prisma', () => ({
  getWebsite: vi.fn(),
}));

vi.mock('@/queries/sql', () => ({
  saveRecording: vi.fn(),
}));

vi.mock('@/queries/sql/heatmap/saveHeatmapEvents', () => ({
  saveHeatmapEvents: vi.fn(),
}));

const parseRequestMock = vi.mocked(parseRequest);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasWebsiteBlockedIp).mockResolvedValue(false);
});

test.each(['record', 'heatmap'])(
  'an inactive website cannot accept cached %s chunks',
  async type => {
    const websiteId = '11111111-1111-4111-8111-111111111111';
    vi.mocked(parseToken).mockResolvedValue({
      type: CACHE_TOKEN_TYPE,
      websiteId,
      sessionId: websiteId,
      visitId: websiteId,
    });
    vi.mocked(getWebsite).mockResolvedValue(null);
    parseRequestMock.mockResolvedValue({
      body: {
        type,
        payload: { website: websiteId, events: [{ type: 'click', url: 'https://example.com/' }] },
      },
    });
    const response = await POST(
      new Request('http://localhost/api/record', {
        method: 'POST',
        headers: { 'x-umami-cache': 'test-cache' },
      }),
    );
    expect(response.status).toBe(400);
    expect(saveRecording).not.toHaveBeenCalled();
    expect(saveHeatmapEvents).not.toHaveBeenCalled();
  },
);

describe('record route CORS', () => {
  test('handles preflight requests', async () => {
    const response = OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('x-umami-cache');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  test('includes CORS headers on post responses', async () => {
    parseRequestMock.mockResolvedValue({
      body: {
        type: 'record',
        payload: {
          website: '11111111-1111-4111-8111-111111111111',
          events: [],
        },
      },
      error: undefined,
    });

    const response = await POST(
      new Request('http://localhost/api/record', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

test('stores query-based and hash-based heatmap pages separately from the home page', async () => {
  const websiteId = '11111111-1111-4111-8111-111111111111';
  vi.mocked(parseToken).mockResolvedValue({
    type: CACHE_TOKEN_TYPE,
    websiteId,
    sessionId: websiteId,
    visitId: websiteId,
  });
  vi.mocked(getWebsite).mockResolvedValue({
    id: websiteId,
    recorderEnabled: true,
    replayConfig: { heatmapEnabled: true },
  } as any);
  vi.mocked(getClientInfo).mockResolvedValue({
    ip: '127.0.0.1',
    userAgent: 'Mozilla/5.0 Chrome/140.0.0.0',
  } as any);
  vi.mocked(hasBlockedIp).mockReturnValue(false);
  parseRequestMock.mockResolvedValue({
    body: {
      type: 'heatmap',
      payload: {
        website: websiteId,
        events: ['/', '/?products/', '/?products-2/100.html', '/about', '/#/cart'].map(url => ({
          type: 'click',
          url: `https://bolebricks.com${url}`,
          pageX: 10,
          pageY: 20,
        })),
      },
    },
    error: undefined,
  });

  const response = await POST(
    new Request('http://localhost/api/record', {
      method: 'POST',
      headers: { 'x-umami-cache': 'test-session' },
    }),
  );

  expect(response.status).toBe(200);
  expect(vi.mocked(saveHeatmapEvents).mock.calls[0][0].map(event => event.urlPath)).toEqual([
    '/',
    '/?products/',
    '/?products-2/100.html',
    '/about',
    '/#/cart',
  ]);
});

test.each(['record', 'heatmap'])(
  'IP exclusion stops %s ingestion even with a valid cache token',
  async type => {
    const websiteId = '11111111-1111-4111-8111-111111111111';
    vi.mocked(parseToken).mockResolvedValue({
      type: CACHE_TOKEN_TYPE,
      websiteId,
      sessionId: websiteId,
      visitId: websiteId,
    });
    vi.mocked(getWebsite).mockResolvedValue({
      id: websiteId,
      recorderEnabled: true,
      replayConfig: { replayEnabled: true, heatmapEnabled: true },
    } as any);
    vi.mocked(getClientInfo).mockResolvedValue({
      ip: '192.0.2.8',
      userAgent: 'Mozilla/5.0 Chrome/140.0.0.0',
    } as any);
    vi.mocked(hasBlockedIp).mockReturnValue(false);
    vi.mocked(hasWebsiteBlockedIp).mockResolvedValue(true);
    parseRequestMock.mockResolvedValue({
      body: { type, payload: { website: websiteId, events: [{ type: 'click', url: '/' }] } },
    });
    const response = await POST(
      new Request('http://localhost/api/record', {
        method: 'POST',
        headers: { 'x-umami-cache': 'cached' },
      }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(saveHeatmapEvents).not.toHaveBeenCalled();
    expect(saveRecording).not.toHaveBeenCalled();
  },
);

test('rejects another site cache token before loading the website', async () => {
  const websiteId = '11111111-1111-4111-8111-111111111111';
  vi.mocked(parseToken).mockResolvedValue({
    type: CACHE_TOKEN_TYPE,
    websiteId: 'another-site',
    sessionId: websiteId,
    visitId: websiteId,
  });
  parseRequestMock.mockResolvedValue({
    body: { type: 'record', payload: { website: websiteId, events: [{}] } },
  });
  const response = await POST(
    new Request('http://localhost/api/record', {
      method: 'POST',
      headers: { 'x-umami-cache': 'cached' },
    }),
  );
  expect(response.status).toBe(400);
  expect(getWebsite).not.toHaveBeenCalled();
});
