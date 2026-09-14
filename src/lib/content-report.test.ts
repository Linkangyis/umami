import { expect, test } from 'vitest';
import {
  contentGroupSchema,
  contentMetrics,
  contentRoute,
  matchesContentGroup,
} from './content-report';

test('full routes retain query-based pages and put queries before hash fragments', () => {
  expect(contentRoute('/', 'products/')).toBe('/?products/');
  expect(contentRoute('/item#specs', 'id=1&source=ad')).toBe('/item?id=1&source=ad#specs');
  expect(contentRoute('/item#specs')).toBe('/item#specs');
});

test('dwell excludes unmeasurable final views instead of inventing zero duration', () => {
  expect(contentMetrics({ pageviews: 4, dwellSamples: 2, dwellSeconds: 90 })).toMatchObject({
    averageDwell: 45,
    dwellCoverage: 50,
  });
  expect(contentMetrics({ pageviews: 1 })).toMatchObject({ averageDwell: null, dwellCoverage: 0 });
  expect(contentMetrics({ pageviews: 4, entrances: 2, bounces: 1, exits: 1 })).toMatchObject({
    bounceRate: 50,
    exitRate: 25,
  });
});

test('group rules preserve literal wildcard characters and use OR without duplicates', () => {
  const page = { path: '/', query: 'products/discount=20%', hostname: 'SHOP.EXAMPLE' };
  expect(
    matchesContentGroup([{ field: 'route', operator: 'prefix', value: '/?products/' }], page),
  ).toBe(true);
  expect(matchesContentGroup([{ field: 'route', operator: 'contains', value: '%' }], page)).toBe(
    true,
  );
  expect(matchesContentGroup([{ field: 'route', operator: 'contains', value: '_' }], page)).toBe(
    false,
  );
  expect(
    matchesContentGroup([{ field: 'hostname', operator: 'exact', value: 'shop.example' }], page),
  ).toBe(true);
  expect(contentGroupSchema.safeParse({ name: ' ', rules: [] }).success).toBe(false);
  expect(
    contentGroupSchema.safeParse({
      name: 'Pages',
      rules: [{ field: 'sql', operator: 'prefix', value: '/' }],
    }).success,
  ).toBe(false);
});
