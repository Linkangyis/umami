import { randomBytes } from 'node:crypto';

const TTL = 5 * 60 * 1000;

type EditorSession = { websiteId: string; expiresAt: number };
const state = globalThis as typeof globalThis & {
  umamiEditorSessions?: Map<string, EditorSession>;
};
state.umamiEditorSessions ||= new Map<string, EditorSession>();
const sessions = state.umamiEditorSessions;

function purge() {
  const now = Date.now();
  for (const [id, session] of sessions) if (session.expiresAt <= now) sessions.delete(id);
}

export function createEditorSession(websiteId: string) {
  purge();
  const id = randomBytes(24).toString('hex');
  const expiresAt = Date.now() + TTL;
  sessions.set(id, { websiteId, expiresAt });
  return { id, websiteId, expiresAt };
}

export function getEditorSession(id: string) {
  purge();
  const session = sessions.get(id);
  if (!session) return null;
  return session;
}

export function deleteEditorSession(id: string) {
  sessions.delete(id);
}
