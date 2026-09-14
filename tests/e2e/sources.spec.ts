import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { authHeaders, loginPage } from './helpers';

test.use({ actionTimeout: 15_000 });

test('sources reports show source quality, real keyword matrix, exclusions, pagination and safe CSV', async ({
  page,
  request,
  baseURL,
}, testInfo) => {
  test.setTimeout(180_000);
  const auth = await loginPage(page, request);
  const websiteId = randomUUID();
  const appOrigin = new URL(baseURL || 'http://localhost:3000').origin;
  const created = await request.post('/api/websites', {
    headers: authHeaders(auth),
    data: { id: websiteId, name: '来源分析验收', domain: 'sources.example' },
  });
  expect(created.status()).toBe(200);
  const startAt = Date.now() - 3_600_000;
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
  const sendVisit = async (ip: string, referrer: string, twoPages = false, agent = userAgent) => {
    const first = await request.post('/api/send', {
      data: {
        type: 'event',
        payload: {
          website: websiteId,
          hostname: 'sources.example',
          url: 'https://sources.example/landing',
          referrer,
          ip,
          userAgent: agent,
          timestamp: Math.floor(startAt / 1000),
        },
      },
    });
    expect(first.status()).toBe(200);
    const session = await first.json();
    expect(Boolean(session.cache)).toBe(true);
    if (twoPages) {
      const second = await request.post('/api/send', {
        headers: { 'x-umami-cache': session.cache },
        data: {
          type: 'event',
          payload: {
            website: websiteId,
            hostname: 'sources.example',
            url: 'https://sources.example/checkout',
            referrer: 'https://sources.example/landing',
            ip,
            userAgent: agent,
            timestamp: Math.floor(startAt / 1000) + 10,
          },
        },
      });
      expect(second.status()).toBe(200);
    }
  };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (
      /does not recognize|non-boolean attribute|Unknown event handler|Invalid value for prop/.test(
        message.text(),
      )
    )
      errors.push(message.text());
  });
  try {
    await sendVisit('198.51.100.11', 'https://www.google.com/search?q=shared+term', true);
    await sendVisit('198.51.100.12', 'https://www.baidu.com/s?wd=%E6%B5%8B%E8%AF%95', true);
    await sendVisit(
      '198.51.100.11',
      'https://www.bing.com/search?q=shared%20term',
      false,
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
    );
    await sendVisit('198.51.100.13', 'https://www.google.com/url?sa=t');
    await sendVisit('198.51.100.14', 'https://www.google.com/search?q=%3DSUM%281%29');
    for (let index = 0; index < 12; index++)
      await sendVisit(`198.51.100.${100 + index}`, `https://referrer-${index}.example/article`);
    const api = await request.get(`/api/websites/${websiteId}/sources`, {
      headers: authHeaders(auth),
      params: { startAt: startAt - 60_000, endAt: Date.now(), view: 'channels' },
    });
    expect(api.status()).toBe(200);
    const report = await api.json();
    expect(report.summary).toMatchObject({ pageviews: 19, visitors: 17, visits: 17, ips: 16 });
    expect(JSON.stringify(report).includes('198.51.100.')).toBe(false);
    expect(
      (
        await request.get(`/api/websites/${websiteId}/sources`, {
          params: { startAt, endAt: Date.now() },
        })
      ).status(),
    ).toBe(401);

    await page.goto(`/websites/${websiteId}/sources?locale=zh-CN`);
    await expect(page.getByRole('heading', { name: '来源分析', exact: true })).toBeVisible();
    await expect(page.getByRole('table', { name: '来路概览', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: '关键词', exact: true }).click();
    const keywordTable = page.getByRole('table', { name: '关键词', exact: true });
    await expect(keywordTable.getByRole('cell', { name: '测试', exact: true })).toBeVisible();
    await expect(
      keywordTable.getByRole('cell', { name: '未提供 / 无法解码', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '分析选项', exact: true }).click();
    await page.getByRole('checkbox', { name: '按引擎交叉查看（PV / UV）', exact: true }).click();
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await expect(
      keywordTable.getByRole('columnheader', { name: 'Google PV / UV', exact: true }),
    ).toBeVisible();
    const shared = keywordTable
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'shared term', exact: true }) });
    await expect(shared).toContainText('2 / 1');
    await expect(shared).toContainText('1 / 1');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出当前页 CSV', exact: true }).click();
    const download = await downloadPromise;
    const csvPath = testInfo.outputPath('source-keywords.csv');
    await download.saveAs(csvPath);
    const csv = await readFile(csvPath, 'utf8');
    expect(csv.includes('Google PV / UV')).toBe(true);
    expect(csv.includes("'=SUM(1)")).toBe(true);
    expect(csv.includes('198.51.100.')).toBe(false);
    const spam = keywordTable
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: '=SUM(1)', exact: true }) });
    await spam.getByRole('button', { name: '排除此关键词', exact: true }).click();
    await expect(keywordTable.getByRole('cell', { name: '=SUM(1)', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '清除排除项', exact: true }).click();
    await expect(keywordTable.getByRole('cell', { name: '=SUM(1)', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '显示指标', exact: true }).click();
    for (const label of [
      '访问次数',
      '新访客',
      '已记录 IP 数',
      'IP 覆盖率',
      '跳出率',
      '平均访问页数',
      '平均访问时长',
    ]) {
      await page.getByRole('checkbox', { name: label, exact: true }).click();
    }
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: '跳出率', exact: true })).toHaveCount(0);
    await expect(
      keywordTable.getByRole('columnheader', { name: '跳出率', exact: true }),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 1600, height: 1200 });
    await page.getByRole('heading', { name: '来源分析', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('sources-keyword-matrix.png'),
      fullPage: true,
    });

    await page.getByRole('tab', { name: '外部链接', exact: true }).click();
    const external = page.getByRole('table', { name: '外部链接', exact: true });
    await expect(external.getByRole('row')).toHaveCount(13);
    await expect(
      external.getByRole('cell', { name: 'referrer-0.example/article', exact: true }),
    ).toBeVisible();
    await expect(external.getByRole('cell').filter({ hasText: 'google.com' })).toHaveCount(0);
    await expect(external.getByRole('cell').filter({ hasText: 'bing.com' })).toHaveCount(0);

    await page.getByRole('tab', { name: '来路汇总', exact: true }).click();
    await page.getByRole('combobox', { name: '每页行数', exact: true }).click();
    await page.getByRole('option', { name: '10', exact: true }).click();
    const domains = page.getByRole('table', { name: '来路汇总', exact: true });
    await expect(domains.getByRole('row')).toHaveCount(11);
    await page.getByTestId('sources-pager').getByRole('button').last().click();
    await expect(domains.getByRole('row')).toHaveCount(6);
    await page
      .getByRole('searchbox', { name: '搜索来源、引擎或关键词', exact: true })
      .fill('referrer-11.example');
    await expect(domains.getByRole('row')).toHaveCount(2);
    await expect(
      domains.getByRole('cell', { name: 'referrer-11.example', exact: true }),
    ).toBeVisible();

    await page.goto(`/websites/${websiteId}/sources?locale=zh-CN&path=eq.%2Fcheckout`);
    await expect(page.getByRole('table', { name: '来路概览', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: '搜索引擎', exact: true }).click();
    const engines = page.getByRole('table', { name: '搜索引擎', exact: true });
    await expect(engines.getByRole('row')).toHaveCount(3);
    await expect(engines.getByRole('cell', { name: 'Google', exact: true })).toBeVisible();
    await expect(engines.getByRole('cell', { name: '百度', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    const deleted = await fetch(`${appOrigin}/api/websites/${websiteId}`, {
      method: 'DELETE',
      headers: authHeaders(auth),
      signal: AbortSignal.timeout(10_000),
    });
    expect(deleted.status).toBe(200);
  }
});
