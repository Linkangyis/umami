import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { version } from '../../package.json';

const { stat, readFile } = vi.hoisted(() => ({ stat: vi.fn(), readFile: vi.fn() }));
vi.mock('node:fs/promises', () => ({ stat, readFile, default: { stat, readFile } }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('CLOUD_MODE', '');
  vi.stubEnv('TRACKER_SCRIPT_URL', '');
  vi.stubEnv('TRACKER_SCRIPT_NAME', '');
  stat.mockResolvedValue({ size: 10, mtimeMs: 1, ctimeMs: 1 });
  readFile.mockResolvedValue(Buffer.from('initial script bytes'));
});
afterEach(() => vi.unstubAllEnvs());

test('versions match content hashes and do not change with a fresh file timestamp alone', async () => {
  const { getScriptVersions } = await import('./script-versions');
  const expected = `${version}-${createHash('sha256').update('initial script bytes').digest('hex').slice(0, 16)}`;
  expect(await getScriptVersions()).toEqual({ tracker: expected, recorder: expected });
  await getScriptVersions();
  expect(readFile).toHaveBeenCalledTimes(2);
  stat.mockResolvedValue({ size: 10, mtimeMs: 2, ctimeMs: 2 });
  expect(await getScriptVersions()).toEqual({ tracker: expected, recorder: expected });
});

test('runtime collector endpoint replacement changes the version even if package version stays fixed', async () => {
  const { getScriptVersions } = await import('./script-versions');
  readFile.mockResolvedValue(Buffer.from("fetch('/api/send')"));
  const original = await getScriptVersions();
  stat.mockResolvedValue({ size: 10, mtimeMs: 3, ctimeMs: 3 });
  readFile.mockResolvedValue(Buffer.from("fetch('/collect')"));
  const updated = await getScriptVersions();
  expect(updated.tracker).not.toBe(original.tracker);
  expect(updated.tracker).toMatch(new RegExp(`^${version.replaceAll('.', '\\.')}-.{16}$`));
});

test('does not invent a version for missing files or externally served scripts', async () => {
  const { getScriptVersions } = await import('./script-versions');
  stat.mockRejectedValue(new Error('missing'));
  expect(await getScriptVersions()).toEqual({ tracker: undefined, recorder: undefined });
  vi.stubEnv('CLOUD_MODE', '1');
  expect(await getScriptVersions()).toEqual({});
  vi.stubEnv('CLOUD_MODE', '');
  vi.stubEnv('TRACKER_SCRIPT_URL', 'https://external.example/signed.js?signature=abc');
  stat.mockResolvedValue({ size: 10, mtimeMs: 1, ctimeMs: 1 });
  expect((await getScriptVersions()).tracker).toBeUndefined();
  expect((await getScriptVersions()).recorder).toBeTruthy();
  vi.stubEnv('TRACKER_SCRIPT_URL', '');
  vi.stubEnv('TRACKER_SCRIPT_NAME', 'https://external.example/signed.js?signature=abc');
  expect((await getScriptVersions()).tracker).toBeUndefined();
});
