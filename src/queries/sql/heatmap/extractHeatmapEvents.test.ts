import { expect, test } from 'vitest';
import { extractHeatmapEvents } from './extractHeatmapEvents';

test('extracts distinct query and hash route pages from replay navigation', () => {
  const click = { type: 3, timestamp: 1000, data: { source: 2, type: 2, x: 10, y: 20 } };
  const events = [
    { type: 4, data: { href: 'https://bolebricks.com/?products/', width: 1280, height: 720 } },
    click,
    {
      type: 5,
      data: { tag: 'url-change', payload: { url: '/?products-2/100.html&utm_source=ad' } },
    },
    click,
    { type: 5, data: { tag: 'url-change', payload: { url: '/#/cart' } } },
    click,
    { type: 5, data: { tag: 'scroll-progress', payload: { url: '/about', scrollPct: 75 } } },
  ];

  expect(extractHeatmapEvents(events).map(event => event.urlPath)).toEqual([
    '/?products/',
    '/?products-2/100.html',
    '/#/cart',
    '/about',
  ]);
});

test('retains historical pathname-only events without reconstructing lost queries', () => {
  expect(
    extractHeatmapEvents([
      { type: 4, data: { href: '/' } },
      { type: 3, data: { source: 2, type: 2, x: 10, y: 20 } },
    ])[0].urlPath,
  ).toBe('/');
  expect(extractHeatmapEvents([{ type: 3, data: { source: 2, type: 2 } }])).toEqual([]);
});
