import { expect, test } from 'vitest';
import {
  brandingSchema,
  DEFAULT_BRANDING,
  getBrandTitle,
  isBrandLogo,
  MAX_BRAND_LOGO_BYTES,
  sanitizeBranding,
} from './branding';

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMfoAAAAASUVORK5CYII=';

test('validates application names and accepts supported uploaded or hosted logos', () => {
  expect(brandingSchema.parse({ appName: '  星图统计  ', logoUrl: png })).toEqual({
    appName: '星图统计',
    logoUrl: png,
  });
  expect(isBrandLogo('https://cdn.example/logo.png')).toBe(true);
  expect(isBrandLogo('/favicon-32x32.png')).toBe(true);
  expect(isBrandLogo('')).toBe(true);
  for (const appName of ['', 'x'.repeat(81), 'name\nscript']) {
    expect(brandingSchema.safeParse({ appName }).success).toBe(false);
  }
});

test('rejects executable data, misleading image MIME types, unsafe URLs and oversize logos', () => {
  for (const logo of [
    'javascript:alert(1)',
    '//evil.example/logo.png',
    'http://example.com/logo.png',
    'https://name:password@example.com/logo.png',
    'data:image/svg+xml;base64,PHN2Zy8+',
    'data:text/html;base64,PHNjcmlwdD4=',
    'data:image/png;base64,PHNjcmlwdD4=',
    png.replace('image/png', 'image/jpeg'),
    `data:image/png;base64,${btoa('x'.repeat(MAX_BRAND_LOGO_BYTES + 1))}`,
  ])
    expect(isBrandLogo(logo)).toBe(false);
});

test('sanitizes persisted settings and exposes only appName and logoUrl', () => {
  expect(
    sanitizeBranding({ appName: 'Analytics', logoUrl: '/logo.png', privateKey: 'hidden' }),
  ).toEqual({ appName: 'Analytics', logoUrl: '/logo.png' });
  expect(sanitizeBranding({ appName: 'Analytics', logoUrl: 'javascript:alert(1)' })).toEqual(
    DEFAULT_BRANDING,
  );
  expect(getBrandTitle(DEFAULT_BRANDING)).toBe('Umami');
  expect(getBrandTitle({ appName: '星图统计', logoUrl: '' })).toBe('星图统计');
});
