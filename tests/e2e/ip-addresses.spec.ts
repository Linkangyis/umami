import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { uuid } from '../../src/lib/crypto';
import { authHeaders, deleteWebsite, loginPage, umamiUser } from './helpers';

test('IP report exports real data and exclusions immediately stop and resume cached collection', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(15000);
  const auth = await loginPage(page, request);
  const websiteId = uuid();
  const warnings: string[] = [];
  page.on('console', message => {
    if (
      ['warning', 'error'].includes(message.type()) &&
      /does not recognize|non-boolean attribute|invalid value for prop|unknown.*prop/i.test(
        message.text(),
      )
    )
      warnings.push(message.text());
  });
  const created = await request.post('/api/websites', {
    headers: authHeaders(auth),
    data: {
      id: websiteId,
      createdBy: umamiUser.id,
      name: 'IP exclusion regression',
      domain: 'ip-test.invalid',
    },
  });
  expect(created.status()).toBe(200);
  const ip = '192.0.2.8';
  const headers = {
    'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
    'x-real-ip': ip,
  };
  let cache = '';
  const collect = () =>
    request.post('/api/send', {
      headers: { ...headers, ...(cache ? { 'x-umami-cache': cache } : {}) },
      data: {
        type: 'event',
        payload: { website: websiteId, ip, url: '/?products/', hostname: 'ip-test.invalid' },
      },
    });
  try {
    const first = await collect();
    expect(first.status()).toBe(200);
    cache = (await first.json()).cache;
    expect(cache).toBeTruthy();
    await page.goto(`/websites/${websiteId}/ip-addresses?date=0day`);
    await expect(page.getByRole('table', { name: 'IP report' })).toContainText(ip);
    const downloadEvent = page.waitForEvent('download', { timeout: 15000 });
    await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
    const download = await downloadEvent;
    const downloadPath = await Promise.race([
      download.path(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('CSV download did not complete within 15 seconds')),
          15000,
        ),
      ),
    ]);
    expect(await readFile(downloadPath as string, 'utf8')).toContain(ip);
    await page.getByRole('button', { name: 'Report options' }).click();
    await page.getByRole('textbox', { name: 'Search IP' }).fill('192.0.3');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('No IP addresses');
    await page.getByRole('button', { name: 'Report options' }).click();
    await page.getByRole('textbox', { name: 'Search IP' }).fill('');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByRole('table', { name: 'IP report' })).toContainText(ip);
    await page.getByRole('button', { name: 'Exclude IP', exact: true }).click();
    await page.getByRole('textbox', { name: 'IP address or range' }).fill('192.0.2.8/24');
    await page.getByRole('textbox', { name: 'Note', exact: true }).fill('Office network');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect((await collect()).status()).toBe(403);
    await page.getByRole('tab', { name: 'IP exclusions' }).click();
    const table = page.getByRole('table', { name: 'IP exclusions' });
    await expect(table).toContainText('192.0.2.0/24');
    await expect(table).toContainText('Office network');
    await page.getByRole('button', { name: 'Disable', exact: true }).click();
    await expect(table).toContainText('Disabled');
    expect((await collect()).status()).toBe(200);
    await page.getByRole('button', { name: 'Enable', exact: true }).click();
    await expect(table).toContainText('Enabled');
    expect((await collect()).status()).toBe(403);
    const listed = await request.get(`/api/websites/${websiteId}/ip-rules`, {
      headers: authHeaders(auth),
    });
    expect(listed.headers()['cache-control']).toBe('no-store');
    expect((await listed.json()).data[0].name).toBe('Office network');
    const unauth = await request.get(
      `/api/websites/${websiteId}/ip-addresses?startAt=${Date.now() - 86400000}&endAt=${Date.now()}`,
    );
    expect(unauth.status()).toBe(401);
    await page.screenshot({ path: testInfo.outputPath('ip-rules-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('ip-rules-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('No IP exclusions configured.')).toBeVisible();
    expect((await collect()).status()).toBe(200);
    expect(warnings).toEqual([]);
  } finally {
    await deleteWebsite(request, auth, websiteId);
  }
});
