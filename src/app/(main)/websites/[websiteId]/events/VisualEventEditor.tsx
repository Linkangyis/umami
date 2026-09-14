'use client';
import {
  Button,
  Column,
  ListItem,
  Radio,
  RadioGroup,
  Row,
  Select,
  Switch,
  Text,
  TextField,
} from '@umami/react-zen';
import { useEffect, useRef, useState } from 'react';
import { useApi, useLocale, useWebsite } from '@/components/hooks';
import { getRecorderPagePath } from '@/lib/recorder';
import type { EventRule, EventRuleInput, EventRulesResponse } from '@/types/eventRule';
import styles from './VisualEventEditor.module.css';

const emptyRule: EventRuleInput = {
  name: '',
  selector: '',
  urlPath: '/',
  matchType: 'exact',
  eventType: 'click',
  isEnabled: true,
};

export function VisualEventEditor({ websiteId }: { websiteId: string }) {
  const { locale } = useLocale();
  const cn = locale.startsWith('zh');
  const t = (zh: string, en: string) => (cn ? zh : en);
  const website = useWebsite();
  const { get, post, put, del, useQuery } = useApi();
  const endpoint = `/websites/${websiteId}/event-rules`;
  const {
    data,
    error: queryError,
    refetch,
  } = useQuery<EventRulesResponse>({
    queryKey: ['event-rules', websiteId],
    queryFn: () => get(endpoint),
  });
  const [pageUrl, setPageUrl] = useState(() =>
    website?.domain ? `https://${website.domain.replace(/^https?:\/\//, '')}` : '',
  );
  const [mode, setMode] = useState<'iframe' | 'redirect'>('iframe');
  const [mobile, setMobile] = useState(false);
  const [editorUrl, setEditorUrl] = useState('');
  const [ready, setReady] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [currentPage, setCurrentPage] = useState('');
  const [formSelector, setFormSelector] = useState('');
  const [highlight, setHighlight] = useState(true);
  const [draft, setDraft] = useState<EventRuleInput>(emptyRule);
  const [editingId, setEditingId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const iframe = useRef<HTMLIFrameElement>(null);
  const popup = useRef<Window | null>(null);
  const origin = useRef('');
  const rules = data?.data ?? [];

  useEffect(() => {
    if (!editorUrl) return;
    const destination = () => (mode === 'iframe' ? iframe.current?.contentWindow : popup.current);
    const receive = (event: MessageEvent) => {
      if (!destination() || event.source !== destination() || event.origin !== origin.current)
        return;
      const message = event.data;
      if (!message || message.websiteId !== websiteId) return;
      if (message.type === 'umami:editor-loaded') {
        ping();
        return;
      }
      if (message.type === 'umami:editor-ready') {
        setReady(true);
        setWaiting(false);
        try {
          const current = new URL(message.url);
          if (current.origin === event.origin) setCurrentPage(current.href);
        } catch {
          /* Ignore invalid page labels from the embedded page. */
        }
      }
      if (message.type === 'umami:editor-stopped') {
        setReady(false);
        setEditorUrl('');
      }
      if (message.type !== 'umami:element-selected') return;
      if (
        typeof message.selector !== 'string' ||
        message.selector.length > 500 ||
        !message.selector
      )
        return;
      let url: URL;
      try {
        url = new URL(message.url);
      } catch {
        return;
      }
      if (url.origin !== event.origin) return;
      setFormSelector(
        typeof message.formSelector === 'string' && message.formSelector.length <= 500
          ? message.formSelector
          : '',
      );
      setDraft(current => ({
        ...current,
        selector: message.selector,
        urlPath: getRecorderPagePath(url.href) || '/',
        eventType: String(message.tagName).toLowerCase() === 'form' ? 'submit' : 'click',
      }));
      setNotice(
        cn ? '已选中元素，请命名并保存事件。' : 'Element selected. Name and save your event.',
      );
    };
    const ping = () =>
      destination()?.postMessage(
        {
          type: 'umami:editor-init',
          websiteId,
          locale: cn ? 'zh' : 'en',
          rules: highlight ? rules.filter(rule => rule.isEnabled) : [],
        },
        origin.current,
      );
    window.addEventListener('message', receive);
    const timer = window.setInterval(ping, 1000);
    const timeout = window.setTimeout(() => setWaiting(false), 10000);
    ping();
    return () => {
      window.removeEventListener('message', receive);
      window.clearInterval(timer);
      window.clearTimeout(timeout);
    };
  }, [editorUrl, mode, websiteId, cn, data, highlight]);

  useEffect(() => {
    if (!editorUrl) return;
    const target = mode === 'iframe' ? iframe.current?.contentWindow : popup.current;
    const targetOrigin = origin.current;
    return () => {
      target?.postMessage({ type: 'umami:editor-stop', websiteId }, targetOrigin);
      if (mode === 'redirect') target?.close();
    };
  }, [editorUrl, mode, websiteId]);

  const closeEditor = () => {
    const destination = mode === 'iframe' ? iframe.current?.contentWindow : popup.current;
    if (destination && origin.current)
      destination.postMessage({ type: 'umami:editor-stop', websiteId }, origin.current);
    popup.current?.close();
    popup.current = null;
    setEditorUrl('');
    setReady(false);
    setWaiting(false);
  };

  const openEditor = (nextMode = mode) => {
    setError('');
    let url: URL;
    try {
      url = new URL(pageUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new Error();
    } catch {
      setError(
        t(
          '请输入有效的 http:// 或 https:// 页面地址。',
          'Enter a valid http:// or https:// page URL.',
        ),
      );
      return;
    }
    closeEditor();
    origin.current = url.origin;
    setCurrentPage(url.href);
    // Do not use URLSearchParams here: it rewrites raw /?products/ query routes.
    url.search += `${url.search ? '&' : '?'}umami-editor=${encodeURIComponent(websiteId)}`;
    setMode(nextMode);
    if (nextMode === 'redirect') {
      // The installed tracker verifies the opener origin before accepting editor commands.
      popup.current = window.open(
        url.href,
        `umami-event-editor-${websiteId}`,
        `popup,width=${mobile ? 430 : 1280},height=850`,
      );
      if (!popup.current) {
        setError(
          t(
            '浏览器阻止了新窗口，请允许弹出窗口后重试。',
            'The browser blocked the editor window. Allow popups and retry.',
          ),
        );
        return;
      }
    }
    setReady(false);
    setWaiting(true);
    setEditorUrl(url.href);
  };

  const update = <K extends keyof EventRuleInput>(key: K, value: EventRuleInput[K]) =>
    setDraft(current => ({ ...current, [key]: value }));
  const save = async () => {
    setError('');
    if (!draft.name.trim() || /^[=+\-@\t\r]/.test(draft.name.trim())) {
      setError(
        t(
          '请填写有效的事件名称，不能以 =、+、-、@ 开头。',
          'Enter an event name that does not start with =, +, -, or @.',
        ),
      );
      return;
    }
    try {
      document.querySelector(draft.selector);
    } catch {
      setError(
        t('选择器格式不正确，请重新点选元素。', 'Invalid selector. Select the element again.'),
      );
      return;
    }
    if (!draft.selector.trim()) return;
    setBusy(true);
    try {
      const value = {
        ...draft,
        name: draft.name.trim(),
        urlPath: draft.matchType === 'all' ? '/' : draft.urlPath,
      };
      if (editingId) await put(`${endpoint}/${editingId}`, value);
      else await post(endpoint, value);
      await refetch();
      setEditingId(undefined);
      setDraft(emptyRule);
      setNotice(
        t(
          '事件已保存。刷新目标页面后，规则会自动采集匹配操作。',
          'Event saved. Refresh the target page to collect matching actions.',
        ),
      );
    } catch (e) {
      setError((e as Error).message || t('保存失败', 'Save failed'));
    } finally {
      setBusy(false);
    }
  };
  const changeRule = async (rule: EventRule, remove = false) => {
    if (
      remove &&
      !window.confirm(
        t(
          `删除事件“${rule.name}”？已采集的数据将保留。`,
          `Delete “${rule.name}”? Collected data will remain.`,
        ),
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      if (remove) await del(`${endpoint}/${rule.id}`);
      else await put(`${endpoint}/${rule.id}`, { isEnabled: !rule.isEnabled });
      await refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Column gap="6">
      <Text color="muted">
        {t(
          '直接点选目标网页元素并保存事件。目标页面需要安装新版统计脚本；Shift + 点击可临时执行网页原有操作。',
          'Select an element and save an event. Install the current tracker on the target page. Hold Shift while clicking to use normal page navigation.',
        )}
      </Text>
      <div className={styles.controls}>
        <div className={styles.urlField}>
          <TextField
            label={t('目标页面', 'Target page')}
            aria-label={t('目标页面', 'Target page')}
            type="url"
            value={pageUrl}
            onChange={setPageUrl}
            placeholder="https://example.com/?products/"
          />
        </div>
        <RadioGroup
          label={t('绑定模式', 'Binding mode')}
          value={mode}
          onChange={value => {
            closeEditor();
            setMode(value as typeof mode);
          }}
        >
          <Row gap>
            <Radio value="iframe">{t('iframe 内嵌模式', 'iframe mode')}</Radio>
            <Radio value="redirect">{t('跳转模式', 'Redirect mode')}</Radio>
          </Row>
        </RadioGroup>
        <RadioGroup
          label={t('页面类型', 'Device')}
          value={mobile ? 'mobile' : 'desktop'}
          onChange={value => setMobile(value === 'mobile')}
        >
          <Row gap>
            <Radio value="desktop">{t('电脑端', 'Desktop')}</Radio>
            <Radio value="mobile">{t('移动端', 'Mobile')}</Radio>
          </Row>
        </RadioGroup>
        <Button onPress={() => openEditor()}>{t('进入可视化绑定', 'Open visual editor')}</Button>
        {editorUrl && <Button onPress={closeEditor}>{t('完成绑定', 'Close editor')}</Button>}
      </div>
      {editorUrl && (
        <Row gap>
          <Text>
            {t('当前页面', 'Current page')}: {currentPage}
          </Text>
          <Switch isSelected={highlight} onChange={setHighlight}>
            {t('高亮已绑定事件', 'Highlight bound events')}
          </Switch>
        </Row>
      )}
      {editorUrl && (
        <div className={styles.status} role="status">
          {ready
            ? t('已连接：点击网页元素进行绑定。', 'Connected. Click an element to bind it.')
            : waiting
              ? t('正在连接目标页面…', 'Connecting to the target page…')
              : t(
                  '尚未连接。请确认已安装新版统计脚本；若网站禁止嵌入，请切换跳转模式。',
                  'Not connected. Confirm the current tracker is installed. If the site blocks embedding, use redirect mode.',
                )}{' '}
          {!ready && mode === 'iframe' && (
            <Button size="sm" onPress={() => openEditor('redirect')}>
              {t('改用跳转模式', 'Use redirect mode')}
            </Button>
          )}
        </div>
      )}
      {editorUrl && mode === 'iframe' && (
        <div className={styles.preview}>
          <iframe
            ref={iframe}
            src={editorUrl}
            title={t('可视化事件绑定预览', 'Visual event binding preview')}
            className={mobile ? styles.mobileFrame : styles.desktopFrame}
          />
        </div>
      )}
      {(error || queryError) && (
        <Text role="alert" style={{ color: '#dc2626' }}>
          {error || queryError?.message}
        </Text>
      )}
      {notice && <Text role="status">{notice}</Text>}
      <form
        className={styles.ruleForm}
        onSubmit={e => {
          e.preventDefault();
          save();
        }}
      >
        <h3>{editingId ? t('编辑事件', 'Edit event') : t('绑定事件', 'Bind an event')}</h3>
        <div className={styles.controls}>
          <TextField
            label={t('事件名称', 'Event name')}
            aria-label={t('事件名称', 'Event name')}
            value={draft.name}
            maxLength={50}
            required
            onChange={value => update('name', value)}
            placeholder="contact-click"
          />
          <div className={styles.urlField}>
            <TextField
              label={t('元素选择器', 'Element selector')}
              aria-label={t('元素选择器', 'Element selector')}
              value={draft.selector}
              maxLength={500}
              required
              onChange={value => update('selector', value)}
              placeholder={t('点选页面元素后自动填写', 'Filled when you select an element')}
            />
          </div>
          <Select
            label={t('触发方式', 'Trigger')}
            value={draft.eventType}
            onChange={value => {
              const eventType = value as EventRuleInput['eventType'];
              update('eventType', eventType);
              if (eventType === 'submit' && formSelector) update('selector', formSelector);
            }}
          >
            <ListItem id="click">{t('点击', 'Click')}</ListItem>
            <ListItem id="submit">{t('表单提交', 'Form submission')}</ListItem>
          </Select>
          <Select
            label={t('生效页面', 'Page scope')}
            value={draft.matchType}
            onChange={value => update('matchType', value as EventRuleInput['matchType'])}
          >
            <ListItem id="exact">{t('当前页面', 'Current page')}</ListItem>
            <ListItem id="prefix">{t('页面组（路径前缀）', 'Page group (path prefix)')}</ListItem>
            <ListItem id="all">{t('所有页面', 'All pages')}</ListItem>
          </Select>
          {draft.matchType !== 'all' && (
            <div className={styles.urlField}>
              <TextField
                label={t('页面路径', 'Page path')}
                aria-label={t('页面路径', 'Page path')}
                value={draft.urlPath}
                maxLength={2183}
                required
                onChange={value => update('urlPath', value)}
              />
            </div>
          )}
        </div>
        <Row gap>
          <Button type="submit" isDisabled={busy || !draft.selector || !draft.name.trim()}>
            {t('保存事件', 'Save event')}
          </Button>
          {editingId && (
            <Button
              onPress={() => {
                setEditingId(undefined);
                setDraft(emptyRule);
              }}
            >
              {t('取消编辑', 'Cancel edit')}
            </Button>
          )}
        </Row>
      </form>
      <Column gap="3">
        <h3>
          {t('已绑定事件', 'Bound events')} ({data?.count ?? 0}/{data?.limit ?? 100})
        </h3>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('事件名称', 'Name')}</th>
                <th>{t('页面范围', 'Page scope')}</th>
                <th>{t('元素', 'Element')}</th>
                <th>{t('状态', 'Status')}</th>
                <th>{t('操作', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id}>
                  <td>
                    {rule.name}
                    <small>{rule.eventType}</small>
                  </td>
                  <td>
                    {rule.matchType === 'all'
                      ? t('所有页面', 'All pages')
                      : `${rule.urlPath}${rule.matchType === 'prefix' ? '*' : ''}`}
                  </td>
                  <td>
                    <code>{rule.selector}</code>
                  </td>
                  <td>{rule.isEnabled ? t('启用', 'Enabled') : t('停用', 'Disabled')}</td>
                  <td>
                    <Row gap="2">
                      <Button
                        size="sm"
                        onPress={() => {
                          setEditingId(rule.id);
                          setDraft({
                            name: rule.name,
                            selector: rule.selector,
                            urlPath: rule.urlPath,
                            matchType: rule.matchType,
                            eventType: rule.eventType,
                            isEnabled: rule.isEnabled,
                          });
                        }}
                      >
                        {t('编辑', 'Edit')}
                      </Button>
                      <Button size="sm" isDisabled={busy} onPress={() => changeRule(rule)}>
                        {rule.isEnabled ? t('停用', 'Disable') : t('启用', 'Enable')}
                      </Button>
                      <Button size="sm" isDisabled={busy} onPress={() => changeRule(rule, true)}>
                        {t('删除', 'Delete')}
                      </Button>
                    </Row>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rules.length && (
          <Text color="muted">
            {t(
              '还没有绑定事件。可使用 iframe 或跳转模式点选第一个元素。',
              'No bound events yet. Select your first element using iframe or redirect mode.',
            )}
          </Text>
        )}
      </Column>
    </Column>
  );
}
