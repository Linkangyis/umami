import { afterEach, expect, test, vi } from 'vitest';
import { getStoredSessionIp, normalizeSessionIp, redactSessionIp } from './session-ip';

afterEach(() => vi.unstubAllEnvs());

test('normalizes IPv4, mapped IPv6, bracketed IPv6 and rejects arbitrary text', () => {
  expect(normalizeSessionIp(' 203.0.113.8:443 ')).toBe('203.0.113.8');
  expect(normalizeSessionIp('::ffff:203.0.113.8')).toBe('203.0.113.8');
  expect(normalizeSessionIp('[2001:0db8::1]:443')).toBe('2001:db8::1');
  expect(normalizeSessionIp('fe80::1%eth0')).toBe('fe80::1');
  for (const value of ['', 'not an IP', '999.1.1.1', '=CMD()', '203.0.113.8, 10.0.0.1']) {
    expect(normalizeSessionIp(value)).toBeNull();
  }
});

test('respects disabled storage and redacts addresses without changing other session fields', () => {
  vi.stubEnv('DISABLE_IP_STORAGE', 'true');
  expect(getStoredSessionIp('203.0.113.8')).toBeNull();
  vi.stubEnv('DISABLE_IP_STORAGE', 'false');
  expect(getStoredSessionIp('203.0.113.8')).toBe('203.0.113.8');
  expect(redactSessionIp({ id: 'one', ip: '203.0.113.8', views: 8 })).toEqual({
    id: 'one',
    views: 8,
  });
});
