import { expect, test } from '@playwright/test';
import { uuid } from '../../src/lib/crypto';
import { authHeaders, loginViaApi, umamiUser } from './helpers';

test('deleted websites reject previously valid send and recording cache tokens', async ({
  request,
}) => {
  const auth = await loginViaApi(request);
  const websiteId = uuid();
  const headers = authHeaders(auth);
  expect(
    (
      await request.post('/api/websites', {
        headers,
        data: {
          id: websiteId,
          name: 'Collector deletion regression',
          domain: 'collector-test.example',
          createdBy: umamiUser.id,
        },
      })
    ).status(),
  ).toBe(200);
  const collector = {
    'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
    'x-forwarded-for': '203.0.113.77',
  };
  const data = {
    type: 'event',
    payload: { website: websiteId, url: '/review', hostname: 'collector-test.example' },
  };
  try {
    const first = await request.post('/api/send', { headers: collector, data });
    expect(first.status()).toBe(200);
    const { cache } = await first.json();
    expect(typeof cache).toBe('string');
    expect((await request.delete(`/api/websites/${websiteId}`, { headers })).status()).toBe(200);
    for (const type of ['event', 'identify', 'performance']) {
      expect(
        (
          await request.post('/api/send', {
            headers: { ...collector, 'x-umami-cache': cache },
            data: { ...data, type },
          })
        ).status(),
      ).toBe(400);
    }
    const recording = await request.post('/api/record', {
      headers: { ...collector, 'x-umami-cache': cache },
      data: {
        type: 'record',
        payload: {
          website: websiteId,
          events: [
            { type: 4, timestamp: Date.now(), data: { href: 'https://collector-test.example/' } },
          ],
        },
      },
    });
    expect(recording.status()).toBe(400);
  } finally {
    await request.delete(`/api/websites/${websiteId}`, { headers });
  }
});
