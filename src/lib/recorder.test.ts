import { describe, expect, test } from 'vitest';
import { getRecorderConfig, getRecorderEnabled, getRecorderPagePath } from './recorder';

describe('getRecorderPagePath', () => {
  test.each([
    ['https://bolebricks.com/?products/', '/?products/'],
    ['https://bolebricks.com/?products-2/100.html', '/?products-2/100.html'],
    ['/?products/&utm_source=ad&gclid=123', '/?products/'],
    ['/about?category=bricks&utm_campaign=sale&sort=price', '/about?category=bricks&sort=price'],
    ['/about', '/about'],
    ['https://example.com/#/products?category=bricks&utm_source=ad', '/#/products?category=bricks'],
    ['/#!/products/100', '/#!/products/100'],
    ['/about#team', '/about#team'],
    ['/?path=%2Fproducts%2F100&token=a%2Bb', '/?path=%2Fproducts%2F100&token=a%2Bb'],
    ['/?utm_source=ad&fbclid=123', '/'],
  ])('preserves page identity for %s', (href, path) => {
    expect(getRecorderPagePath(href)).toBe(path);
  });

  test('does not invent a URL for malformed or missing metadata', () => {
    expect(getRecorderPagePath(undefined)).toBeNull();
    expect(getRecorderPagePath('not a url')).toBeNull();
    expect(getRecorderPagePath('javascript:alert(1)')).toBeNull();
  });
});

describe('getRecorderConfig', () => {
  test('returns an empty object for non-object values', () => {
    expect(getRecorderConfig(null)).toEqual({});
    expect(getRecorderConfig(undefined)).toEqual({});
    expect(getRecorderConfig('x')).toEqual({});
    expect(getRecorderConfig([1, 2])).toEqual({});
  });

  test('only keeps boolean enabled flags that are strictly true', () => {
    expect(getRecorderConfig({ replayEnabled: true, heatmapEnabled: false })).toEqual({
      replayEnabled: true,
    });
    expect(getRecorderConfig({ replayEnabled: 'true' })).toEqual({});
  });

  test('keeps numeric sample rates', () => {
    expect(getRecorderConfig({ sampleRate: 0.5, heatmapSampleRate: 1 })).toEqual({
      sampleRate: 0.5,
      heatmapSampleRate: 1,
    });
    expect(getRecorderConfig({ sampleRate: '0.5' })).toEqual({});
  });

  test('only accepts known mask levels', () => {
    expect(getRecorderConfig({ maskLevel: 'strict' })).toEqual({ maskLevel: 'strict' });
    expect(getRecorderConfig({ maskLevel: 'moderate' })).toEqual({ maskLevel: 'moderate' });
    expect(getRecorderConfig({ maskLevel: 'loose' })).toEqual({});
  });

  test('rounds finite maxDuration and rejects non-finite values', () => {
    expect(getRecorderConfig({ maxDuration: 12.6 })).toEqual({ maxDuration: 13 });
    expect(getRecorderConfig({ maxDuration: Infinity })).toEqual({});
    expect(getRecorderConfig({ maxDuration: NaN })).toEqual({});
  });

  test('keeps a string blockSelector', () => {
    expect(getRecorderConfig({ blockSelector: '.hidden' })).toEqual({ blockSelector: '.hidden' });
    expect(getRecorderConfig({ blockSelector: 5 })).toEqual({});
  });
});

describe('getRecorderEnabled', () => {
  test('is true when replay or heatmap is enabled', () => {
    expect(getRecorderEnabled({ replayEnabled: true })).toBe(true);
    expect(getRecorderEnabled({ heatmapEnabled: true })).toBe(true);
  });

  test('is false otherwise', () => {
    expect(getRecorderEnabled({})).toBe(false);
    expect(getRecorderEnabled(null)).toBe(false);
    expect(getRecorderEnabled({ sampleRate: 1 })).toBe(false);
  });
});
