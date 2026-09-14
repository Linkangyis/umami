import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { uuid } from '../../src/lib/crypto';
import { authHeaders, deleteWebsite, loginPage, umamiUser } from './helpers';

test('content report preserves query routes and manages overlapping page groups', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120000);
  const auth = await loginPage(page, request);
  const websiteId = uuid();
  expect(
    (
      await request.post('/api/websites', {
        headers: authHeaders(auth),
        data: {
          id: websiteId,
          createdBy: umamiUser.id,
          name: 'Content verification',
          domain: 'content-test.example',
        },
      })
    ).status(),
  ).toBe(200);
  try {
    let cache: string;
    const start = Math.floor(Date.now() / 1000) - 180;
    for (const [index, url] of [
      '/?products/',
      '/?products/detail#photo',
      '/?articles/',
      '/?products/',
    ].entries()) {
      const response = await request.post('/api/send', {
        headers: {
          'x-forwarded-for': '203.0.113.80',
          'cf-ipcountry': 'US',
          'cf-region-code': 'CA',
          'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
          ...(cache ? { 'x-umami-cache': cache } : {}),
        },
        data: {
          type: 'event',
          payload: {
            website: websiteId,
            hostname: 'content-test.example',
            url,
            timestamp: start + index * 30,
            ...(index === 0 ? { referrer: 'https://google.com/search' } : {}),
          },
        },
      });
      expect(response.status()).toBe(200);
      cache = (await response.json()).cache;
    }
    await page.goto(`/websites/${websiteId}/content?date=0day`);
    const report = page.getByTestId('content-report');
    const table = report.getByTestId('content-table');
    await expect(table).toContainText('content-test.example/?products/');
    await expect(table).toContainText('content-test.example/?products/detail#photo');
    await expect(table).toContainText('content-test.example/?articles/');
    await expect(report.getByTestId('content-sources')).toContainText('google.com');
    const downloadReady = page.waitForEvent('download');
    await report.getByRole('button', { name: 'Export this page (CSV)', exact: true }).click();
    expect(await readFile(await (await downloadReady).path(), 'utf8')).toContain(
      'content-test.example/?products/detail#photo',
    );

    await report.getByRole('button', { name: 'Manage page groups', exact: true }).click();
    const manager = page.getByTestId('content-group-manager');
    await manager
      .getByRole('textbox', { name: 'Group name', exact: true })
      .fill('Product directory');
    await manager.getByRole('textbox', { name: 'Value', exact: true }).fill('/?products/');
    await manager.getByRole('button', { name: 'Save group', exact: true }).click();
    await expect(
      manager.getByTestId('content-group-item').filter({ hasText: 'Product directory' }),
    ).toBeVisible();
    await manager.getByRole('textbox', { name: 'Group name', exact: true }).fill('All pages');
    await manager.getByRole('textbox', { name: 'Value', exact: true }).fill('/');
    await manager.getByRole('button', { name: 'Save group', exact: true }).click();
    await expect(manager.getByTestId('content-group-item')).toHaveCount(2);
    await page.keyboard.press('Escape');

    await report.getByRole('button', { name: 'Report options', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('combobox', { name: 'Content view', exact: true })
      .click();
    await page.getByRole('option', { name: 'Page groups', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
    await expect(table).toContainText('Product directory');
    await expect(table).toContainText('All pages');
    const response = await request.get(`/api/websites/${websiteId}/content`, {
      headers: authHeaders(auth),
      params: { startAt: (start - 1) * 1000, endAt: Date.now(), mode: 'group' },
    });
    const body = await response.json();
    expect(body.summary.pageviews).toBe(4);
    expect(body.rows.map(row => row.pageviews).sort()).toEqual([3, 4]);

    await report.getByRole('button', { name: 'Manage page groups', exact: true }).click();
    await manager
      .getByTestId('content-group-item')
      .filter({ hasText: 'Product directory' })
      .getByRole('button', { name: 'Edit', exact: true })
      .click();
    await manager.getByRole('textbox', { name: 'Group name', exact: true }).fill('Articles');
    await manager.getByRole('textbox', { name: 'Value', exact: true }).fill('/?articles/');
    await manager.getByRole('button', { name: 'Save group', exact: true }).click();
    await expect(
      manager.getByTestId('content-group-item').filter({ hasText: 'Articles' }),
    ).toBeVisible();
    await manager
      .getByTestId('content-group-item')
      .filter({ hasText: 'All pages' })
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Delete', exact: true })
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect(manager.getByTestId('content-group-item')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(table).toContainText('Articles');
    await expect(table).not.toContainText('All pages');
    const finalReport = await request.get(`/api/websites/${websiteId}/content`, {
      headers: authHeaders(auth),
      params: { startAt: (start - 1) * 1000, endAt: Date.now(), mode: 'group' },
    });
    expect((await finalReport.json()).summary.pageviews).toBe(1);
    await expect(report.locator('[title="1"]').first()).toHaveText('1');
    await page.screenshot({ path: testInfo.outputPath('content-analysis.png') });
  } finally {
    await deleteWebsite(request, auth, websiteId);
  }
});
