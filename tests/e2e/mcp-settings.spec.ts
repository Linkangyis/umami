import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { authHeaders, loginViaApi } from './helpers';

// Never capture a newly-issued credential in trace/video or screenshots.
test.use({ trace: 'off', video: 'off', actionTimeout: 15_000 });

test('MCP settings issues scoped tokens once, shows metadata, and revokes access', async ({
  page,
  request,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  const admin = await loginViaApi(request);
  const appOrigin = new URL(baseURL || 'http://localhost:3000').origin;
  const username = `mcp-ui-${randomUUID()}`;
  const password = `test-${randomUUID()}`;
  let userId: string | undefined;
  const tokens: string[] = [];
  let userAuth: Awaited<ReturnType<typeof loginViaApi>> | undefined;
  try {
    const createdUser = await request.post('/api/users', {
      headers: authHeaders(admin),
      data: { username, password, role: 'user' },
    });
    expect(createdUser.status()).toBe(200);
    userId = (await createdUser.json()).id;
    userAuth = await loginViaApi(request, username, password);
    const websiteId = randomUUID();
    const websiteName = 'MCP 界面验证网站';
    const createdWebsite = await request.post('/api/websites', {
      headers: authHeaders(userAuth),
      data: { id: websiteId, name: websiteName, domain: 'mcp-ui.example' },
    });
    expect(createdWebsite.status()).toBe(200);
    await page.addInitScript(token => {
      localStorage.setItem('umami.auth', JSON.stringify(token));
      localStorage.setItem('umami.locale', JSON.stringify('zh-CN'));
    }, userAuth.token);
    await page.goto('/settings/mcp?locale=zh-CN');
    await expect(page.getByRole('heading', { name: 'MCP 接入', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '创建令牌', exact: true })).toBeDisabled();
    await page.getByRole('textbox', { name: '令牌名称', exact: true }).fill('只读连接验证');
    await page
      .getByRole('checkbox', { name: `${websiteName} · mcp-ui.example`, exact: true })
      .click();
    await page.getByRole('combobox', { name: '有效期', exact: true }).click();
    await page.getByRole('option', { name: '7 天', exact: true }).click();
    const createdResponse = page.waitForResponse(
      response =>
        response.url().endsWith('/api/me/mcp-tokens') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '创建令牌', exact: true }).click();
    const firstResponse = await createdResponse;
    expect(firstResponse.status()).toBe(201);
    const first = await firstResponse.json();
    tokens.push(first.id);
    expect(first.scopes).toEqual(['analytics:read']);
    expect(first.websiteIds).toEqual([websiteId]);
    expect(Math.round((Date.parse(first.expiresAt) - Date.now()) / 86_400_000)).toBe(7);
    const issued = page.getByTestId('mcp-issued-token');
    await expect(issued).toBeVisible();
    const secret = await issued.locator('code').textContent();
    expect(/^xlist_mcp_[A-Za-z0-9_-]{43}$/.test(secret || '')).toBe(true);
    expect(secret === first.token).toBe(true);
    await expect(issued.getByRole('button', { name: '复制完整令牌', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '创建令牌', exact: true })).toBeDisabled();
    expect(
      await page.evaluate(
        value =>
          [...Object.values(localStorage), ...Object.values(sessionStorage)].some(item =>
            item.includes(value),
          ),
        secret,
      ),
    ).toBe(false);
    await issued.getByRole('button', { name: '已保存，隐藏令牌', exact: true }).click();
    await expect(issued).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('cell', { name: '只读连接验证', exact: true })).toBeVisible();
    await expect(page.getByTestId('mcp-issued-token')).toHaveCount(0);
    expect(await page.evaluate(value => document.body.textContent?.includes(value), secret)).toBe(
      false,
    );
    const listing = await request.get('/api/me/mcp-tokens', { headers: authHeaders(userAuth) });
    const listed = (await listing.json()).tokens;
    expect(listed.some(token => 'token' in token || 'tokenHash' in token)).toBe(false);
    let row = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: '只读连接验证', exact: true }) });
    await expect(row).toContainText('统计只读');
    await row.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(row).toContainText('已撤销');

    await page.getByRole('textbox', { name: '令牌名称', exact: true }).fill('扩展权限验证');
    await page
      .getByRole('checkbox', { name: `${websiteName} · mcp-ui.example`, exact: true })
      .click();
    await page.getByRole('checkbox', { name: '读取访问明细，包含 IP 地址', exact: true }).click();
    await page.getByRole('checkbox', { name: '创建、修改和删除事件绑定规则', exact: true }).click();
    const expandedResponse = page.waitForResponse(
      response =>
        response.url().endsWith('/api/me/mcp-tokens') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '创建令牌', exact: true }).click();
    const expanded = await (await expandedResponse).json();
    tokens.push(expanded.id);
    expect(expanded.scopes).toEqual(['analytics:read', 'sessions:read', 'event-rules:write']);
    await page.getByRole('button', { name: '已保存，隐藏令牌', exact: true }).click();
    await expect(page.getByTestId('mcp-issued-token')).toHaveCount(0);
    row = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: '扩展权限验证', exact: true }) });
    await expect(row).toContainText('访问明细（含 IP）');
    await expect(row).toContainText('编辑事件规则');
    await page.setViewportSize({ width: 1440, height: 1350 });
    await page.getByRole('heading', { name: 'MCP 接入', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('mcp-settings.png'), fullPage: true });
    await row.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(row).toContainText('已撤销');
  } finally {
    // Scrub the one-time reveal before Playwright writes any failure snapshot.
    await page
      .evaluate(() => document.querySelector('[data-test="mcp-issued-token"]')?.remove())
      .catch(() => undefined);
    if (userAuth) {
      for (const id of tokens)
        await fetch(`${appOrigin}/api/me/mcp-tokens/${id}`, {
          method: 'DELETE',
          headers: authHeaders(userAuth),
          signal: AbortSignal.timeout(10_000),
        });
    }
    if (userId) {
      const deleted = await fetch(`${appOrigin}/api/users/${userId}`, {
        method: 'DELETE',
        headers: authHeaders(admin),
        signal: AbortSignal.timeout(10_000),
      });
      expect(deleted.status).toBe(200);
    }
  }
});
