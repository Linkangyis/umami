import { expect, test } from 'vitest';
import { createEventRuleSchema, matchesEventRule, updateEventRuleSchema } from './event-rules';

const rule = { name: 'Buy product', selector: '#buy', urlPath: '/?products/100.html' };

test('normalizes URL rules without collapsing query routes or hash routes', () => {
  expect(createEventRuleSchema.parse(rule)).toMatchObject({
    ...rule,
    eventType: 'click',
    matchType: 'exact',
    isEnabled: true,
  });
  expect(
    createEventRuleSchema.parse({
      ...rule,
      urlPath: 'https://shop.example/?products/100.html&utm_source=mail#/detail?gclid=1',
    }).urlPath,
  ).toBe('/?products/100.html#/detail');
  expect(
    matchesEventRule(
      { urlPath: '/?products/100.html', matchType: 'exact' },
      'https://shop.example/?products/100.html&utm_source=mail',
    ),
  ).toBe(true);
  expect(
    matchesEventRule({ urlPath: '/?products/100.html', matchType: 'exact' }, '/?products/101.html'),
  ).toBe(false);
  expect(
    matchesEventRule({ urlPath: '/#/products/', matchType: 'prefix' }, '/#/products/101'),
  ).toBe(true);
  expect(matchesEventRule({ urlPath: '/', matchType: 'all' }, '/?products/101.html')).toBe(true);
  expect(matchesEventRule({ urlPath: '/', matchType: 'all' }, 'javascript:alert(1)')).toBe(false);
});

test.each(['', '=SUM(1)', '+formula', '-formula', '@formula', 'a'.repeat(51), 'line\nbreak'])(
  'rejects unsafe or out-of-range event name %j',
  name => {
    expect(createEventRuleSchema.safeParse({ ...rule, name }).success).toBe(false);
  },
);

test('validates selector, route, types and partial updates', () => {
  for (const invalid of [
    { selector: '' },
    { selector: 'x'.repeat(501) },
    { urlPath: 'javascript:alert(1)' },
    { urlPath: `/${'x'.repeat(2183)}` },
    { urlPath: `/${'页'.repeat(500)}` },
    { matchType: 'regex' },
    { eventType: 'change' },
    { isEnabled: 'true' },
  ])
    expect(createEventRuleSchema.safeParse({ ...rule, ...invalid }).success).toBe(false);
  expect(updateEventRuleSchema.safeParse({}).success).toBe(false);
  expect(updateEventRuleSchema.safeParse({ websiteId: 'other-site' }).success).toBe(false);
  expect(updateEventRuleSchema.parse({ isEnabled: false, websiteId: 'other-site' })).toEqual({
    isEnabled: false,
  });
});
