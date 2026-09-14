import { expect, test } from '@playwright/test';
import { uuid } from '../../src/lib/crypto';
import { authHeaders, deleteWebsite, loginPage, umamiUser } from './helpers';

test.use({ actionTimeout: 15_000 });

test('campaign builder reuses parameters, persists links, and connects them to actual UTM traffic', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const auth = await loginPage(page, request);
  const websiteId = uuid();
  const outsideId = uuid();
  const headers = authHeaders(auth);
  for (const id of [websiteId, outsideId]) {
    expect(
      (
        await request.post('/api/websites', {
          headers,
          data: {
            id,
            createdBy: umamiUser.id,
            name: 'Campaign browser fixture',
            domain: 'campaign-test.example',
          },
        })
      ).status(),
    ).toBe(200);
  }
  const collection = `/api/websites/${websiteId}/campaigns`;
  const parameterCollection = `/api/websites/${websiteId}/campaign-parameters`;
  try {
    await page.goto(`/websites/${websiteId}/campaigns?locale=en-US`);
    await page.getByRole('tab', { name: 'Reusable parameters', exact: true }).click();
    await page.getByRole('textbox', { name: 'Parameter value', exact: true }).fill('newsletter');
    await page
      .getByRole('textbox', { name: 'Display label (optional)', exact: true })
      .fill('Newsletter');
    await page.getByTestId('campaign-parameter-save').click();
    const dictionary = page.getByRole('table', { name: 'Reusable parameter dictionary' });
    await expect(dictionary).toContainText('newsletter');
    await page.getByRole('textbox', { name: 'Parameter value', exact: true }).fill('newsletter');
    await page.getByTestId('campaign-parameter-save').click();
    await expect(page.getByRole('textbox', { name: 'Parameter value', exact: true })).toHaveValue(
      '',
    );
    const presets = await (await request.get(parameterCollection, { headers })).json();
    expect(presets.count).toBe(1);
    expect(presets.data[0].label).toBe('Newsletter');
    await dictionary.getByRole('button', { name: 'Use', exact: true }).click();
    await expect(
      page.getByRole('textbox', { name: 'Source (utm_source) *', exact: true }),
    ).toHaveValue('newsletter');
    await page.getByRole('textbox', { name: 'Link name', exact: true }).fill('Newsletter launch');
    await page
      .getByRole('textbox', { name: 'Destination URL', exact: true })
      .fill(
        'https://campaign-test.example/?products/&keep=a%2Bb&utm_source=old&utm_campaign=old#offer',
      );
    await page.getByRole('textbox', { name: 'Medium (utm_medium)', exact: true }).fill('email');
    await page
      .getByRole('textbox', { name: 'Campaign (utm_campaign)', exact: true })
      .fill('Spring sale');
    const expected =
      'https://campaign-test.example/?products/&keep=a%2Bb&utm_source=newsletter&utm_medium=email&utm_campaign=Spring%20sale#offer';
    await expect(page.getByRole('textbox', { name: 'Generated link', exact: true })).toHaveValue(
      expected,
    );
    await page.getByRole('button', { name: 'Copy campaign link', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
    await page.getByTestId('campaign-save').click();
    const saved = page.getByRole('table', { name: 'Saved links' });
    await expect(saved).toContainText('Newsletter launch');
    const records = await (await request.get(collection, { headers })).json();
    expect(records.count).toBe(1);
    expect(records.data[0].url).toBe(expected);
    const campaignId = records.data[0].id;
    expect(
      (
        await request.put(`/api/websites/${outsideId}/campaigns/${campaignId}`, {
          headers,
          data: { name: 'Wrong website' },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await request.delete(
          `/api/websites/${outsideId}/campaign-parameters/${presets.data[0].id}`,
          { headers },
        )
      ).status(),
    ).toBe(404);

    const timestamp = Math.floor(Date.now() / 1000) - 90;
    let cache: string | undefined;
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
            hostname: 'campaign-test.example',
            url: expected,
            timestamp: timestamp + offset,
          },
        },
      });
      expect(sent.status()).toBe(200);
      cache = (await sent.json()).cache;
    }
    const report = await request.post('/api/reports/utm', {
      headers,
      data: {
        websiteId,
        type: 'utm',
        filters: { utmSource: 'eq.newsletter' },
        parameters: {
          startDate: new Date((timestamp - 60) * 1000).toISOString(),
          endDate: new Date().toISOString(),
        },
      },
    });
    expect(report.status()).toBe(200);
    const analytics = await report.json();
    expect(Number(analytics.utm_source.find((row: any) => row.utm === 'newsletter').views)).toBe(2);
    await saved.getByRole('button', { name: 'Analyze', exact: true }).click();
    await expect(page).toHaveURL(/\/utm\?/);
    expect(new URL(page.url()).searchParams.get('utmSource')).toBe('eq.newsletter');
    expect(new URL(page.url()).searchParams.get('utmCampaign')).toBe('eq.Spring sale');

    await page.goto(`/websites/${websiteId}/campaigns?locale=en-US`);
    await expect(saved).toContainText('Newsletter launch');
    await saved.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('textbox', { name: 'Link name', exact: true }).fill('Renamed campaign');
    await page.getByTestId('campaign-save').click();
    await expect(saved).toContainText('Renamed campaign');
    await page.getByRole('tab', { name: 'Reusable parameters', exact: true }).click();
    await dictionary.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('textbox', { name: 'Parameter value', exact: true }).fill('social');
    await page.getByTestId('campaign-parameter-save').click();
    await expect(dictionary).toContainText('social');
    const afterPresetEdit = await (await request.get(collection, { headers })).json();
    expect(afterPresetEdit.data[0].url).toBe(expected);
    expect((await request.post(`/api/websites/${websiteId}/reset`, { headers })).status()).toBe(
      200,
    );
    expect((await (await request.get(collection, { headers })).json()).count).toBe(1);
    expect((await (await request.get(parameterCollection, { headers })).json()).count).toBe(1);
    await dictionary.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(dictionary).not.toContainText('social');
    await page.getByRole('tab', { name: 'Campaign links', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('campaign-builder.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await saved.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(saved).not.toContainText('Renamed campaign');
    expect((await (await request.get(collection, { headers })).json()).count).toBe(0);
  } finally {
    await deleteWebsite(request, auth, websiteId);
    await deleteWebsite(request, auth, outsideId);
  }
});
