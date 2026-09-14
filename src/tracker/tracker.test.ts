import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { afterEach, expect, test, vi } from 'vitest';

const source = execFileSync(
  process.execPath,
  [
    '-e',
    "process.stdout.write(require('esbuild').buildSync({entryPoints:['src/tracker/index.ts'],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022'}).outputFiles[0].text)",
  ],
  { encoding: 'utf8' },
);
const windows: JSDOM[] = [];

function setup(attributes: Record<string, string> = {}) {
  const dom = new JSDOM('<!doctype html><title>Products</title><body></body>', {
    url: 'https://shop.example/?products/',
    runScripts: 'outside-only',
  });
  windows.push(dom);
  const { window } = dom;
  const script = window.document.createElement('script');
  script.src = 'https://analytics.example/script.js';
  script.setAttribute('data-website-id', 'ffac594c-6e00-4c02-bf4f-b40ab18082d7');
  for (const [key, value] of Object.entries(attributes)) script.setAttribute(key, value);
  Object.defineProperty(window.document, 'currentScript', { value: script });
  Object.defineProperty(window.document, 'readyState', { value: 'complete' });
  const fetch = vi.fn().mockResolvedValue({ json: async () => ({ cache: 'test' }) });
  Object.assign(window, { fetch });
  window.eval(source);
  const payloads = () =>
    fetch.mock.calls
      .filter(([, options]) => options.body)
      .map(([, options]) => JSON.parse(options.body).payload);
  return { window, fetch, payloads };
}

afterEach(() => {
  for (const dom of windows.splice(0)) dom.window.close();
});

test('tracks untagged interactive clicks and keeps full current page URL', () => {
  const { window, payloads } = setup();
  window.document.body.innerHTML = '<button id="buy"><span>Buy</span></button>';
  window.document.querySelector('span').click();
  expect(payloads().at(-1)).toMatchObject({
    name: 'button-click',
    url: 'https://shop.example/?products/',
    data: { element: 'button', element_id: 'buy' },
  });
});

test('explicit names replace automatic names and do not hijack navigation', () => {
  const { window, payloads } = setup();
  window.document.body.innerHTML =
    '<a href="/details" data-umami-event="product-open" data-umami-event-sku="123"><span>Open</span></a>';
  const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
  window.document.querySelector('span').dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(payloads().filter(p => p.name)).toEqual([
    expect.objectContaining({ name: 'product-open', data: { sku: '123' } }),
  ]);
});

test('allows disabling automatic events while keeping named events', () => {
  const { window, payloads } = setup({ 'data-auto-events': 'false' });
  window.document.body.innerHTML =
    '<button>Skip</button><button data-umami-event="save">Save</button>';
  for (const button of window.document.querySelectorAll('button')) button.click();
  expect(
    payloads()
      .filter(p => p.name)
      .map(p => p.name),
  ).toEqual(['save']);
});

test('ignores marked subtrees and never collects form field values', () => {
  const { window, payloads } = setup();
  window.document.body.innerHTML =
    '<div data-umami-ignore><button>Private</button></div><form id="contact"><input name="email" value="private@example.com"></form>';
  window.document.querySelector('button').click();
  window.document
    .querySelector('form')
    .dispatchEvent(new window.Event('submit', { bubbles: true }));
  expect(payloads().filter(p => p.name)).toEqual([
    expect.objectContaining({
      name: 'form-submit',
      data: { element: 'form', element_id: 'contact' },
    }),
  ]);
  expect(JSON.stringify(payloads())).not.toContain('private@example.com');
});

test('tagged forms emit only on submission', () => {
  const { window, payloads } = setup();
  window.document.body.innerHTML =
    '<form data-umami-event="lead"><input><button>Send</button></form>';
  window.document.querySelector('input').click();
  window.document
    .querySelector('form')
    .dispatchEvent(new window.Event('submit', { bubbles: true }));
  expect(
    payloads()
      .filter(p => p.name)
      .map(p => p.name),
  ).toEqual(['lead']);
});

test('captures back/forward and hash routes without duplicate pageviews', async () => {
  const { window, payloads } = setup();
  window.history.pushState({}, '', '/?products-2/100.html');
  window.history.replaceState({}, '', '/?products-2/100.html');
  window.history.replaceState({}, '', '/#/checkout');
  window.dispatchEvent(new window.PopStateEvent('popstate'));
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await new Promise(resolve => setTimeout(resolve, 350));
  expect(
    payloads()
      .filter(p => !p.name)
      .map(p => p.url),
  ).toEqual([
    'https://shop.example/?products/',
    'https://shop.example/?products-2/100.html',
    'https://shop.example/#/checkout',
  ]);
});

test('malformed links are ignored without throwing from the website listener', () => {
  const { window, payloads } = setup();
  const errors = vi.fn();
  window.addEventListener('error', errors);
  window.document.body.innerHTML = '<a href="http://[">Broken</a>';
  window.document
    .querySelector('a')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  expect(errors).not.toHaveBeenCalled();
  expect(payloads().filter(p => p.name)).toHaveLength(0);
});

test('links within tagged forms still collect click actions and detect file extensions', () => {
  const { window, payloads } = setup();
  window.document.body.innerHTML =
    '<form data-umami-event="lead"><a href="/manual.pdf">Manual</a></form>';
  window.document
    .querySelector('a')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  expect(
    payloads()
      .filter(p => p.name)
      .map(p => p.name),
  ).toEqual(['file-download']);
});
