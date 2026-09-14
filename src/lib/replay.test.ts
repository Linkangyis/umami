import { expect, test } from 'vitest';
import {
  canReplayEvents,
  getReplayEventCount,
  getReplayPages,
  getReplayPlayerEvents,
  getReplayViewport,
  hasReplayableFullSnapshot,
  hasReplayFullSnapshot,
  hasReplayMeta,
  REPLAY_EVENT_FRAGMENT_TYPE,
  restoreReplayEventFragments,
} from './replay';

test('getReplayPages distinguishes query and hash routes and skips duplicate checkout metadata', () => {
  const events = [
    { type: 4, timestamp: 1000, data: { href: 'https://bolebricks.com/?products/' } },
    { type: 4, timestamp: 2000, data: { href: 'https://bolebricks.com/?products/&utm_source=ad' } },
    {
      type: 5,
      timestamp: 3000,
      data: { tag: 'url-change', payload: { url: '/?products-2/100.html' } },
    },
    { type: 5, timestamp: 4000, data: { tag: 'url-change', payload: { url: '/#/cart' } } },
    { type: 4, timestamp: 5000, data: { href: '/about' } },
    { type: 5, timestamp: 6000, data: { tag: 'url-change', payload: { url: '/?products/' } } },
  ];

  expect(getReplayPages(events)).toEqual([
    { path: '/?products/', timestamp: 1000, offset: 0 },
    { path: '/?products-2/100.html', timestamp: 3000, offset: 2000 },
    { path: '/#/cart', timestamp: 4000, offset: 3000 },
    { path: '/about', timestamp: 5000, offset: 4000 },
    { path: '/?products/', timestamp: 6000, offset: 5000 },
  ]);
});

test('getReplayPages preserves legacy paths without inventing missing pages', () => {
  expect(getReplayPages([{ type: 4, timestamp: 1000, data: { href: '/' } }])).toEqual([
    { path: '/', timestamp: 1000, offset: 0 },
  ]);
  expect(getReplayPages([{ type: 2, timestamp: 1000 }])).toEqual([]);
  expect(getReplayPages(null)).toEqual([]);
});

const fullSnapshot = {
  type: 2,
  timestamp: 1781553116151,
  data: {
    node: {
      type: 0,
      id: 1,
      childNodes: [{ type: 2, id: 2, tagName: 'html', attributes: {}, childNodes: [] }],
    },
    initialOffset: { left: 0, top: 0 },
  },
};

test('hasReplayFullSnapshot returns true when a full snapshot is present', () => {
  expect(hasReplayFullSnapshot([{ type: 4 }, { type: 2 }, { type: 3 }])).toBe(true);
});

test('hasReplayMeta returns true when a meta event is present', () => {
  expect(hasReplayMeta([{ type: 4 }, { type: 2 }, { type: 3 }])).toBe(true);
});

test('getReplayViewport returns the recorded viewport dimensions', () => {
  expect(getReplayViewport(null)).toBe(null);
  expect(getReplayViewport([{ type: 4, data: { width: 0, height: 768 } }])).toBe(null);
  expect(getReplayViewport([{ type: 4, data: { width: '1024', height: '1365' } }])).toEqual({
    width: 1024,
    height: 1365,
  });
});

test('hasReplayableFullSnapshot returns true when a usable full snapshot is present', () => {
  expect(hasReplayableFullSnapshot([{ type: 4 }, fullSnapshot, { type: 3 }])).toBe(true);
});

test('canReplayEvents requires events that can be normalized with a full snapshot', () => {
  expect(canReplayEvents([{ type: 4, timestamp: 1781553116150 }, fullSnapshot])).toBe(true);
  expect(canReplayEvents([fullSnapshot])).toBe(true);
  expect(canReplayEvents([{ type: 4, timestamp: 1781553116150 }, { type: 2 }])).toBe(false);
  expect(canReplayEvents([{ type: 4, timestamp: 1781553116150 }, { type: 3 }])).toBe(false);
  expect(canReplayEvents([{ ...fullSnapshot, timestamp: undefined }])).toBe(true);
});

test('getReplayPlayerEvents normalizes events for rrweb-player', () => {
  expect(getReplayPlayerEvents(null)).toEqual([]);
  expect(getReplayPlayerEvents([{ type: 3, timestamp: 1781553116160 }])).toEqual([]);

  expect(getReplayPlayerEvents([fullSnapshot])).toEqual([
    fullSnapshot,
    { ...fullSnapshot, timestamp: fullSnapshot.timestamp + 1 },
  ]);

  expect(
    getReplayPlayerEvents([
      { type: 0, timestamp: '1781553116149' },
      { ...fullSnapshot, timestamp: undefined },
    ]),
  ).toEqual([
    { type: 0, timestamp: 1781553116149 },
    { ...fullSnapshot, timestamp: 1781553116150 },
  ]);
});

test('hasReplayFullSnapshot returns false when only incremental events are present', () => {
  expect(hasReplayFullSnapshot([{ type: 4 }, { type: 3 }, { type: 3 }])).toBe(false);
});

test('hasReplayFullSnapshot handles missing events', () => {
  expect(hasReplayFullSnapshot(null)).toBe(false);
  expect(hasReplayFullSnapshot(undefined)).toBe(false);
});

test('restoreReplayEventFragments restores fragmented events', () => {
  const serialized = JSON.stringify(fullSnapshot);
  const splitAt = Math.floor(serialized.length / 2);

  const events = restoreReplayEventFragments([
    { type: 4, timestamp: 1781553116150 },
    {
      type: REPLAY_EVENT_FRAGMENT_TYPE,
      timestamp: fullSnapshot.timestamp,
      data: {
        id: 'snapshot-1',
        index: 0,
        total: 2,
        value: serialized.slice(0, splitAt),
      },
    },
    {
      type: REPLAY_EVENT_FRAGMENT_TYPE,
      timestamp: fullSnapshot.timestamp,
      data: {
        id: 'snapshot-1',
        index: 1,
        total: 2,
        value: serialized.slice(splitAt),
      },
    },
    { type: 3, timestamp: 1781553116160 },
  ]);

  expect(events).toEqual([
    { type: 4, timestamp: 1781553116150 },
    fullSnapshot,
    { type: 3, timestamp: 1781553116160 },
  ]);
  expect(hasReplayFullSnapshot(events)).toBe(true);
});

test('getReplayEventCount counts a fragment group as one event', () => {
  expect(
    getReplayEventCount([
      { type: 4 },
      {
        type: REPLAY_EVENT_FRAGMENT_TYPE,
        data: { id: 'snapshot-1', index: 0, total: 2, value: '{' },
      },
      {
        type: REPLAY_EVENT_FRAGMENT_TYPE,
        data: { id: 'snapshot-1', index: 1, total: 2, value: '}' },
      },
      { type: 3 },
    ]),
  ).toBe(3);
});
