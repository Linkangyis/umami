import { addCustomEvent, record } from 'rrweb';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('rrweb', () => ({ addCustomEvent: vi.fn(), record: vi.fn(() => vi.fn()) }));

const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.clearAllMocks();
  originalReplaceState.call(history, null, '', '/?products/');
  const script = document.createElement('script');
  script.setAttribute('data-website-id', '11111111-1111-4111-8111-111111111111');
  script.setAttribute('data-host-url', 'http://localhost:3000');
  vi.spyOn(document, 'currentScript', 'get').mockReturnValue(script);
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
  vi.spyOn(document, 'addEventListener').mockImplementation(() => {});
  vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
  vi.stubGlobal('umami', { getSession: () => ({ cache: 'test-session' }) });
});

afterEach(() => {
  history.pushState = originalPushState;
  history.replaceState = originalReplaceState;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function startRecorder(heatmapEnabled: boolean, replayEnabled: boolean) {
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      ({
        ok: true,
        json: async () => ({
          enabled: true,
          heatmapEnabled,
          replayEnabled,
          sampleRate: 1,
          heatmapSampleRate: 1,
        }),
      }) as Response,
  );
  vi.stubGlobal('fetch', fetchMock);
  await import('./index.js');
  await vi.advanceTimersByTimeAsync(0);
  return fetchMock;
}

test('records push, replace, back and hash navigation when heatmaps are disabled', async () => {
  await startRecorder(false, true);
  expect(record).toHaveBeenCalledOnce();

  history.pushState(null, '', '/?products-2/100.html');
  history.replaceState(null, '', '/about');
  originalReplaceState.call(history, null, '', '/?products/');
  const popstate = vi
    .mocked(window.addEventListener)
    .mock.calls.find(([type]) => type === 'popstate')?.[1] as () => void;
  popstate();
  originalReplaceState.call(history, null, '', '/#/cart');
  const hashchange = vi
    .mocked(window.addEventListener)
    .mock.calls.find(([type]) => type === 'hashchange')?.[1] as () => void;
  hashchange();
  hashchange();

  expect(
    vi
      .mocked(addCustomEvent)
      .mock.calls.map(
        ([, data]) =>
          new URL((data as any).url).pathname +
          new URL((data as any).url).search +
          new URL((data as any).url).hash,
      ),
  ).toEqual(['/?products-2/100.html', '/about', '/?products/', '/#/cart']);
});

test('records a scroll viewport on each SPA page even without a scroll event', async () => {
  const fetchMock = await startRecorder(true, false);
  history.pushState(null, '', '/?products-2/100.html');
  await vi.advanceTimersByTimeAsync(6000);

  const batches = fetchMock.mock.calls
    .map(([, options]) => options?.body && JSON.parse(options.body as string))
    .filter(body => body?.type === 'heatmap');
  expect(
    batches.flatMap(batch => batch.payload.events.map((event: any) => new URL(event.url).search)),
  ).toEqual(['?products/', '?products-2/100.html']);
  expect(record).not.toHaveBeenCalled();
});

test('does not configure or capture sessions while the visual editor is active', async () => {
  vi.stubGlobal('__umamiEditor', true);
  const fetchMock = await startRecorder(true, true);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(record).not.toHaveBeenCalled();
});
