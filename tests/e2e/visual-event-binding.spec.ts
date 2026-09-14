import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { authHeaders, loginPage } from './helpers';

test('creates multiple events in a detached cross-origin window and lists them there', async ({
  page,
  request,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(180_000);
  const auth = await loginPage(page, request);
  const websiteId = randomUUID();
  const appOrigin = new URL(baseURL || 'http://localhost:3000').origin;
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.end(`<!doctype html><html><head><style>
      body{font:18px system-ui;padding:80px;background:white;color:#222}
      a,button{display:inline-block;padding:20px;margin:20px}form{padding:24px;border:1px solid #ddd}
      </style><script defer src="${appOrigin}/script.js" data-website-id="${websiteId}" data-host-url="${appOrigin}"></script>
      </head><body><h1>Visual event editor fixture</h1>
      <a href="/checkout" id="primary-action"><span>Buy product</span></a>
      <button id="secondary-action">Contact us</button>
      <form id="contact-form" onsubmit="event.preventDefault()"><input aria-label="Email"><button type="submit">Send</button></form>
      </body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const targetUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/?products/100.html`;
  const created = await request.post('/api/websites', {
    headers: authHeaders(auth),
    data: { id: websiteId, name: 'Popup editor regression', domain: '127.0.0.1' },
  });
  expect(created.status()).toBe(200);
  try {
    await page.addInitScript(() =>
      localStorage.setItem('umami.events.tab', JSON.stringify('visual')),
    );
    await page.goto(`/websites/${websiteId}/events?locale=en-US`);
    await page.getByRole('tab', { name: 'Visual binding', exact: true }).click();
    await page.getByRole('textbox', { name: 'Target page', exact: true }).fill(targetUrl);
    await expect(page.locator('iframe')).toHaveCount(0);
    const opened = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Open visual editor', exact: true }).click();
    const popup = await opened;
    await expect(popup.locator('[data-umami-editor-root]')).toBeAttached({ timeout: 30_000 });
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    expect(new URL(popup.url()).searchParams.get('umami-editor')).toMatch(/^[a-f0-9]{48}$/);
    const originalUrl = popup.url();
    await popup.locator('#primary-action span').click();
    await expect(popup).toHaveURL(originalUrl);
    await expect(popup.getByRole('textbox', { name: '元素选择器', exact: true })).toHaveValue(
      '#primary-action',
    );
    await expect(popup.getByRole('textbox', { name: '页面路径', exact: true })).toHaveValue(
      '/?products/100.html',
    );
    await popup.getByRole('textbox', { name: '事件名称', exact: true }).fill('visual-buy');
    const saved = popup.waitForResponse(
      response =>
        response.request().method() === 'POST' && response.url().includes('/editor-session/'),
    );
    await popup.getByRole('button', { name: '保存事件', exact: true }).click();
    expect((await saved).status()).toBe(200);
    await expect(popup.getByText('已保存，可继续点击其他元素', { exact: true })).toBeVisible();
    await popup.locator('#secondary-action').click();
    await popup.getByRole('textbox', { name: '事件名称', exact: true }).fill('visual-contact');
    const savedSecond = popup.waitForResponse(
      response =>
        response.request().method() === 'POST' && response.url().includes('/editor-session/'),
    );
    await popup.getByRole('button', { name: '保存事件', exact: true }).click();
    expect((await savedSecond).status()).toBe(200);
    await popup.getByRole('button', { name: '已创建事件', exact: true }).click();
    await expect(popup.locator('.rule')).toHaveCount(2);
    await expect(popup.getByText('visual-buy', { exact: true })).toBeVisible();
    await expect(popup.getByText('visual-contact', { exact: true })).toBeVisible();
    await popup.locator('#contact-form button').click();
    await popup.getByRole('combobox', { name: '触发方式', exact: true }).selectOption('submit');
    await expect(popup.getByRole('textbox', { name: '元素选择器', exact: true })).toHaveValue(
      '#contact-form',
    );
    await popup.getByRole('textbox', { name: '事件名称', exact: true }).fill('visual-lead');
    await popup.screenshot({ path: testInfo.outputPath('target-page-event-popup.png') });
    const savedForm = popup.waitForResponse(
      response =>
        response.request().method() === 'POST' && response.url().includes('/editor-session/'),
    );
    await popup.getByRole('button', { name: '保存事件', exact: true }).click();
    expect((await savedForm).status()).toBe(200);
    const rules = await request.get(`/api/websites/${websiteId}/event-rules`, {
      headers: authHeaders(auth),
    });
    expect((await rules.json()).data).toHaveLength(3);
    await popup.close();

    const context = await browser.newContext();
    const visitor = await context.newPage();
    const publicRules = visitor.waitForResponse(response =>
      response.url().includes('/api/event-rules?websiteId='),
    );
    await visitor.goto(targetUrl);
    expect((await publicRules).status()).toBe(200);
    await expect(visitor.locator('[data-umami-editor-root]')).toHaveCount(0);
    const collected = visitor.waitForRequest(
      req =>
        req.url().endsWith('/api/send') && req.postDataJSON()?.payload?.name === 'visual-contact',
    );
    await visitor.locator('#secondary-action').click();
    await collected;
    await context.close();
  } finally {
    await request.delete(`/api/websites/${websiteId}`, { headers: authHeaders(auth) });
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('rejects anonymous session creation and invalid capability IDs with CORS headers', async ({
  request,
}) => {
  const create = await request.post('/api/event-rules/editor-session', {
    data: { websiteId: randomUUID() },
  });
  expect(create.status()).toBe(401);
  const invalid = await request.get('/api/event-rules/editor-session/' + 'a'.repeat(48));
  expect(invalid.status()).toBe(404);
  expect(invalid.headers()['access-control-allow-origin']).toBe('*');
  const preflight = await request.fetch('/api/event-rules/editor-session/' + 'a'.repeat(48), {
    method: 'OPTIONS',
  });
  expect(preflight.status()).toBe(204);
});
