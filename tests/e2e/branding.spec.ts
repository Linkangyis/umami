import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { authHeaders, loginPage, loginViaApi } from './helpers';

test('admin branding uploads a logo, updates navigation/login/title and rejects regular users', async ({
  page,
  request,
  browser,
  baseURL,
}, testInfo) => {
  test.skip(
    process.env.BRANDING_E2E !== '1',
    'Opt in only on a dedicated development app: BRANDING_E2E=1.',
  );
  test.setTimeout(120_000);
  const auth = await loginPage(page, request);
  const originalResponse = await request.get('/api/admin/branding', { headers: authHeaders(auth) });
  expect(originalResponse.status()).toBe(200);
  const original = await originalResponse.json();
  const appOrigin = new URL(baseURL || 'http://localhost:3000').origin;
  const appName = '星图统计验证';
  const username = `branding-${randomUUID()}`;
  const password = `test-${randomUUID()}`;
  let userId: string | undefined;
  try {
    const created = await request.post('/api/users', {
      headers: authHeaders(auth),
      data: { username, password, role: 'user' },
    });
    expect(created.status()).toBe(200);
    userId = (await created.json()).id;
    const regularUser = await loginViaApi(request, username, password);
    for (const method of ['get', 'post', 'delete'] as const) {
      const response = await request[method]('/api/admin/branding', {
        headers: authHeaders(regularUser),
        ...(method === 'post' ? { data: { appName: 'Unauthorized', logoUrl: '' } } : {}),
      });
      expect(response.status()).toBe(401);
    }

    await page.goto('/admin/branding?locale=zh-CN');
    await page.getByRole('textbox', { name: '应用名称', exact: true }).fill(appName);
    await page
      .getByLabel('上传标志文件', { exact: true })
      .setInputFiles('public/favicon-32x32.png');
    await expect(page.getByText('已选择上传图片，点击保存后会存储到此应用。')).toBeVisible();
    await page.getByRole('button', { name: '保存品牌设置', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('品牌设置已保存');
    const navigationBrand = page.locator('[data-test="app-brand"]:visible').first();
    await expect(navigationBrand).toHaveText(appName);
    await expect(navigationBrand.getByRole('img')).toHaveAttribute(
      'src',
      /^data:image\/png;base64,/,
    );
    await expect(page).toHaveTitle(new RegExp(appName));
    const config = await request.get('/api/config');
    const branding = (await config.json()).branding;
    expect(Object.keys(branding).sort()).toEqual(['appName', 'logoUrl']);
    expect(branding.appName).toBe(appName);
    await page.screenshot({ path: testInfo.outputPath('branding-settings.png'), fullPage: true });

    const visitorContext = await browser.newContext();
    try {
      const login = await visitorContext.newPage();
      await login.goto(`${appOrigin}/login?locale=zh-CN`);
      await expect(login.getByRole('heading', { name: appName, exact: true })).toBeVisible();
      const logo = login.getByRole('img', { name: `${appName} logo`, exact: true });
      await expect(logo).toHaveAttribute('src', /^data:image\/png;base64,/);
      await expect
        .poll(() =>
          logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
        )
        .toBe(true);
      await expect(login).toHaveTitle(new RegExp(appName));
      await login.reload();
      await expect(login.getByRole('heading', { name: appName, exact: true })).toBeVisible();
      await login.screenshot({ path: testInfo.outputPath('branding-login.png'), fullPage: true });
    } finally {
      await visitorContext.close();
    }

    await page.getByRole('button', { name: '恢复默认品牌', exact: true }).click();
    await expect(navigationBrand).toHaveText('umami');
    await expect(page).toHaveTitle(/Umami/);
  } finally {
    const restored = await fetch(`${appOrigin}/api/admin/branding`, {
      method: 'POST',
      headers: authHeaders(auth),
      body: JSON.stringify(original),
      signal: AbortSignal.timeout(10000),
    });
    expect(restored.status).toBe(200);
    if (userId) {
      const removed = await fetch(`${appOrigin}/api/users/${userId}`, {
        method: 'DELETE',
        headers: authHeaders(auth),
        signal: AbortSignal.timeout(10000),
      });
      expect(removed.status).toBe(200);
    }
  }
});
