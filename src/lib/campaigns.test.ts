import { expect, test } from 'vitest';
import {
  buildCampaignUrl,
  campaignAnalysisUrl,
  campaignLinkSchema,
  campaignLinkUpdateSchema,
  campaignParameterUpdateSchema,
} from './campaigns';

test('preserves PHP bare query routes, existing encoding and fragments while deduplicating UTM keys', () => {
  expect(
    buildCampaignUrl(
      'https://bolebricks.com/?products-2/100.html&keep=a%2Bb&utm_source=old&UTM_SOURCE=duplicate&utm%5Fcampaign=old#details',
      {
        utmSource: '邮件 & 社交',
        utmMedium: 'email',
        utmCampaign: 'spring sale',
        utmTerm: 'a+b',
        utmContent: '',
      },
    ),
  ).toBe(
    'https://bolebricks.com/?products-2/100.html&keep=a%2Bb&utm_source=%E9%82%AE%E4%BB%B6%20%26%20%E7%A4%BE%E4%BA%A4&utm_medium=email&utm_campaign=spring%20sale&utm_term=a%2Bb#details',
  );
});

test('keeps hash-router routes intact and removes optional UTM values when cleared', () => {
  const result = buildCampaignUrl('https://example.com/?x=1&utm_medium=old#/products?sort=price', {
    utmSource: 'newsletter',
  });
  expect(result).toBe('https://example.com/?x=1&utm_source=newsletter#/products?sort=price');
  expect(buildCampaignUrl(result, { utmSource: 'newsletter' })).toBe(result);
});

test.each([
  'javascript:alert(1)',
  'file:///private',
  'https://user:secret@example.com/',
  'not a url',
])('rejects invalid or credential-bearing destinations %s', destination => {
  expect(() => buildCampaignUrl(destination, { utmSource: 'test' })).toThrow();
});

test('rejects empty source and links beyond the collector URL limit', () => {
  expect(() => buildCampaignUrl('https://example.com/', {})).toThrow('source-required');
  expect(() =>
    buildCampaignUrl(`https://example.com/?path=${'a'.repeat(2150)}`, { utmSource: 'newsletter' }),
  ).toThrow('url-too-long');
  expect(
    campaignLinkSchema.safeParse({
      name: 'Link',
      destinationUrl: 'https://example.com',
      utmSource: 'a'.repeat(201),
    }).success,
  ).toBe(false);
});

test('partial updates do not insert create defaults or wipe untouched parameters', () => {
  expect(campaignLinkUpdateSchema.parse({ name: 'Renamed' })).toEqual({ name: 'Renamed' });
  expect(campaignParameterUpdateSchema.parse({ value: 'newsletter' })).toEqual({
    value: 'newsletter',
  });
  expect(campaignLinkUpdateSchema.safeParse({ websiteId: 'other' }).success).toBe(false);
});

test('analysis links use the existing UTM filters without injecting extra query keys', () => {
  const result = new URL(
    campaignAnalysisUrl('site', { utmSource: 'email&country=US', utmCampaign: '春季活动' }),
    'https://analytics.example',
  );
  expect(result.pathname).toBe('/websites/site/utm');
  expect(result.searchParams.get('utmSource')).toBe('eq.email&country=US');
  expect(result.searchParams.get('utmCampaign')).toBe('eq.春季活动');
  expect(result.searchParams.has('country')).toBe(false);
});
