import { getRecorderPagePath } from './page-path';

const EDITOR_STORAGE_KEY = 'umami.editor.website';
const EDITOR_ROOT_ATTRIBUTE = 'data-umami-editor-root';

export function cleanEditorUrl(href: string) {
  const url = new URL(href);
  // URLSearchParams rewrites bare routes (?products/) into a different request (?products%2F=).
  url.search = url.search
    .slice(1)
    .split('&')
    .filter(part => {
      try {
        return decodeURIComponent(part.split('=', 1)[0]) !== 'umami-editor';
      } catch {
        return true;
      }
    })
    .join('&');
  return url.href;
}

function attributeValue(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\n\r\f]/g, character => `\\${character.charCodeAt(0).toString(16)} `);
}

function identifier(value: string) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return Array.from(value)
    .map((character, index) =>
      /[a-zA-Z_-]/.test(character) || (index > 0 && /[0-9]/.test(character))
        ? character
        : `\\${character.codePointAt(0)?.toString(16)} `,
    )
    .join('');
}

/** Generates selectors from identifiers and structure, never from page text or input values. */
export function getElementSelector(element: Element): string | null {
  const document = element.ownerDocument;
  const isUnique = (selector: string, target: Element) => {
    try {
      const matches = document.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === target;
    } catch {
      return false;
    }
  };
  const stableSelector = (target: Element) => {
    if (target.id) {
      const selector = `#${identifier(target.id)}`;
      if (isUnique(selector, target)) return selector;
    }
    for (const name of ['data-testid', 'data-test', 'data-id']) {
      const value = target.getAttribute(name);
      if (!value) continue;
      const selector = `[${name}="${attributeValue(value)}"]`;
      if (isUnique(selector, target)) return selector;
    }
    return null;
  };

  if (
    !document.documentElement.contains(element) ||
    element.closest(`[${EDITOR_ROOT_ATTRIBUTE}]`)
  ) {
    return null;
  }
  const direct = stableSelector(element);
  if (direct) return direct;

  const parts: string[] = [];
  let current: Element | null = element;
  while (current) {
    const stable = stableSelector(current);
    if (stable) {
      parts.unshift(stable);
      return parts.join(' > ');
    }
    const tag = identifier(current.localName);
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(
          child => child.localName === current?.localName,
        )
      : [current];
    parts.unshift(
      siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(current) + 1})` : tag,
    );
    const selector = parts.join(' > ');
    if (isUnique(selector, element)) return selector;
    current = current.parentElement;
  }
  return null;
}

export function startVisualEditor({
  websiteId,
  hostUrl,
}: {
  websiteId: string;
  hostUrl: string;
}): boolean {
  let persisted: string | null = null;
  try {
    persisted = sessionStorage.getItem(EDITOR_STORAGE_KEY);
  } catch {
    /* Storage may be blocked. */
  }
  const marker = new URL(location.href).searchParams.get('umami-editor');
  if (marker !== websiteId && persisted !== websiteId) return false;

  const controller: Window | null = window.parent !== window ? window.parent : window.opener;
  if (!controller || controller.closed) {
    try {
      sessionStorage.removeItem(EDITOR_STORAGE_KEY);
    } catch {
      /* Storage may be blocked. */
    }
    return false;
  }
  let origin: string;
  try {
    origin = new URL(hostUrl, location.href).origin;
  } catch {
    return false;
  }
  if (!/^https?:\/\//.test(origin)) return false;
  if ((window as any).__umamiEditor) return true;

  (window as any).__umamiEditor = true;
  try {
    sessionStorage.setItem(EDITOR_STORAGE_KEY, websiteId);
  } catch {
    /* Marker still enables this page. */
  }
  if (marker === websiteId) history.replaceState(history.state, '', cleanEditorUrl(location.href));

  const host = document.createElement('div');
  host.setAttribute(EDITOR_ROOT_ATTRIBUTE, '');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; }
    .toolbar { position:fixed;top:12px;right:12px;max-width:calc(100vw - 24px);padding:12px 16px;border-radius:10px;background:#172033;color:white;box-shadow:0 4px 24px #0004;font:13px/1.5 system-ui,sans-serif;pointer-events:auto;display:flex;flex-wrap:wrap;align-items:center;gap:12px; }
    button { background:#fff;color:#172033;border:0;padding:6px 10px;border-radius:6px;font:inherit;cursor:pointer; }
    .outline { position:fixed;border:2px solid #06b6d4;background:#06b6d414;pointer-events:none; }
    .hover { border-color:#f59e0b;background:#f59e0b20; }
  `;
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.setAttribute('role', 'status');
  const status = document.createElement('span');
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  toolbar.append(status, closeButton);
  const highlights = document.createElement('div');
  const hover = document.createElement('div');
  hover.className = 'outline hover';
  hover.hidden = true;
  shadow.append(style, highlights, hover, toolbar);
  (document.body || document.documentElement).append(host);

  let active = false;
  let stopped = false;
  let locale = 'en';
  let rules: { selector: string }[] = [];
  let hovered: Element | null = null;
  let frame = 0;
  let lastUrl = cleanEditorUrl(location.href);
  const send = (type: string, fields: Record<string, unknown> = {}) => {
    if (!controller.closed) controller.postMessage({ type, websiteId, ...fields }, origin);
  };
  const ready = () =>
    send(active ? 'umami:editor-ready' : 'umami:editor-loaded', {
      url: cleanEditorUrl(location.href),
    });
  const updateStatus = () => {
    status.textContent = active
      ? locale === 'zh'
        ? `点击选择元素 · Shift + 点击正常浏览 · ${rules.length} 条已绑定规则`
        : `Click to select · Shift + click to navigate · ${rules.length} bound rules`
      : 'Waiting for editor…';
    closeButton.textContent = locale === 'zh' ? '退出选择' : 'Exit selection';
  };
  const positionOutline = (outline: HTMLElement, element: Element) => {
    const rect = element.getBoundingClientRect();
    outline.style.left = `${rect.left}px`;
    outline.style.top = `${rect.top}px`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
    outline.hidden = rect.width <= 0 || rect.height <= 0;
  };
  const draw = () => {
    frame = 0;
    highlights.replaceChildren();
    const matched = new Set<Element>();
    for (const rule of rules) {
      try {
        for (const element of document.querySelectorAll(rule.selector)) {
          if (matched.size >= 100) break;
          if (matched.has(element) || element.closest(`[${EDITOR_ROOT_ATTRIBUTE}]`)) continue;
          matched.add(element);
          const outline = document.createElement('div');
          outline.className = 'outline';
          positionOutline(outline, element);
          highlights.append(outline);
        }
      } catch {
        /* Ignore selectors for unavailable or changed elements. */
      }
    }
    if (hovered?.isConnected) positionOutline(hover, hovered);
    else hover.hidden = true;
  };
  const scheduleDraw = () => {
    if (!frame && !stopped) frame = requestAnimationFrame(draw);
  };
  const selectedElement = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element) || target === host || host.contains(target)) return null;
    return target.closest('a,button,input,select,textarea,[role="button"]') || target;
  };
  const onPointerMove = (event: Event) => {
    if (!active) return;
    hovered = selectedElement(event);
    scheduleDraw();
  };
  const onClick = (event: MouseEvent) => {
    if (!active || event.shiftKey || event.button !== 0) return;
    const element = selectedElement(event);
    if (!element) return;
    const selector = getElementSelector(element);
    if (!selector) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    hovered = element;
    scheduleDraw();
    const form = element.closest('form');
    const formSelector = form ? getElementSelector(form) : null;
    send('umami:element-selected', {
      url: cleanEditorUrl(location.href),
      selector,
      tagName: element.tagName,
      ...(formSelector ? { formSelector } : {}),
    });
  };
  const originalPush = history.pushState;
  const originalReplace = history.replaceState;
  const onLocationChange = () => {
    const url = cleanEditorUrl(location.href);
    if (url === lastUrl) return;
    lastUrl = url;
    hovered = null;
    rules = [];
    updateStatus();
    scheduleDraw();
    ready();
  };
  const pushState: History['pushState'] = function (this: History, ...args) {
    originalPush.apply(this, args);
    onLocationChange();
  };
  const replaceState: History['replaceState'] = function (this: History, ...args) {
    originalReplace.apply(this, args);
    onLocationChange();
  };
  const observer = new MutationObserver(scheduleDraw);
  const stop = (notify = true) => {
    if (stopped) return;
    stopped = true;
    active = false;
    try {
      sessionStorage.removeItem(EDITOR_STORAGE_KEY);
    } catch {
      /* Storage may be blocked. */
    }
    // Keep collection disabled for this document after exiting. A normal reload clears the flag.
    clearInterval(controllerTimer);
    cancelAnimationFrame(frame);
    observer.disconnect();
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('message', onMessage);
    window.removeEventListener('scroll', scheduleDraw, true);
    window.removeEventListener('resize', scheduleDraw);
    window.removeEventListener('hashchange', onLocationChange);
    window.removeEventListener('popstate', onLocationChange);
    if (history.pushState === pushState) history.pushState = originalPush;
    if (history.replaceState === replaceState) history.replaceState = originalReplace;
    host.remove();
    if (notify) send('umami:editor-stopped');
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      stop();
    }
  };
  const onMessage = (event: MessageEvent) => {
    if (
      event.source !== controller ||
      event.origin !== origin ||
      event.data?.websiteId !== websiteId
    )
      return;
    if (event.data.type === 'umami:editor-stop') {
      stop();
      return;
    }
    if (event.data.type !== 'umami:editor-init') return;
    active = true;
    locale = event.data.locale === 'zh' ? 'zh' : 'en';
    const pagePath = getRecorderPagePath(location.href);
    rules = Array.isArray(event.data.rules)
      ? event.data.rules
          .filter((rule: any) => {
            if (typeof rule?.selector !== 'string' || rule.selector.length > 2048) return false;
            if (!rule.matchType || rule.matchType === 'all') return true;
            const scope = getRecorderPagePath(rule.urlPath);
            return (
              !!pagePath &&
              !!scope &&
              (rule.matchType === 'exact'
                ? pagePath === scope
                : rule.matchType === 'prefix' && pagePath.startsWith(scope))
            );
          })
          .slice(0, 200)
      : [];
    updateStatus();
    scheduleDraw();
    ready();
  };
  const controllerTimer = setInterval(() => {
    if (controller.closed) stop(false);
  }, 1000);
  closeButton.addEventListener('click', () => stop());
  history.pushState = pushState;
  history.replaceState = replaceState;
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('message', onMessage);
  window.addEventListener('scroll', scheduleDraw, true);
  window.addEventListener('resize', scheduleDraw);
  window.addEventListener('hashchange', onLocationChange);
  window.addEventListener('popstate', onLocationChange);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  updateStatus();
  ready();
  return true;
}
