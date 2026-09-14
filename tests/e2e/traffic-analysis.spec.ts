import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { uuid } from '../../src/lib/crypto';
import { authHeaders, deleteWebsite, loginPage, umamiUser } from './helpers';

test('traffic report renders real metrics, changes interval and downloads both periods', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  const auth = await loginPage(page, request);
  const websiteId = uuid();
  const created = await request.post('/api/websites', {
    headers: authHeaders(auth),
    data: {
      id: websiteId,
      createdBy: umamiUser.id,
      name: 'Traffic verification',
      domain: 'traffic-test.example',
    },
  });
  expect(created.status()).toBe(200);
  try {
    const timestamp = Math.floor(Date.now() / 1000) - 90;
    let cache: string;
    for (const offset of [0, 30]) {
      const response = await request.post('/api/send', {
        headers: {
          'x-forwarded-for': '203.0.113.90',
          'cf-ipcountry': 'US',
          'cf-region-code': 'CA',
          'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
          ...(cache ? { 'x-umami-cache': cache } : {}),
        },
        data: {
          type: 'event',
          payload: {
            website: websiteId,
            url: '/',
            hostname: 'traffic-test.example',
            timestamp: timestamp + offset,
          },
        },
      });
      expect(response.status()).toBe(200);
      cache = (await response.json()).cache;
    }
    const api = await request.get(`/api/websites/${websiteId}/traffic`, {
      headers: authHeaders(auth),
      params: {
        startAt: (timestamp - 60) * 1000,
        endAt: Date.now(),
        timezone: 'UTC',
        unit: 'hour',
      },
    });
    expect(api.status()).toBe(200);
    expect((await api.json()).summary).toMatchObject({
      pageviews: 2,
      visitors: 1,
      visits: 1,
      bounces: 0,
      totalTime: 30,
    });

    await page.goto(`/websites/${websiteId}/traffic?date=0day`);
    const report = page.getByTestId('traffic-report');
    await expect(report.getByTestId('traffic-table')).toBeVisible();
    await expect(report.getByRole('combobox', { name: 'Interval', exact: true })).toHaveCount(0);
    await report.getByRole('button', { name: 'Analysis options', exact: true }).click();
    await page.getByRole('dialog').getByRole('combobox', { name: 'Interval', exact: true }).click();
    await page.getByRole('option', { name: 'Weekly', exact: true }).click();
    await expect(page).toHaveURL(/trafficUnit=week/);
    await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
    await expect(report.getByTestId('traffic-table')).toBeVisible();
    const downloadReady = page.waitForEvent('download');
    await report.getByRole('button', { name: 'Download CSV' }).click();
    const csv = await readFile(await (await downloadReady).path(), 'utf8');
    expect(csv).toContain('Current period');
    expect(csv).toContain('Comparison');
    expect(csv).toContain('pageviews');
    await report.getByText('Traffic analysis', { exact: true }).scrollIntoViewIfNeeded();
    await page.mouse.move(600, 250);
    await page.mouse.wheel(0, -5000);
    await expect(report.getByText('Traffic analysis', { exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('traffic-analysis.png') });
  } finally {
    await deleteWebsite(request, auth, websiteId);
  }
});
