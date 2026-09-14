'use client';
import { Button, Column, ListItem, Row, Select, Text, TextField } from '@umami/react-zen';
import { useState } from 'react';
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
  const [draft, setDraft] = useState<EventRuleInput>(emptyRule);
  const [editingId, setEditingId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const rules = data?.data ?? [];

  const openEditor = async () => {
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
    const popup = window.open('', '_blank', 'popup,width=1280,height=850');
    try {
      if (!popup)
        throw new Error(
          t(
            '浏览器阻止了新窗口，请允许弹窗后重试。',
            'The browser blocked the editor window. Allow popups and retry.',
          ),
        );
      popup.opener = null;
      const session = await post('/event-rules/editor-session', { websiteId });
      url.search += `${url.search ? '&' : '?'}umami-editor=${encodeURIComponent(session.id)}`;
      popup.location.href = url.href;
      popup.focus();
      setNotice(
        t(
          '编辑器已在目标网站新窗口打开。选择元素后可直接保存，并继续选择其他元素。',
          'The editor is open in a new window. Select and save elements repeatedly.',
        ),
      );
    } catch (e) {
      popup?.close();
      setError((e as Error).message || t('打开编辑器失败', 'Failed to open editor'));
    }
  };
  const update = <K extends keyof EventRuleInput>(key: K, value: EventRuleInput[K]) =>
    setDraft(current => ({ ...current, [key]: value }));
  const save = async () => {
    setError('');
    if (!draft.name.trim() || /^[=+\-@\t\r]/.test(draft.name.trim()) || !draft.selector.trim()) {
      setError(t('请填写有效的事件名称和元素选择器。', 'Enter a valid event name and selector.'));
      return;
    }
    try {
      document.querySelector(draft.selector);
    } catch {
      setError(t('选择器格式不正确。', 'Invalid selector.'));
      return;
    }
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
      setNotice(t('事件已保存。', 'Event saved.'));
    } catch (e) {
      setError((e as Error).message || t('保存失败', 'Save failed'));
    } finally {
      setBusy(false);
    }
  };
  const changeRule = async (rule: EventRule, remove = false) => {
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
          '编辑器会在目标网站新窗口中打开。页面右上角弹窗负责选择元素、填写名称、保存事件和查看已创建事件列表。',
          'The editor opens in a new window on the target website. Its popup handles selection, naming, saving, and listing events.',
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
            placeholder="https://example.com/"
          />
        </div>
        <Button onPress={openEditor}>{t('在新窗口打开可视化编辑器', 'Open visual editor')}</Button>
      </div>
      {(error || queryError) && (
        <Text role="alert" style={{ color: '#dc2626' }}>
          {error || queryError?.message}
        </Text>
      )}
      {notice && <Text role="status">{notice}</Text>}
      {editingId && (
        <form
          className={styles.ruleForm}
          onSubmit={e => {
            e.preventDefault();
            save();
          }}
        >
          <h3>
            {editingId ? t('编辑事件', 'Edit event') : t('手动保存事件', 'Save event manually')}
          </h3>
          <div className={styles.controls}>
            <TextField
              label={t('事件名称', 'Event name')}
              aria-label={t('事件名称', 'Event name')}
              value={draft.name}
              maxLength={50}
              required
              onChange={value => update('name', value)}
            />
            <div className={styles.urlField}>
              <TextField
                label={t('元素选择器', 'Element selector')}
                aria-label={t('元素选择器', 'Element selector')}
                value={draft.selector}
                maxLength={500}
                required
                onChange={value => update('selector', value)}
              />
            </div>
            <Select
              label={t('触发方式', 'Trigger')}
              value={draft.eventType}
              onChange={value => update('eventType', value as EventRuleInput['eventType'])}
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
              <ListItem id="prefix">{t('路径前缀', 'Path prefix')}</ListItem>
              <ListItem id="all">{t('所有页面', 'All pages')}</ListItem>
            </Select>
            {draft.matchType !== 'all' && (
              <div className={styles.urlField}>
                <TextField
                  label={t('页面路径', 'Page path')}
                  value={draft.urlPath}
                  onChange={value => update('urlPath', getRecorderPagePath(value) || value)}
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
                {t('取消编辑', 'Cancel')}
              </Button>
            )}
          </Row>
        </form>
      )}
      <Column gap="3">
        <h3>
          {t('已创建事件', 'Bound events')} ({data?.count ?? 0}/{data?.limit ?? 100})
        </h3>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('名称', 'Name')}</th>
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
              '还没有创建事件。请在目标网站新窗口中打开可视化编辑器。',
              'No events yet. Open the visual editor in a new target-site window.',
            )}
          </Text>
        )}
      </Column>
    </Column>
  );
}
