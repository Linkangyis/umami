import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanEditorUrl, getElementSelector, startVisualEditor } from './editor';

const websiteId = '11111111-1111-4111-8111-111111111111';
const hostUrl = 'https://analytics.example/umami';
const origin = 'https://analytics.example';
let controller: Window;

function message(
  data: Record<string, unknown>,
  source: Window = controller,
  messageOrigin = origin,
) {
  window.dispatchEvent(
    new MessageEvent('message', { source, origin: messageOrigin, data: { websiteId, ...data } }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  document.body.innerHTML =
    '<main><button id="buy-item"><span>Private product name</span></button><input data-test="email" value="private@example.com"></main>';
  history.replaceState(null, '', `/?products/&umami-editor=${websiteId}`);
  controller = { postMessage: vi.fn(), closed: false } as unknown as Window;
  vi.stubGlobal('parent', controller);
  vi.stubGlobal('opener', null);
  delete (window as any).__umamiEditor;
});

afterEach(() => {
  message({ type: 'umami:editor-stop' });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  sessionStorage.clear();
  delete (window as any).__umamiEditor;
});

test('cleans editor markers without rewriting query routes or hash navigation', () => {
  expect(cleanEditorUrl(`https://shop.example/?products/&umami-editor=${websiteId}`)).toBe(
    'https://shop.example/?products/',
  );
  expect(
    cleanEditorUrl(`https://shop.example/?products-2/100.html&umami-editor=${websiteId}#/cart`),
  ).toBe('https://shop.example/?products-2/100.html#/cart');
  expect(
    cleanEditorUrl(`https://shop.example/?filter=a%2Bb&umami-editor=${websiteId}&sort=price`),
  ).toBe('https://shop.example/?filter=a%2Bb&sort=price');
});

test('announces loaded in an iframe and only announces ready after trusted initialization', () => {
  expect(startVisualEditor({ websiteId, hostUrl })).toBe(true);
  expect(location.search).toBe('?products/');
  expect(sessionStorage.getItem('umami.editor.website')).toBe(websiteId);
  expect((window as any).__umamiEditor).toBe(true);
  expect(controller.postMessage).toHaveBeenCalledWith(
    { type: 'umami:editor-loaded', websiteId, url: location.href },
    origin,
  );
  expect(vi.mocked(controller.postMessage).mock.calls).toHaveLength(1);
  message({ type: 'umami:editor-init', rules: [] });
  expect(controller.postMessage).toHaveBeenLastCalledWith(
    { type: 'umami:editor-ready', websiteId, url: location.href },
    origin,
  );
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  document.querySelector('button')?.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
});

test('uses the opener for popup mode and rejects detached or closed controllers', () => {
  vi.stubGlobal('parent', window);
  vi.stubGlobal('opener', controller);
  expect(startVisualEditor({ websiteId, hostUrl })).toBe(true);
  message({ type: 'umami:editor-stop' });
  delete (window as any).__umamiEditor;
  history.replaceState(null, '', `/?products/&umami-editor=${websiteId}`);
  vi.stubGlobal('opener', { ...controller, closed: true });
  expect(startVisualEditor({ websiteId, hostUrl })).toBe(false);
  vi.stubGlobal('opener', null);
  expect(startVisualEditor({ websiteId, hostUrl })).toBe(false);
});

test('rejects init from another origin, source or website before allowing selections', () => {
  startVisualEditor({ websiteId, hostUrl });
  const button = document.querySelector('button') as HTMLButtonElement;
  for (const init of [
    () => message({ type: 'umami:editor-init' }, controller, 'https://attacker.example'),
    () => message({ type: 'umami:editor-init' }, window),
    () => message({ type: 'umami:editor-init', websiteId: 'wrong' }),
  ]) {
    init();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    button.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  }
  expect(vi.mocked(controller.postMessage).mock.calls).toHaveLength(1);

  message({ type: 'umami:editor-init', locale: 'zh', rules: [] });
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  button.querySelector('span')?.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(controller.postMessage).toHaveBeenLastCalledWith(
    {
      type: 'umami:element-selected',
      websiteId,
      url: location.href,
      selector: '#buy-item',
      tagName: 'BUTTON',
    },
    origin,
  );
  expect(JSON.stringify(vi.mocked(controller.postMessage).mock.calls)).not.toContain(
    'Private product name',
  );
  expect(JSON.stringify(vi.mocked(controller.postMessage).mock.calls)).not.toContain(
    'private@example.com',
  );
});

test('Shift click bypasses selection and Escape exits while collection stays disabled', () => {
  startVisualEditor({ websiteId, hostUrl });
  message({ type: 'umami:editor-init', rules: [] });
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true });
  document.querySelector('button')?.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(vi.mocked(controller.postMessage).mock.calls).toHaveLength(2);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('[data-umami-editor-root]')).toBeNull();
  expect(sessionStorage.getItem('umami.editor.website')).toBeNull();
  expect((window as any).__umamiEditor).toBe(true);
  expect(controller.postMessage).toHaveBeenLastCalledWith(
    { type: 'umami:editor-stopped', websiteId },
    origin,
  );
});

test('only a trusted controller can stop selection; storage continues editor mode on navigation', () => {
  history.replaceState(null, '', '/?products-2/100.html');
  sessionStorage.setItem('umami.editor.website', websiteId);
  expect(startVisualEditor({ websiteId, hostUrl })).toBe(true);
  message({ type: 'umami:editor-stop' }, window);
  expect(document.querySelector('[data-umami-editor-root]')).not.toBeNull();
  message({ type: 'umami:editor-stop' });
  expect(document.querySelector('[data-umami-editor-root]')).toBeNull();
});

test('reports SPA page changes and highlights bound selectors without altering target styles', async () => {
  startVisualEditor({ websiteId, hostUrl });
  const button = document.querySelector('button') as HTMLButtonElement;
  button.style.color = 'red';
  message({ type: 'umami:editor-init', rules: [{ selector: '#buy-item' }, { selector: '[' }] });
  await vi.advanceTimersByTimeAsync(20);
  const shadow = document.querySelector('[data-umami-editor-root]')?.shadowRoot;
  expect(shadow?.querySelectorAll('.outline:not(.hover)')).toHaveLength(1);
  expect(button.style.color).toBe('red');
  history.pushState(null, '', '/?products-2/100.html');
  expect(controller.postMessage).toHaveBeenLastCalledWith(
    { type: 'umami:editor-ready', websiteId, url: location.href },
    origin,
  );
});

test('generates unique selectors with escaped IDs, test attributes and structural fallbacks', () => {
  document.body.innerHTML =
    '<div><button id="a:b">One</button><button data-testid="second">Two</button></div><div><button>Three</button><button>Four</button></div>';
  const buttons = Array.from(document.querySelectorAll('button'));
  for (const button of buttons) {
    const selector = getElementSelector(button);
    expect(selector).toBeTruthy();
    expect(document.querySelectorAll(selector as string)).toHaveLength(1);
    expect(document.querySelector(selector as string)).toBe(button);
  }
  expect(getElementSelector(buttons[1])).toBe('[data-testid="second"]');
  expect(getElementSelector(buttons[3])).toContain('nth-of-type');
  expect(getElementSelector(document.createElement('button'))).toBeNull();
});

test('includes a containing form selector without transmitting any input values', () => {
  document.body.innerHTML =
    '<form id="contact-form"><input value="private@example.com"><button id="send-form" type="submit">Send</button></form>';
  startVisualEditor({ websiteId, hostUrl });
  message({ type: 'umami:editor-init', rules: [] });
  document
    .querySelector('button')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  expect(controller.postMessage).toHaveBeenLastCalledWith(
    {
      type: 'umami:element-selected',
      websiteId,
      url: location.href,
      selector: '#send-form',
      tagName: 'BUTTON',
      formSelector: '#contact-form',
    },
    origin,
  );
  expect(JSON.stringify(vi.mocked(controller.postMessage).mock.calls)).not.toContain(
    'private@example.com',
  );
});

test('highlights only bindings applicable to the current query route', async () => {
  startVisualEditor({ websiteId, hostUrl });
  message({
    type: 'umami:editor-init',
    rules: [
      { selector: '#buy-item', matchType: 'exact', urlPath: '/?products/' },
      { selector: 'input', matchType: 'exact', urlPath: '/?products-2/100.html' },
    ],
  });
  await vi.advanceTimersByTimeAsync(20);
  expect(
    document
      .querySelector('[data-umami-editor-root]')
      ?.shadowRoot?.querySelectorAll('.outline:not(.hover)'),
  ).toHaveLength(1);
});
