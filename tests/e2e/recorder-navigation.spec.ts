import { expect, test } from '@playwright/test';
import { uuid } from '../../src/lib/crypto';
import { getReplayPages } from '../../src/lib/replay';
import { authHeaders, deleteWebsite, loginPage, loginViaApi, umamiUser } from './helpers';

test('recorder separates query, hash and normal pages through collection, reports and replay', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const auth = await loginPage(page, request);
  const websiteId = uuid();
  const paths = ['/?products/', '/?products-2/100.html', '/about', '/#/cart'];
  const startDate = new Date(Date.now() - 60_000).toISOString();
  const endDate = new Date(Date.now() + 60_000).toISOString();
  const response = await request.post('/api/websites', {
    headers: authHeaders(auth),
    data: {
      id: websiteId,
      createdBy: umamiUser.id,
      name: 'Recorder navigation regression',
      domain: 'localhost',
    },
  });
  expect(response.status()).toBe(200);

  try {
    const settings = await request.post(`/api/websites/${websiteId}`, {
      headers: authHeaders(auth),
      data: {
        replayConfig: {
          replayEnabled: true,
          heatmapEnabled: true,
          sampleRate: 1,
          heatmapSampleRate: 1,
        },
      },
    });
    expect(settings.status()).toBe(200);

    // Serve a controlled site while the actual recorder and API use the running application.
    await page.route('**/*', route =>
      route.request().isNavigationRequest()
        ? route.fulfill({
            contentType: 'text/html',
            body: '<!doctype html><html><head><title>Recorder fixture</title></head><body style="height:1800px"><h1>Products</h1><button data-test="page-action">Add item</button></body></html>',
          })
        : route.continue(),
    );
    await page.goto(paths[0]);
    await page.evaluate(async website => {
      const tracked = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'event',
          payload: { website, url: location.href, hostname: location.hostname },
        }),
      });
      const session = await tracked.json();
      if (!session.cache) throw new Error('Collector did not establish a session');
      (window as any).umami = { getSession: () => session };
      const script = document.createElement('script');
      script.src = '/recorder.js';
      script.setAttribute('data-website-id', website);
      script.setAttribute('data-host-url', location.origin);
      document.head.appendChild(script);
    }, websiteId);
    await page.waitForResponse(
      response =>
        response.url().endsWith('/api/record') &&
        response.request().postDataJSON()?.type === 'record',
    );

    for (const path of paths) {
      await page.evaluate(next => {
        history.pushState(null, '', next);
        const heading = document.querySelector('h1');
        if (heading) heading.textContent = next;
      }, path);
      await page.getByTestId('page-action').click();
    }

    const flushed = page.waitForResponse(
      response =>
        response.url().endsWith('/api/record') &&
        response.request().postDataJSON()?.type === 'heatmap',
    );
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    expect((await flushed).status()).toBe(200);

    const heatmap = await request.post('/api/reports/heatmap', {
      headers: authHeaders(auth),
      data: {
        websiteId,
        type: 'heatmap',
        filters: {},
        parameters: { startDate, endDate, mode: 'click' },
      },
    });
    expect(heatmap.status()).toBe(200);
    expect((await heatmap.json()).pages.map((row: any) => row.urlPath).sort()).toEqual(
      [...paths].sort(),
    );

    for (const path of paths) {
      const detail = await request.post('/api/reports/heatmap', {
        headers: authHeaders(auth),
        data: {
          websiteId,
          type: 'heatmap',
          filters: {},
          parameters: { startDate, endDate, mode: 'click', urlPath: path },
        },
      });
      const result = await detail.json();
      expect(result.points.length).toBeGreaterThan(0);
      expect(
        new URL(result.snapshot.url).pathname +
          new URL(result.snapshot.url).search +
          new URL(result.snapshot.url).hash,
      ).toBe(path);
    }

    const list = await request.get(`/api/websites/${websiteId}/replays`, {
      headers: authHeaders(auth),
      params: { startAt: Date.parse(startDate), endAt: Date.parse(endDate), minDuration: 0 },
    });
    expect(list.status()).toBe(200);
    const replayId = (await list.json()).data[0]?.id;
    expect(replayId).toBeTruthy();
    await expect
      .poll(async () => {
        const replay = await request.get(`/api/websites/${websiteId}/replays/${replayId}`, {
          headers: authHeaders(auth),
        });
        return getReplayPages((await replay.json()).events).map(page => page.path);
      })
      .toEqual(paths);

    await page.unrouteAll();
    await page.goto(`/websites/${websiteId}/replays/${replayId}`);
    const picker = page.getByTestId('replay-page-select');
    await expect(picker).toBeVisible();
    await expect(picker).toBeEnabled();
    await expect(picker.locator('option')).toHaveCount(paths.length + 1);
    await picker.selectOption('1');
    await expect(page.locator('.replayer-wrapper iframe')).toBeVisible();
    await expect(page.frameLocator('.replayer-wrapper iframe').getByRole('heading')).toBeVisible();
    await expect(page.getByText('Replay unavailable.', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('replay-query-pages.png'), fullPage: true });
  } finally {
    await deleteWebsite(request, auth, websiteId);
  }
});

test('replays with separate instantaneous upload chunks pass the real duration filter', async ({
  request,
}) => {
  const auth = await loginViaApi(request);
  const websiteId = uuid();
  const response = await request.post('/api/websites', {
    headers: authHeaders(auth),
    data: {
      id: websiteId,
      createdBy: umamiUser.id,
      name: 'Replay duration regression',
      domain: 'localhost',
    },
  });
  expect(response.status()).toBe(200);

  try {
    await request.post(`/api/websites/${websiteId}`, {
      headers: authHeaders(auth),
      data: { replayConfig: { replayEnabled: true, sampleRate: 1 } },
    });
    const userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36';
    const tracked = await request.post('/api/send', {
      headers: { 'user-agent': userAgent },
      data: {
        type: 'event',
        payload: { website: websiteId, hostname: 'localhost', url: '/?products/' },
      },
    });
    const { cache } = await tracked.json();
    expect(Boolean(cache)).toBe(true);
    const timestamp = Date.now();

    for (const offset of [0, 10_000]) {
      const chunk = await request.post('/api/record', {
        headers: { 'user-agent': userAgent, 'x-umami-cache': cache },
        data: {
          type: 'record',
          payload: {
            website: websiteId,
            timestamp: Math.floor((timestamp + offset) / 1000),
            events: [
              {
                type: 4,
                timestamp: timestamp + offset,
                data: { href: offset ? '/about' : '/?products/' },
              },
            ],
          },
        },
      });
      expect(chunk.status()).toBe(200);
    }

    const list = await request.get(`/api/websites/${websiteId}/replays`, {
      headers: authHeaders(auth),
      params: { startAt: timestamp - 60_000, endAt: timestamp + 60_000, minDuration: 5 },
    });
    expect(list.status()).toBe(200);
    const { data } = await list.json();
    expect(data).toHaveLength(1);
    expect(Number(data[0].duration)).toBe(10_000);
    expect(Number(data[0].chunkCount)).toBe(2);
  } finally {
    await deleteWebsite(request, auth, websiteId);
  }
});
