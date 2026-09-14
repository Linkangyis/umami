import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { version } from '../../package.json';

type ScriptName = 'script.js' | 'recorder.js';
const versions = new Map<string, { signature: string; version: string }>();

async function getScriptVersion(name: ScriptName) {
  const file = path.join(process.cwd(), 'public', name);
  try {
    const info = await stat(file);
    const signature = `${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
    const cached = versions.get(file);
    if (cached?.signature === signature) return cached.version;
    // Hash deployed bytes, including runtime COLLECT_API_ENDPOINT replacements.
    const digest = createHash('sha256')
      .update(await readFile(file))
      .digest('hex')
      .slice(0, 16);
    const value = `${version}-${digest}`;
    versions.set(file, { signature, version: value });
    return value;
  } catch {
    // A fresh development checkout may not have generated the browser scripts yet.
    versions.delete(file);
    return undefined;
  }
}

export async function getScriptVersions() {
  // Local bytes cannot identify a script served by an external/cloud override.
  if (process.env.CLOUD_MODE) return {};
  const externalTracker =
    process.env.TRACKER_SCRIPT_URL ||
    /^https?:\/\//i.test(process.env.TRACKER_SCRIPT_NAME?.split(',')[0]?.trim() || '');
  const [tracker, recorder] = await Promise.all([
    externalTracker ? undefined : getScriptVersion('script.js'),
    getScriptVersion('recorder.js'),
  ]);
  return { tracker, recorder };
}
