import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanEditorUrl, getElementSelector, startVisualEditor } from './editor';

const websiteId = '11111111-1111-4111-8111-111111111111';
const sessionId = 'a'.repeat(48);
const hostUrl = 'https://analytics.example/umami';
const saved: any[] = [];
const api = vi.fn(async (_url: string, options: RequestInit) => {
  if (options.method === 'POST') {
    const rule = { ...JSON.parse(options.body as string), id: String(saved.length + 1) };
    saved.push(rule);
    return Response.json(rule);
  }
  return Response.json({ data: saved });
});
const shadow = () => document.querySelector('[data-umami-editor-root]')!.shadowRoot!;
const click = (element: Element) => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
  element.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  saved.length = 0;
  api.mockClear();
  sessionStorage.clear();
  document.body.innerHTML =
    '<a id="buy-item" href="/checkout"><span>Buy product</span></a><button id="contact">Contact</button>';
  history.replaceState(null, '', '/?products/&umami-editor=' + sessionId);
  vi.stubGlobal('fetch', api);
  vi.stubGlobal('opener', null);
  delete (window as any).__umamiEditor;
});

afterEach(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
  delete (window as any).__umamiEditor;
});

test('cleans editor markers without rewriting query routes', () => {
  expect(
    cleanEditorUrl('https://shop.example/?products/&umami-editor=' + sessionId + '#/cart'),
  ).toBe('https://shop.example/?products/#/cart');
});

test('starts without an opener and requests the session API directly', async () => {
  expect(startVisualEditor({ websiteId, hostUrl })).toBe(true);
  expect(location.search).toContain('umami-editor=' + sessionId);
  expect(sessionStorage.getItem('umami.editor.session')).toBe(sessionId);
  await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  expect(api.mock.calls[0][0]).toBe(hostUrl + '/api/event-rules/editor-session/' + sessionId);
  expect(shadow().querySelector('.toolbar')).not.toBeNull();
});

test('blocks navigation and saves multiple elements entirely in the target page', async () => {
  startVisualEditor({ websiteId, hostUrl });
  const siteHandler = vi.fn();
  document.querySelector('a')!.addEventListener('click', siteHandler);
  expect(click(document.querySelector('a span')!).defaultPrevented).toBe(true);
  expect(siteHandler).not.toHaveBeenCalled();
  const name = shadow().querySelector('[aria-label="事件名称"]') as HTMLInputElement;
  name.value = 'buy-click';
  click(shadow().querySelector('.primary')!);
  await vi.waitFor(() => expect(saved).toHaveLength(1));
  await vi.waitFor(() => expect(shadow().querySelector('.primary')).toBeNull());
  expect(saved[0]).toMatchObject({
    selector: '#buy-item',
    name: 'buy-click',
    eventType: 'click',
    urlPath: '/?products/',
  });
  click(document.querySelector('#contact')!);
  (shadow().querySelector('[aria-label="事件名称"]') as HTMLInputElement).value = 'contact-click';
  click(shadow().querySelector('.primary')!);
  await vi.waitFor(() => expect(saved).toHaveLength(2));
  click(shadow().querySelector('.toolbar button')!);
  await vi.waitFor(() => expect(shadow().querySelectorAll('.rule')).toHaveLength(2));
  expect(shadow().textContent).toContain('buy-click');
  expect(shadow().textContent).toContain('contact-click');
});

test('allows selector and page scope edits and displays expired-session errors', async () => {
  startVisualEditor({ websiteId, hostUrl });
  click(document.querySelector('#contact')!);
  (shadow().querySelector('[aria-label="事件名称"]') as HTMLInputElement).value = 'contact';
  (shadow().querySelector('[aria-label="元素选择器"]') as HTMLInputElement).value = 'button';
  api.mockResolvedValueOnce(Response.json({ error: { message: '会话已过期' } }, { status: 404 }));
  click(shadow().querySelector('.primary')!);
  await vi.waitFor(() => expect(shadow().querySelector('.error')?.textContent).toBe('会话已过期'));
  expect((shadow().querySelector('.primary') as HTMLButtonElement).disabled).toBe(false);
});

test('Shift click navigates normally and Escape exits selection', () => {
  startVisualEditor({ websiteId, hostUrl });
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true });
  document.querySelector('#contact')!.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('[data-umami-editor-root]')).toBeNull();
  expect(sessionStorage.getItem('umami.editor.session')).toBeNull();
});

test('ignores invalid session IDs and generates unique selectors', () => {
  history.replaceState(null, '', '/?umami-editor=invalid');
  expect(startVisualEditor({ websiteId, hostUrl })).toBe(false);
  expect(api).not.toHaveBeenCalled();
  document.body.innerHTML =
    '<div><button id="a:b">One</button><button data-testid="second">Two</button></div><div><button>Three</button><button>Four</button></div>';
  for (const button of document.querySelectorAll('button')) {
    const selector = getElementSelector(button)!;
    expect(document.querySelectorAll(selector)).toHaveLength(1);
    expect(document.querySelector(selector)).toBe(button);
  }
});
