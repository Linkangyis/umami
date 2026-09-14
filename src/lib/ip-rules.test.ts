import { expect, test } from 'vitest';
import { createIpRuleSchema, matchesIpRule, parseIpRule, updateIpRuleSchema } from './ip-rules';

test.each([
  ['192.0.2.129/24', '192.0.2.0/24'],
  ['2001:db8:abcd::1/32', '2001:db8::/32'],
  ['::ffff:192.0.2.9/120', '192.0.2.0/24'],
  ['::ffff:192.0.2.9', '192.0.2.9'],
  [' 192.0.2.1 - 192.0.2.5 ', '192.0.2.1-192.0.2.5'],
  ['0.0.0.0/0', '0.0.0.0/0'],
  ['2001:db8::/0', '::/0'],
])('normalizes %s', (value, expected) => {
  expect(parseIpRule(value)?.pattern).toBe(expected);
});

test.each([
  '',
  '127.1',
  '0177.0.0.1',
  '0x7f000001',
  '1.2.3.256',
  '1.2.3.4:80',
  'fe80::1%eth0',
  '[::1]',
  'example.com',
  '1.2.3.4/-1',
  '1.2.3.4/33',
  '::/129',
  '::ffff:192.0.2.1/80',
  '1.2.3.4-::1',
  '1.2.3.5-1.2.3.4',
  '1.2.3.4/a',
  '1.2.3.4//8',
])('rejects invalid rule %s', value => expect(parseIpRule(value)).toBeNull());

test('includes range endpoints and maps IPv4-in-IPv6 consistently', () => {
  for (const ip of ['192.0.2.0', '192.0.2.255', '::ffff:192.0.2.8']) {
    expect(matchesIpRule(ip, '192.0.2.0/24')).toBe(true);
  }
  expect(matchesIpRule('192.0.3.0', '192.0.2.0/24')).toBe(false);
  expect(matchesIpRule('2001:db8::ffff', '2001:db8::1-2001:db8::ffff')).toBe(true);
  expect(matchesIpRule('2001:db8::', '2001:db8::1-2001:db8::ffff')).toBe(false);
  expect(matchesIpRule('::1', '0.0.0.0/0')).toBe(false);
  expect(matchesIpRule('bad', '::/0')).toBe(false);
});

test('schemas normalize patterns and reject unknown or empty updates', () => {
  expect(createIpRuleSchema.parse({ pattern: '192.0.2.3/24' })).toEqual({
    pattern: '192.0.2.0/24',
    name: '',
    isEnabled: true,
  });
  expect(updateIpRuleSchema.parse({ isEnabled: false })).toEqual({ isEnabled: false });
  expect(updateIpRuleSchema.safeParse({}).success).toBe(false);
  expect(createIpRuleSchema.safeParse({ pattern: '::1', websiteId: 'untrusted' }).success).toBe(
    false,
  );
});
