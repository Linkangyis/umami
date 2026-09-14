import { afterEach, expect, test, vi } from 'vitest';
import {
  createEditorSession,
  deleteEditorSession,
  getEditorSession,
} from './event-editor-sessions';

afterEach(() => vi.useRealTimers());

test('issues independent IDs that allow repeated requests and expire after five minutes', () => {
  vi.useFakeTimers();
  const first = createEditorSession('website-a');
  const second = createEditorSession('website-b');
  expect(first.id).toMatch(/^[a-f0-9]{48}$/);
  expect(first.id).not.toBe(second.id);
  expect(getEditorSession(first.id)?.websiteId).toBe('website-a');
  expect(getEditorSession(first.id)?.websiteId).toBe('website-a');
  vi.advanceTimersByTime(299999);
  expect(getEditorSession(first.id)).not.toBeNull();
  vi.advanceTimersByTime(1);
  expect(getEditorSession(first.id)).toBeNull();
  expect(getEditorSession(second.id)).toBeNull();
});

test('unknown and revoked IDs cannot access a session', () => {
  const session = createEditorSession('website-a');
  deleteEditorSession(session.id);
  expect(getEditorSession(session.id)).toBeNull();
  expect(getEditorSession('unknown')).toBeNull();
});
