import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type APIRequestContext, type Browser, expect, type Page, test } from '@playwright/test';
import { type Auth, authHeaders, loginPage } from './helpers';

test.use({ actionTimeout: 15_000, navigationTimeout: 45_000 });

type FixtureSite = { origin: string; close: () => Promise<void> };

async function startSite(appOrigin: string, websiteId: string): Promise<FixtureSite> {
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    if (request.url?.startsWith('/attack')) {
      response.end(`<!doctype html><script>
        parent.postMessage({ type: 'umami:element-selected', websiteId: ${JSON.stringify(websiteId)}, selector: '#forged-selection', url: location.href, tagName: 'button' }, ${JSON.stringify(appOrigin)});
        parent.postMessage({ type: 'fixture-attack-delivered' }, ${JSON.stringify(appOrigin)});
      </script>`);
      return;
    }
    response.end(`<!doctype html><html><head><title>Visual event binding fixture</title>
      <style>body{font:18px system-ui;padding:80px}button{padding:20px;margin:20px}form{padding:24px;border:1px solid #ddd}</style>
      <script defer src="${appOrigin}/script.js" data-website-id="${websiteId}" data-host-url="${appOrigin}"></script>
      </head><body><h1>Choose a product</h1>
      <button id="primary-action" type="button"><span data-test="nested-action">Buy product</span></button>
      <button id="secondary-action" type="button"><span data-test="nested-secondary">Contact us</span></button>
      <form id="contact-form" onsubmit="event.preventDefault()"><input aria-label="Email" value="private@example.test"><button type="submit">Send</button></form>
      </body></html>`);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => closeServer(server),
  };
}

async function closeServer(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  );
}

async function createWebsite(request: APIRequestContext, auth: Auth, websiteId: string) {
  const response = await request.post('/api/websites', {
    headers: authHeaders(auth),
    data: { id: websiteId, name: 'Visual binding regression', domain: 'localhost' },
  });
  expect(response.status()).toBe(200);
}

async function cleanupWebsite(appOrigin: string, auth: Auth, websiteId: string) {
  // Independent transport also cleans up if a failed test has already disposed its request fixture.
  const response = await fetch(`${appOrigin}/api/websites/${websiteId}`, {
    method: 'DELETE',
    headers: authHeaders(auth),
    signal: AbortSignal.timeout(10_000),
  });
  expect(response.status).toBe(200);
}

async function openBinding(page: Page, websiteId: string, targetUrl: string) {
  await page.addInitScript(() => {
    localStorage.setItem('umami.locale', JSON.stringify('en-US'));
    localStorage.setItem('umami.events.tab', JSON.stringify('visual'));
  });
  await page.goto(`/websites/${websiteId}/events?locale=en-US`);
  await expect(page.getByRole('tab', { name: 'Visual binding', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Visual binding', exact: true }).click();
  await page.getByRole('textbox', { name: 'Target page', exact: true }).fill(targetUrl);
}

async function namedEvents(request: APIRequestContext, auth: Auth, websiteId: string) {
  const response = await request.get(`/api/websites/${websiteId}/events`, {
    headers: authHeaders(auth),
    params: {
      startAt: Date.now() - 600_000,
      endAt: Date.now() + 60_000,
      eventType: 2,
      pageSize: 100,
    },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  return body.data.map((event: { eventName: string }) => event.eventName).sort();
}

async function normalClick(
  browser: Browser,
  targetUrl: string,
  websiteId: string,
  selector: string,
) {
  // Fresh context proves saved server rules work without any editor state or cached rules.
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  try {
    const config = page.waitForResponse(response =>
      response.url().includes(`/api/event-rules?websiteId=${websiteId}`),
    );
    await page.goto(targetUrl);
    expect((await config).status()).toBe(200);
    await page.waitForLoadState('networkidle');
    const collected = page.waitForResponse(
      response =>
        response.url().endsWith('/api/send') &&
        response.request().method() === 'POST' &&
        !!response.request().postDataJSON()?.payload?.name,
    );
    await page.locator(selector).click();
    expect((await collected).status()).toBe(200);
    await page.waitForLoadState('networkidle');
  } finally {
    await context.close();
  }
}

async function sendAttackerMessage(page: Page, attackerOrigin: string) {
  await page.evaluate(
    origin =>
      new Promise<void>((resolve, reject) => {
        const frame = document.createElement('iframe');
        frame.hidden = true;
        const timeout = window.setTimeout(() => {
          window.removeEventListener('message', receive);
          frame.remove();
          reject(new Error(`Attacker fixture did not deliver its message from ${origin}`));
        }, 5000);
        const receive = (event: MessageEvent) => {
          if (
            event.source === frame.contentWindow &&
            event.data?.type === 'fixture-attack-delivered'
          ) {
            window.removeEventListener('message', receive);
            window.clearTimeout(timeout);
            frame.remove();
            resolve();
          }
        };
        window.addEventListener('message', receive);
        frame.src = `${origin}/attack`;
        document.body.appendChild(frame);
      }),
    attackerOrigin,
  );
}

test('iframe binding saves a unique nested-element selector and manages real collected events', async ({
  page,
  request,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(180_000);
  const auth = await loginPage(page, request);
  const websiteId = randomUUID();
  const appOrigin = new URL(baseURL || 'http://localhost:3000').origin;
  const target = await startSite(appOrigin, websiteId);
  const attacker = await startSite(appOrigin, websiteId);
  const targetUrl = `${target.origin}/?products/100.html`;
  let created = false;
  try {
    await createWebsite(request, auth, websiteId);
    created = true;
    await openBinding(page, websiteId, targetUrl);
    await page.getByRole('button', { name: 'Open visual editor', exact: true }).click();
    await expect(
      page.getByText('Connected. Click an element to bind it.', { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    const frame = page.frameLocator('iframe[title="Visual event binding preview"]');
    const selector = page.getByRole('textbox', { name: 'Element selector', exact: true });
    await expect(selector).toHaveValue('');

    // Both an unrelated origin and a sibling frame on the trusted target origin must be ignored.
    await sendAttackerMessage(page, attacker.origin);
    await expect(selector).toHaveValue('');
    await sendAttackerMessage(page, target.origin);
    await expect(selector).toHaveValue('');

    await frame.getByTestId('nested-action').click();
    await expect(selector).toHaveValue('#primary-action');
    expect(await frame.locator('#primary-action').count()).toBe(1);
    await expect(page.getByRole('textbox', { name: 'Page path', exact: true })).toHaveValue(
      '/?products/100.html',
    );
    await page.getByRole('textbox', { name: 'Event name', exact: true }).fill('visual-buy');
    await page.getByRole('button', { name: 'Save event', exact: true }).click();
    let row = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'visual-buy click', exact: true }) });
    await expect(row).toBeVisible();
    expect(await namedEvents(request, auth, websiteId)).toEqual([]);
    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 1440, height: 1800 });
    await page.getByRole('tab', { name: 'Visual binding', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('visual-iframe-binding.png'),
      fullPage: true,
    });
    if (originalViewport) await page.setViewportSize(originalViewport);
    await page.getByRole('button', { name: 'Close editor', exact: true }).click();
    await normalClick(browser, targetUrl, websiteId, '#primary-action span');
    await expect.poll(() => namedEvents(request, auth, websiteId)).toEqual(['visual-buy']);

    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('textbox', { name: 'Event name', exact: true }).fill('visual-buy-renamed');
    await page.getByRole('button', { name: 'Save event', exact: true }).click();
    row = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'visual-buy-renamed click', exact: true }) });
    await expect(row).toBeVisible();
    await normalClick(browser, targetUrl, websiteId, '#primary-action span');
    await expect
      .poll(() => namedEvents(request, auth, websiteId))
      .toEqual(['visual-buy', 'visual-buy-renamed']);

    await row.getByRole('button', { name: 'Disable', exact: true }).click();
    await expect(row.getByText('Disabled', { exact: true })).toBeVisible();
    await normalClick(browser, targetUrl, websiteId, '#primary-action span');
    await expect
      .poll(() => namedEvents(request, auth, websiteId))
      .toEqual(['button-click', 'visual-buy', 'visual-buy-renamed']);
  } finally {
    try {
      if (created) await cleanupWebsite(appOrigin, auth, websiteId);
    } finally {
      await Promise.all([target.close(), attacker.close()]);
    }
  }
});

test('redirect binding accepts only its popup and preserves query-route scope', async ({
  page,
  request,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(150_000);
  const auth = await loginPage(page, request);
  const websiteId = randomUUID();
  const appOrigin = new URL(baseURL || 'http://localhost:3000').origin;
  const target = await startSite(appOrigin, websiteId);
  const attacker = await startSite(appOrigin, websiteId);
  const targetUrl = `${target.origin}/?products/200.html`;
  let created = false;
  let popup: Page | undefined;
  try {
    await createWebsite(request, auth, websiteId);
    created = true;
    await openBinding(page, websiteId, targetUrl);
    await page.getByRole('radio', { name: 'Redirect mode', exact: true }).click();
    const opened = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Open visual editor', exact: true }).click();
    popup = await opened;
    await expect(
      page.getByText('Connected. Click an element to bind it.', { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(popup).toHaveURL(targetUrl);
    const selector = page.getByRole('textbox', { name: 'Element selector', exact: true });
    await sendAttackerMessage(page, attacker.origin);
    await expect(selector).toHaveValue('');
    await popup.getByTestId('nested-secondary').click();
    await expect(selector).toHaveValue('#secondary-action');
    await expect(page.getByRole('textbox', { name: 'Page path', exact: true })).toHaveValue(
      '/?products/200.html',
    );

    // Even the trusted popup cannot claim a selected element belongs to another origin.
    await popup.evaluate(
      ({ websiteId, appOrigin }) => {
        window.opener.postMessage(
          {
            type: 'umami:element-selected',
            websiteId,
            selector: '#forged-selection',
            url: 'https://unrelated.invalid/',
            tagName: 'button',
          },
          appOrigin,
        );
      },
      { websiteId, appOrigin },
    );
    await expect(selector).toHaveValue('#secondary-action');
    await page.getByRole('textbox', { name: 'Event name', exact: true }).fill('visual-contact');
    await page.getByRole('button', { name: 'Save event', exact: true }).click();
    await expect(
      page
        .getByRole('row')
        .filter({ has: page.getByRole('cell', { name: 'visual-contact click', exact: true }) }),
    ).toBeVisible();
    await popup.screenshot({ path: testInfo.outputPath('visual-popup-selection.png') });
    await page.getByRole('button', { name: 'Close editor', exact: true }).click();
    await expect.poll(() => popup?.isClosed()).toBe(true);
    await normalClick(browser, targetUrl, websiteId, '#secondary-action span');
    await expect.poll(() => namedEvents(request, auth, websiteId)).toEqual(['visual-contact']);
    await normalClick(
      browser,
      `${target.origin}/?products/201.html`,
      websiteId,
      '#secondary-action span',
    );
    await expect
      .poll(() => namedEvents(request, auth, websiteId))
      .toEqual(['button-click', 'visual-contact']);
  } finally {
    await popup?.close().catch(() => undefined);
    try {
      if (created) await cleanupWebsite(appOrigin, auth, websiteId);
    } finally {
      await Promise.all([target.close(), attacker.close()]);
    }
  }
});

test('visual form binding uses the containing form and records a named submission once', async ({
  page,
  request,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const auth = await loginPage(page, request);
  const websiteId = randomUUID();
  const appOrigin = new URL(baseURL || 'http://localhost:3000').origin;
  const target = await startSite(appOrigin, websiteId);
  const targetUrl = `${target.origin}/?contact/`;
  let created = false;
  try {
    await createWebsite(request, auth, websiteId);
    created = true;
    await openBinding(page, websiteId, targetUrl);
    await page.getByRole('button', { name: 'Open visual editor', exact: true }).click();
    await expect(
      page.getByText('Connected. Click an element to bind it.', { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await page
      .frameLocator('iframe[title="Visual event binding preview"]')
      .getByRole('button', { name: 'Send', exact: true })
      .click();
    const selector = page.getByRole('textbox', { name: 'Element selector', exact: true });
    await expect(selector).toHaveValue('#contact-form > button');
    await page.getByRole('combobox', { name: 'Trigger', exact: true }).click();
    await page.getByRole('option', { name: 'Form submission', exact: true }).click();
    await expect(selector).toHaveValue('#contact-form');
    await page.getByRole('textbox', { name: 'Event name', exact: true }).fill('visual-lead');
    await page.getByRole('button', { name: 'Save event', exact: true }).click();
    await expect(page.getByRole('cell', { name: 'visual-lead submit', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close editor', exact: true }).click();
    await normalClick(browser, targetUrl, websiteId, '#contact-form button');
    await expect
      .poll(() => namedEvents(request, auth, websiteId))
      .toEqual(['button-click', 'visual-lead']);
  } finally {
    try {
      if (created) await cleanupWebsite(appOrigin, auth, websiteId);
    } finally {
      await target.close();
    }
  }
});
