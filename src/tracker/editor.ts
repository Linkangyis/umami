import { getRecorderPagePath } from './page-path';

const EDITOR_STORAGE_KEY = 'umami.editor.session';
const EDITOR_ROOT_ATTRIBUTE = 'data-umami-editor-root';

export function cleanEditorUrl(href: string) {
  const url = new URL(href);
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
    .replace(/[\n\r\f]/g, c => `\\${c.charCodeAt(0).toString(16)} `);
}

function identifier(value: string) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return Array.from(value)
    .map((c, i) =>
      /[a-zA-Z_-]/.test(c) || (i > 0 && /[0-9]/.test(c))
        ? c
        : `\\${c.codePointAt(0)?.toString(16)} `,
    )
    .join('');
}

export function getElementSelector(element: Element): string | null {
  const document = element.ownerDocument;
  const unique = (selector: string, target: Element) => {
    try {
      const matches = document.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === target;
    } catch {
      return false;
    }
  };
  const stable = (target: Element) => {
    if (target.id) {
      const selector = `#${identifier(target.id)}`;
      if (unique(selector, target)) return selector;
    }
    for (const name of ['data-testid', 'data-test', 'data-id']) {
      const value = target.getAttribute(name);
      if (!value) continue;
      const selector = `[${name}="${attributeValue(value)}"]`;
      if (unique(selector, target)) return selector;
    }
    return null;
  };
  if (!document.documentElement.contains(element) || element.closest(`[${EDITOR_ROOT_ATTRIBUTE}]`))
    return null;
  const direct = stable(element);
  if (direct) return direct;
  const parts: string[] = [];
  let current: Element | null = element;
  while (current) {
    const found = stable(current);
    if (found) {
      parts.unshift(found);
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
    if (unique(selector, element)) return selector;
    current = current.parentElement;
  }
  return null;
}

type Rule = {
  id: string;
  name: string;
  selector: string;
  urlPath: string;
  matchType: 'exact' | 'prefix' | 'all';
  eventType: 'click' | 'submit';
  isEnabled: boolean;
};

export function startVisualEditor({
  websiteId: _websiteId,
  hostUrl,
}: {
  websiteId: string;
  hostUrl: string;
}) {
  let sessionId: string | null = null;
  try {
    sessionId =
      new URL(location.href).searchParams.get('umami-editor') ||
      sessionStorage.getItem(EDITOR_STORAGE_KEY);
  } catch {
    sessionId = new URL(location.href).searchParams.get('umami-editor');
  }
  if (!sessionId || !/^[a-f0-9]{48}$/.test(sessionId)) return false;
  let apiOrigin: string;
  try {
    apiOrigin = new URL(hostUrl, location.href).href.replace(/\/$/, '');
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(new URL(apiOrigin).protocol) || (window as any).__umamiEditor)
    return true;
  (window as any).__umamiEditor = true;
  try {
    sessionStorage.setItem(EDITOR_STORAGE_KEY, sessionId);
  } catch {
    /* ignored */
  }
  const apiUrl = `${apiOrigin}/api/event-rules/editor-session/${sessionId}`;
  const host = document.createElement('div');
  host.setAttribute(EDITOR_ROOT_ATTRIBUTE, '');
  host.style.cssText =
    'all:initial !important;position:fixed !important;display:block !important;visibility:visible !important;opacity:1 !important;inset:0 !important;z-index:2147483647 !important;pointer-events:none !important';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `*{box-sizing:border-box}.toolbar,.panel{position:fixed;top:14px;right:14px;color:#172033;background:#fff;border:1px solid #d7dee8;border-radius:10px;box-shadow:0 6px 24px #0002;font:14px/1.45 system-ui,sans-serif;pointer-events:auto}.toolbar{padding:10px 12px;display:flex;align-items:center;gap:8px}.panel{top:66px;width:min(430px,calc(100vw - 28px));max-height:calc(100vh - 82px);overflow:auto;padding:16px}.panel h3{margin:0 0 12px;font-size:16px}.panel label{display:block;margin:10px 0 4px;font-weight:600}.panel input,.panel select{width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;font:inherit}.row{display:flex;gap:8px;align-items:center}button{border:1px solid #cbd5e1;border-radius:6px;padding:7px 10px;background:#fff;color:#172033;cursor:pointer;font:inherit}button.primary{background:#2563eb;border-color:#2563eb;color:#fff}button:disabled{opacity:.55;cursor:default}.muted{color:#64748b;font-size:12px}.selected{margin:0 0 12px;padding:9px;background:#effbff;border-radius:6px;overflow-wrap:anywhere}.rule{padding:9px 0;border-bottom:1px solid #e2e8f0}.rule code{display:block;color:#475569;font-size:11px;overflow-wrap:anywhere}.outline{position:fixed;border:2px solid #06b6d4;background:#06b6d414;pointer-events:none}.hover{border-color:#f59e0b;background:#f59e0b20}.error{color:#dc2626;margin-top:8px}`;
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const status = document.createElement('span');
  const listButton = document.createElement('button');
  listButton.textContent = '已创建事件';
  const closeButton = document.createElement('button');
  closeButton.textContent = '退出';
  toolbar.append(status, listButton, closeButton);
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.hidden = true;
  shadow.append(style, toolbar, panel);
  (document.body || document.documentElement).append(host);
  let stopped = false;
  let rules: Rule[] = [];
  let selected: {
    selector: string;
    formSelector?: string;
    eventType: 'click' | 'submit';
    urlPath: string;
  } | null = null;
  let hovered: Element | null = null;
  let frame = 0;
  let listOpen = false;
  const request = async (method: string, body?: unknown) => {
    const response = await fetch(apiUrl, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'omit',
      cache: 'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error?.message || '请求失败');
    return result;
  };
  const position = (outline: HTMLElement, element: Element) => {
    const rect = element.getBoundingClientRect();
    outline.style.left = `${rect.left}px`;
    outline.style.top = `${rect.top}px`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
    outline.hidden = rect.width <= 0 || rect.height <= 0;
  };
  const highlights = document.createElement('div');
  const hover = document.createElement('div');
  hover.className = 'outline hover';
  hover.hidden = true;
  shadow.append(highlights, hover);
  const draw = () => {
    frame = 0;
    highlights.replaceChildren();
    const seen = new Set<Element>();
    const page = getRecorderPagePath(location.href);
    for (const rule of rules.filter(item => item.isEnabled)) {
      if (
        rule.matchType !== 'all' &&
        (rule.matchType === 'exact' ? page !== rule.urlPath : !page?.startsWith(rule.urlPath))
      )
        continue;
      try {
        for (const element of document.querySelectorAll(rule.selector)) {
          if (seen.size >= 100 || seen.has(element)) continue;
          seen.add(element);
          const outline = document.createElement('div');
          outline.className = 'outline';
          position(outline, element);
          highlights.append(outline);
        }
      } catch {
        /* ignored */
      }
    }
    if (hovered?.isConnected) position(hover, hovered);
    else hover.hidden = true;
  };
  const scheduleDraw = () => {
    if (!frame && !stopped) frame = requestAnimationFrame(draw);
  };
  const targetElement = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element) || target === host || host.contains(target)) return null;
    return target.closest('a,button,input,select,textarea,[role="button"]') || target;
  };
  const loadRules = async () => {
    try {
      const result = await request('GET');
      rules = Array.isArray(result?.data) ? result.data : [];
      draw();
      if (listOpen) renderPanel();
    } catch (error) {
      status.textContent = (error as Error).message;
    }
  };
  const renderPanel = () => {
    panel.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = listOpen ? '已创建事件' : '创建元素点击事件';
    panel.append(title);
    if (listOpen) {
      if (!rules.length) {
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = '还没有创建事件';
        panel.append(empty);
      }
      for (const rule of rules) {
        const item = document.createElement('div');
        item.className = 'rule';
        const name = document.createElement('strong');
        name.textContent = rule.name;
        const meta = document.createElement('div');
        meta.className = 'muted';
        meta.textContent = `${rule.eventType} · ${rule.urlPath}`;
        const selector = document.createElement('code');
        selector.textContent = rule.selector;
        item.append(name, meta, selector);
        panel.append(item);
      }
      const back = document.createElement('button');
      back.textContent = '返回创建';
      back.onclick = () => {
        listOpen = false;
        renderPanel();
      };
      panel.append(back);
      return;
    }
    if (!selected) {
      const hint = document.createElement('div');
      hint.className = 'muted';
      hint.textContent = '点击页面元素后，在这里填写事件名称并保存。';
      panel.append(hint);
      return;
    }
    const picked = document.createElement('div');
    picked.className = 'selected';
    picked.textContent = `已选元素：${selected.selector}`;
    panel.append(picked);
    const label = document.createElement('label');
    label.textContent = '事件名称';
    panel.append(label);
    const name = document.createElement('input');
    name.placeholder = '例如 contact-click';
    name.autofocus = true;
    name.maxLength = 50;
    name.setAttribute('aria-label', '事件名称');
    panel.append(name);
    const selectorLabel = document.createElement('label');
    selectorLabel.textContent = '元素选择器';
    const selectorInput = document.createElement('input');
    selectorInput.setAttribute('aria-label', '元素选择器');
    selectorInput.value = selected.selector;
    selectorInput.maxLength = 500;
    panel.append(selectorLabel, selectorInput);
    const row = document.createElement('div');
    row.className = 'row';
    const type = document.createElement('select');
    for (const [value, text] of [
      ['click', '点击'],
      ['submit', '表单提交'],
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      type.append(option);
    }
    type.value = selected.eventType;
    type.setAttribute('aria-label', '触发方式');
    type.onchange = () => {
      if (type.value === 'submit' && selected?.formSelector)
        selectorInput.value = selected.formSelector;
    };
    row.append(type);
    const scope = document.createElement('select');
    for (const [value, text] of [
      ['exact', '当前页面'],
      ['prefix', '路径前缀'],
      ['all', '所有页面'],
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      scope.append(option);
    }
    row.append(scope);
    scope.setAttribute('aria-label', '生效页面');
    panel.append(row);
    const pathLabel = document.createElement('label');
    pathLabel.textContent = '页面路径';
    const pathInput = document.createElement('input');
    pathInput.setAttribute('aria-label', '页面路径');
    pathInput.value = selected.urlPath;
    scope.onchange = () => {
      pathInput.disabled = scope.value === 'all';
    };
    panel.append(pathLabel, pathInput);
    const save = document.createElement('button');
    save.className = 'primary';
    save.textContent = '保存事件';
    save.style.marginTop = '12px';
    const error = document.createElement('div');
    error.className = 'error';
    save.onclick = async () => {
      const selection = selected;
      const eventName = name.value.trim();
      if (!eventName) {
        error.textContent = '请输入事件名称';
        return;
      }
      try {
        if (!selectorInput.value.trim()) throw new Error();
        document.querySelector(selectorInput.value);
      } catch {
        error.textContent = '请填写有效的元素选择器';
        return;
      }
      save.disabled = true;
      error.textContent = '';
      try {
        await request('POST', {
          name: eventName,
          selector: selectorInput.value.trim(),
          urlPath: scope.value === 'all' ? '/' : pathInput.value,
          matchType: scope.value,
          eventType: type.value,
          isEnabled: true,
        });
        if (selected === selection) selected = null;
        await loadRules();
        status.textContent = '已保存，可继续点击其他元素';
        if (!selected || selected === selection) renderPanel();
      } catch (e) {
        error.textContent = (e as Error).message;
        save.disabled = false;
      }
    };
    panel.append(save, error);
  };
  const onPointerMove = (event: Event) => {
    hovered = targetElement(event);
    scheduleDraw();
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.shiftKey || event.button !== 0 || !targetElement(event)) return;
    event.preventDefault();
  };
  const onClick = (event: MouseEvent) => {
    if (event.shiftKey || event.button !== 0) return;
    const element = targetElement(event);
    if (!element) return;
    const selector = getElementSelector(element);
    if (!selector) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    hovered = element;
    const form = element.closest('form');
    selected = {
      selector,
      eventType: element.localName === 'form' ? 'submit' : 'click',
      formSelector: form ? getElementSelector(form) || undefined : undefined,
      urlPath: getRecorderPagePath(location.href) || '/',
    };
    listOpen = false;
    panel.hidden = false;
    renderPanel();
    scheduleDraw();
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      sessionStorage.removeItem(EDITOR_STORAGE_KEY);
    } catch {
      /* ignored */
    }
    cancelAnimationFrame(frame);
    document.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('scroll', scheduleDraw, true);
    window.removeEventListener('resize', scheduleDraw);
    window.removeEventListener('hashchange', onLocationChange);
    window.removeEventListener('popstate', onLocationChange);
    host.remove();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') stop();
  };
  const onLocationChange = () => {
    selected = null;
    panel.hidden = true;
    scheduleDraw();
    loadRules();
  };
  listButton.onclick = () => {
    listOpen = true;
    panel.hidden = false;
    renderPanel();
    loadRules();
  };
  closeButton.onclick = stop;
  document.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('scroll', scheduleDraw, true);
  window.addEventListener('resize', scheduleDraw);
  window.addEventListener('hashchange', onLocationChange);
  window.addEventListener('popstate', onLocationChange);
  status.textContent = '点击页面元素创建事件';
  loadRules();
  draw();
  return true;
}
