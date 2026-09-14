import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { uuid } from '../../src/lib/crypto';
import { authHeaders, deleteWebsite, loginPage, umamiUser } from './helpers';

test('engagement uses overview cards and tabs, exports data and emits no invalid DOM props', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1200 });
  const warnings: string[] = [];
  page.on('console', message => {
    if (
      ['warning', 'error'].includes(message.type()) &&
      /does not recognize|non-boolean attribute|invalid value for prop|unknown.*prop/i.test(
        message.text(),
      )
    ) {
      warnings.push(message.text());
    }
  });
  const auth = await loginPage(page, request);
  const websiteId = uuid();
  const created = await request.post('/api/websites', {
    headers: authHeaders(auth),
    data: {
      id: websiteId,
      createdBy: umamiUser.id,
      name: 'Engagement appearance regression',
      domain: 'engagement-test.example',
    },
  });
  expect(created.status()).toBe(200);

  try {
    let cache: string | undefined;
    const timestamp = Math.floor(Date.now() / 1000) - 90;
    for (const offset of [0, 30]) {
      const sent = await request.post('/api/send', {
        headers: {
          'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
          ...(cache ? { 'x-umami-cache': cache } : {}),
        },
        data: {
          type: 'event',
          payload: {
            website: websiteId,
            url: '/products',
            hostname: 'engagement-test.example',
            timestamp: timestamp + offset,
          },
        },
      });
      expect(sent.status()).toBe(200);
      cache = (await sent.json()).cache;
    }

    await page.goto(`/websites/${websiteId}/engagement?date=0day&locale=en-US`);
    await expect(page.getByRole('table', { name: 'New & returning visitors' })).toBeVisible();
    const cards = page.getByTestId('engagement-metrics').locator(':scope > *');
    await expect(cards).toHaveCount(4);
    expect(
      await cards.first().evaluate(element => getComputedStyle(element).borderTopWidth),
    ).not.toBe('0px');
    await expect(page.getByRole('tab', { name: 'Visit duration' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('tab', { name: 'Page depth' }).click();
    await expect(page.getByRole('table', { name: 'Page depth' })).toBeVisible();
    await page.getByRole('tab', { name: 'Visit frequency' }).click();
    await expect(page.getByRole('table', { name: 'Visit frequency' })).toContainText(
      'Visitor share',
    );

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download CSV' }).last().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`engagement-${websiteId}-frequency.csv`);
    const csv = await readFile((await download.path()) as string, 'utf8');
    expect(csv).toContain('Visitor share');
    expect(csv).toContain('1 visits');
    await expect(cards.nth(2).getByText('2', { exact: true })).toBeVisible();
    await expect(cards.nth(3).getByText('0 m 30 s', { exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('engagement-overview-style.png'),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('tab', { name: 'Page depth' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('engagement-mobile.png'), fullPage: true });
    expect(warnings).toEqual([]);
  } finally {
    await deleteWebsite(request, auth, websiteId);
  }
});
