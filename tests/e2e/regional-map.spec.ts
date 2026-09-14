import { expect, test } from '@playwright/test';
import { uuid } from '../../src/lib/crypto';
import { authHeaders, deleteWebsite, loginPage, umamiUser } from './helpers';

test('geography map drills into real US/CN boundaries and distinguishes Europe from EU', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const auth = await loginPage(page, request);
  const websiteId = uuid();
  const created = await request.post('/api/websites', {
    headers: authHeaders(auth),
    data: {
      id: websiteId,
      createdBy: umamiUser.id,
      name: 'Regional map verification',
      domain: 'map-test.example',
    },
  });
  expect(created.status()).toBe(200);
  try {
    for (const [index, country, region] of [
      [1, 'US', 'CA'],
      [2, 'CN', 'GD'],
      [3, 'DE', 'BE'],
      [4, 'GB', 'ENG'],
      [5, 'CY', '01'],
    ] as const) {
      const response = await request.post('/api/send', {
        headers: {
          'x-forwarded-for': `203.0.113.${index}`,
          'cf-ipcountry': country,
          'cf-region-code': region,
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
        },
        data: {
          type: 'event',
          payload: { website: websiteId, hostname: 'map-test.example', url: '/map-test' },
        },
      });
      expect(response.status()).toBe(200);
    }
    await page.goto(`/websites/${websiteId}?date=0day`);
    const map = page.getByTestId('geography-map');
    await map.scrollIntoViewIfNeeded();
    await expect(map.getByTestId('map-area-US')).toBeVisible();
    // The multi-polygon's bounding box includes Alaska and Hawaii; its midpoint
    // is not necessarily inside the mainland. Exercise its keyboard interaction.
    await map.getByTestId('map-area-US').focus();
    await map.getByTestId('map-area-US').press('Enter');
    await expect(map.locator('[data-test^="map-area-US-"]')).toHaveCount(51);
    const mapBox = await map.boundingBox();
    const canvasBox = await map.getByTestId('map-canvas').boundingBox();
    expect(canvasBox.width).toBeGreaterThan(mapBox.width * 0.9);
    expect(canvasBox.height).toBeGreaterThanOrEqual(480);
    await expect(page).toHaveURL(/country=eq.US/);
    await expect(map.getByTestId('map-region-table')).toContainText('California');
    await map.getByRole('button', { name: 'Zoom in', exact: true }).click();
    const regionScroll = map.getByTestId('map-region-scroll');
    const targetState = regionScroll.getByRole('button', { name: 'Texas', exact: true });
    await targetState.scrollIntoViewIfNeeded();
    await map
      .getByTestId('map-canvas')
      .evaluate(element => element.setAttribute('data-preserved', 'true'));
    const beforeRegionClick = await map.evaluate(element => ({
      page: window.scrollY,
      top: element.getBoundingClientRect().top,
      list: element.querySelector('[data-test="map-region-scroll"]').scrollTop,
      transform: element.querySelector('.rsm-zoomable-group').getAttribute('transform'),
    }));
    expect(beforeRegionClick.list).toBeGreaterThan(0);
    const stateMetrics = page.waitForResponse(response => {
      const url = new URL(response.url());
      return (
        url.pathname === `/api/websites/${websiteId}/metrics` &&
        url.searchParams.get('type') === 'region' &&
        url.searchParams.get('region') === 'eq.US-TX'
      );
    });
    const targetBox = await targetState.boundingBox();
    await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
    expect((await stateMetrics).status()).toBe(200);
    await expect(page).toHaveURL(/region=eq.US-TX/);
    await expect(map.locator('[aria-busy]')).toHaveAttribute('aria-busy', 'false');
    await expect(map.getByTestId('map-canvas')).toHaveAttribute('data-preserved', 'true');
    const afterRegionClick = await map.evaluate(element => ({
      page: window.scrollY,
      top: element.getBoundingClientRect().top,
      list: element.querySelector('[data-test="map-region-scroll"]').scrollTop,
      transform: element.querySelector('.rsm-zoomable-group').getAttribute('transform'),
    }));
    expect(afterRegionClick.page).toBeCloseTo(beforeRegionClick.page, 0);
    expect(afterRegionClick.top).toBeCloseTo(beforeRegionClick.top, 0);
    expect(afterRegionClick.list).toBeCloseTo(beforeRegionClick.list, 0);
    expect(afterRegionClick.transform).toBe(beforeRegionClick.transform);
    await map.getByRole('button', { name: 'Reset zoom', exact: true }).click();
    await map.getByTestId('map-area-US-CA').click();
    await expect(page).toHaveURL(/region=eq.US-CA/);
    await expect(map.getByTestId('map-region-table')).toContainText('California');
    await page.mouse.move(0, 0);
    await map.screenshot({ path: testInfo.outputPath('map-us.png') });

    await map.getByTestId('map-scope-CN').click();
    await expect(map.locator('[data-test^="map-area-CN-"]')).toHaveCount(31);
    await expect(map.getByTestId('map-region-table')).toContainText('Guangdong');
    await map.getByTestId('map-area-CN-GD').click();
    await expect(page).toHaveURL(/region=eq.CN-GD/);
    await expect(map.getByTestId('map-region-table')).toContainText('Guangdong');
    await page.mouse.move(0, 0);
    await map.screenshot({ path: testInfo.outputPath('map-china.png') });

    await map.getByTestId('map-scope-Europe').click();
    await expect(map.getByTestId('map-area-GB')).toBeVisible();
    await expect(map.getByTestId('map-area-CY')).toBeVisible();
    const euMetrics = page.waitForResponse(response => {
      const url = new URL(response.url());
      return (
        url.pathname === `/api/websites/${websiteId}/metrics` &&
        url.searchParams.get('type') === 'country' &&
        url.searchParams.get('country')?.split(',').length === 27
      );
    });
    await map.getByRole('switch').check();
    expect((await euMetrics).status()).toBe(200);
    await expect(map.locator('[data-test^="map-area-"]')).toHaveCount(27);
    await expect(map.getByTestId('map-area-GB')).toHaveCount(0);
    await expect(map.getByTestId('map-area-CY')).toBeVisible();
    await expect(map.getByTestId('map-area-MT')).toBeVisible();
    await expect(map.getByTestId('map-region-table')).toContainText('Germany');
    await expect(
      map.getByTestId('map-region-table').getByRole('row', { name: 'Germany 1', exact: true }),
    ).toBeVisible();
    await expect(map.getByTestId('map-region-table')).not.toContainText('United Kingdom');
    await expect(map.locator('[aria-busy]')).toHaveAttribute('aria-busy', 'false');
    await page.mouse.move(0, 0);
    await map.screenshot({ path: testInfo.outputPath('map-eu.png') });

    await page.setViewportSize({ width: 390, height: 844 });
    await map.scrollIntoViewIfNeeded();
    const box = await map.boundingBox();
    expect(box.width).toBeLessThanOrEqual(390);
    await expect(map.getByTestId('map-region-table')).toContainText('Germany');
    await expect(
      map.getByTestId('map-region-table').getByRole('row', { name: 'Germany 1', exact: true }),
    ).toBeVisible();
    await expect(map.locator('[aria-busy]')).toHaveAttribute('aria-busy', 'false');
    await map.screenshot({ path: testInfo.outputPath('map-mobile.png') });
  } finally {
    await deleteWebsite(request, auth, websiteId);
  }
});
