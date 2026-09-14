import { expect, test } from 'vitest';
import { getMatchingRules, type TrackingRule } from './rules';

const rule: TrackingRule = {
  id: 'rule',
  name: 'contact-click',
  selector: '#contact',
  urlPath: '/?products/',
  matchType: 'exact',
  eventType: 'click',
};

test('matches nested elements on query routes without merging them with home', () => {
  document.body.innerHTML = '<button id="contact"><span>Contact</span></button>';
  const element = document.querySelector('span');
  expect(
    getMatchingRules([rule], element, 'click', 'https://example.com/?products/&utm_source=test'),
  ).toEqual([rule]);
  expect(getMatchingRules([rule], element, 'click', 'https://example.com/')).toEqual([]);
  expect(getMatchingRules([rule], element, 'click', 'https://example.com/?products-2/')).toEqual(
    [],
  );
});

test('supports page groups, all pages and form submission independently', () => {
  document.body.innerHTML = '<form id="contact"></form>';
  const element = document.querySelector('form');
  const prefix: TrackingRule = {
    ...rule,
    urlPath: '/#/products/',
    matchType: 'prefix',
    eventType: 'submit',
  };
  expect(
    getMatchingRules([prefix], element, 'submit', 'https://example.com/#/products/100'),
  ).toEqual([prefix]);
  expect(
    getMatchingRules([prefix], element, 'click', 'https://example.com/#/products/100'),
  ).toEqual([]);
  expect(
    getMatchingRules(
      [{ ...rule, matchType: 'all' }],
      element,
      'click',
      'https://example.com/about',
    ),
  ).toHaveLength(1);
});

test('invalid selectors never break event handling', () => {
  expect(
    getMatchingRules(
      [{ ...rule, selector: '[' }],
      document.body,
      'click',
      'https://example.com/?products/',
    ),
  ).toEqual([]);
});
