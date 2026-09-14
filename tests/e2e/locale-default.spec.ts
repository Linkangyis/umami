import { expect, test } from '@playwright/test';
import { uuid } from '../../src/lib/crypto';
import { authHeaders, deleteWebsite, loginViaApi, umamiUser } from './helpers';

test('a clean browser starts in Simplified Chinese without missing message keys', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(page.getByRole('textbox', { name: '用户名', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('body')).not.toContainText('label.');
  await expect(page.locator('body')).not.toContainText('message.');
});

test('an explicit saved English preference survives the new Chinese default and reload', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('umami.locale', JSON.stringify('en-US')));
  await page.goto('/login');
  await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
});

test('new authenticated users see translated analytics navigation and a compact traffic toolbar', async ({
  page,
  request,
}, testInfo) => {
  const auth = await loginViaApi(request);
  const websiteId = uuid();
  const response = await request.post('/api/websites', {
    headers: authHeaders(auth),
    data: {
      id: websiteId,
      createdBy: umamiUser.id,
      name: '中文界面验证',
      domain: 'locale-test.example',
    },
  });
  expect(response.status()).toBe(200);
  // The fixture domain is intentionally nonexistent; give its external favicon
  // a local response so console assertions measure the application itself.
  await page.route('https://icons.duckduckgo.com/ip3/locale-test.example.ico', route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" />',
    }),
  );
  const errors: string[] = [];
  const consoleIssues: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type()))
      consoleIssues.push(`${message.text()} ${message.location().url}`);
  });
  await page.addInitScript(
    token => localStorage.setItem('umami.auth', JSON.stringify(token)),
    auth.token,
  );
  try {
    await page.goto(`/websites/${websiteId}/traffic?date=0day`);
    await expect(page.getByRole('button', { name: '事件', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '多维分析', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '留存分析', exact: true })).toBeVisible();
    const report = page.getByTestId('traffic-report');
    await expect(report.getByRole('button', { name: '分析选项', exact: true })).toBeVisible();
    await expect(report.getByRole('combobox', { name: '统计粒度', exact: true })).toHaveCount(0);
    await expect(report.getByTestId('traffic-table')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('label.');
    await expect(page.locator('body')).not.toContainText('message.');
    expect(errors).toEqual([]);
    expect(consoleIssues).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('chinese-traffic-toolbar.png') });
  } finally {
    await deleteWebsite(request, auth, websiteId);
  }
});
