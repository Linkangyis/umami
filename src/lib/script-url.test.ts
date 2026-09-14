import { expect, test } from 'vitest';
import { withScriptVersion } from './script-url';

test('uses a stable version on the existing script path', () => {
  const url = 'https://stats.example/analytics/script.js';
  expect(withScriptVersion(url, '3.3.1-abcd')).toBe(`${url}?v=3.3.1-abcd`);
  expect(withScriptVersion(withScriptVersion(url, '3.3.1-abcd'), '3.3.1-abcd')).toBe(
    `${url}?v=3.3.1-abcd`,
  );
  expect(withScriptVersion(url)).toBe(url);
});

test('preserves custom URL query spelling and fragments when replacing a version', () => {
  expect(withScriptVersion('/tracker.js?products/&tenant=a%2Bb&v=old#anchor', 'new')).toBe(
    '/tracker.js?products/&tenant=a%2Bb&v=new#anchor',
  );
  expect(withScriptVersion('/recorder.js?tenant=x', 'build version')).toBe(
    '/recorder.js?tenant=x&v=build%20version',
  );
});
