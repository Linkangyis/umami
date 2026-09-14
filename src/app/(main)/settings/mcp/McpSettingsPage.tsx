'use client';
import {
  Button,
  Checkbox,
  Code,
  Column,
  DataColumn,
  DataTable,
  Heading,
  ListItem,
  Row,
  Select,
  Text,
  TextField,
} from '@umami/react-zen';
import { useState } from 'react';
import { CopyButton } from '@/components/common/CopyButton';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useApi, useLocale } from '@/components/hooks';

interface McpTokenSummary {
  id: string;
  name: string;
  prefix: string;
  websiteIds: string[];
  scopes: string[];
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}
interface McpSettingsData {
  tokens: McpTokenSummary[];
  websites: { id: string; name: string; domain: string | null }[];
  limit: number;
}

export function McpSettingsPage() {
  const { locale } = useLocale();
  const cn = locale.startsWith('zh');
  const t = (zh: string, en: string) => (cn ? zh : en);
  const { get, post, del, useQuery } = useApi();
  const result = useQuery<McpSettingsData>({
    queryKey: ['mcp-tokens'],
    queryFn: () => get('/me/mcp-tokens'),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
  const [name, setName] = useState('');
  const [websiteIds, setWebsiteIds] = useState<string[]>([]);
  const [expiry, setExpiry] = useState(30);
  const [sessions, setSessions] = useState(false);
  const [writeRules, setWriteRules] = useState(false);
  const [issued, setIssued] = useState<{ id: string; token: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [websiteSearch, setWebsiteSearch] = useState('');
  const activeCount =
    result.data?.tokens.filter(
      token => !token.revokedAt && new Date(token.expiresAt).getTime() > Date.now(),
    ).length || 0;
  const limit = result.data?.limit || 20;
  const scopeLabels: Record<string, string> = {
    'analytics:read': t('统计只读', 'Analytics read'),
    'sessions:read': t('访问明细（含 IP）', 'Sessions (with IP)'),
    'event-rules:write': t('编辑事件规则', 'Edit event rules'),
  };
  const websiteNames = (ids: string[]) =>
    ids.map(id => result.data?.websites.find(website => website.id === id)?.name || id).join(', ');
  const endpoint =
    typeof window !== 'undefined'
      ? `${window.location.origin}${process.env.basePath || ''}/api/mcp`
      : '/api/mcp';
  const create = async () => {
    setBusy(true);
    setError('');
    setIssued(undefined);
    try {
      const response = await post('/me/mcp-tokens', {
        name: name.trim(),
        websiteIds,
        expiresInDays: expiry,
        scopes: [
          'analytics:read',
          ...(sessions ? ['sessions:read'] : []),
          ...(writeRules ? ['event-rules:write'] : []),
        ],
      });
      setIssued({ id: response.id, token: response.token });
      setName('');
      await result.refetch();
    } catch (error) {
      setError((error as Error).message || t('令牌创建失败', 'Token creation failed'));
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      await del(`/me/mcp-tokens/${id}`);
      if (issued?.id === id) setIssued(undefined);
      await result.refetch();
    } catch (error) {
      setError((error as Error).message || t('撤销失败', 'Revocation failed'));
    } finally {
      setBusy(false);
    }
  };
  const state = (token: McpTokenSummary) =>
    token.revokedAt
      ? t('已撤销', 'Revoked')
      : new Date(token.expiresAt).getTime() <= Date.now()
        ? t('已过期', 'Expired')
        : t('有效', 'Active');

  return (
    <PageBody>
      <Column gap="6">
        <PageHeader title={t('MCP 接入', 'MCP access')} />
        <Panel>
          <Heading size="2xl">{t('连接统计数据', 'Connect your analytics')}</Heading>
          <Text color="muted">
            {t(
              '使用支持 Streamable HTTP 和自定义请求头的 MCP 客户端。每次调用都会重新检查令牌及账号当前的网站权限。',
              'Use an MCP client supporting Streamable HTTP and custom headers. Every call checks the token and your current website permissions.',
            )}
          </Text>
          <Row alignItems="center" gap style={{ flexWrap: 'wrap' }}>
            <Code style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{endpoint}</Code>
            <CopyButton value={endpoint} label={t('复制服务器地址', 'Copy server URL')} />
          </Row>
          <Text>
            {t('请求头', 'Header')}: <Code>Authorization: Bearer &lt;MCP_TOKEN&gt;</Code>
          </Text>
          <Text color="muted" size="sm">
            {t(
              '先调用 connection_status 检查账号和权限，再调用 list_websites 获取授权网站。无需向客户端提供账号密码。',
              'Call connection_status to verify the account and scopes, then list_websites. No account password is needed by the client.',
            )}
          </Text>
        </Panel>
        <LoadingPanel data={result.data} isLoading={result.isLoading} error={result.error}>
          <Column gap="6">
            <Panel>
              <Heading size="2xl">{t('创建访问令牌', 'Create access token')}</Heading>
              <Text color="muted">
                {t(
                  '默认仅允许读取选定网站的统计。最多保留 20 个有效令牌；创建后完整令牌只显示一次。',
                  'Tokens read analytics for selected websites by default. Up to 20 active tokens; the full token is displayed once.',
                )}
              </Text>
              <Row gap="4" style={{ flexWrap: 'wrap' }}>
                <TextField
                  label={t('令牌名称', 'Token name')}
                  aria-label={t('令牌名称', 'Token name')}
                  value={name}
                  onChange={setName}
                  maxLength={100}
                  required
                  data-test="mcp-token-name"
                />
                <Select
                  label={t('有效期', 'Expires after')}
                  value={expiry}
                  onChange={value => setExpiry(Number(value))}
                >
                  {[1, 7, 30, 90, 180, 365].map(days => (
                    <ListItem key={days} id={days}>
                      {days} {t('天', 'days')}
                    </ListItem>
                  ))}
                </Select>
              </Row>
              <Column gap="2">
                <Text weight="bold">
                  {t('授权网站（至少选择一个）', 'Websites (select at least one)')}
                </Text>
                <TextField
                  aria-label={t('搜索授权网站', 'Search websites')}
                  placeholder={t('搜索网站名称或域名', 'Search website name or domain')}
                  value={websiteSearch}
                  onChange={setWebsiteSearch}
                />
                <Column gap="2" style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {result.data?.websites
                    .filter(website =>
                      `${website.name} ${website.domain || ''}`
                        .toLowerCase()
                        .includes(websiteSearch.toLowerCase()),
                    )
                    .map(website => (
                      <Checkbox
                        key={website.id}
                        isDisabled={websiteIds.length >= 100 && !websiteIds.includes(website.id)}
                        isSelected={websiteIds.includes(website.id)}
                        onChange={selected =>
                          setWebsiteIds(current =>
                            selected
                              ? [...current, website.id]
                              : current.filter(id => id !== website.id),
                          )
                        }
                      >
                        {website.name} · {website.domain || website.id}
                      </Checkbox>
                    ))}
                </Column>
                <Text size="sm" color="muted">
                  {t(
                    `已选择 ${websiteIds.length} 个网站（最多 100 个）`,
                    `${websiteIds.length} websites selected (maximum 100)`,
                  )}
                </Text>
                {result.data?.websites.length === 0 && (
                  <Text color="muted">
                    {t(
                      '暂无可访问的网站，请先添加网站或加入团队。',
                      'No websites available. Add a website or join its team first.',
                    )}
                  </Text>
                )}
              </Column>
              <Column gap="2">
                <Text weight="bold">
                  {t('额外权限（可选）', 'Additional permissions (optional)')}
                </Text>
                <Checkbox isSelected={sessions} onChange={setSessions}>
                  {t('读取访问明细，包含 IP 地址', 'Read session details, including IP addresses')}
                </Checkbox>
                <Checkbox isSelected={writeRules} onChange={setWriteRules}>
                  {t(
                    '创建、修改和删除事件绑定规则',
                    'Create, update and delete event binding rules',
                  )}
                </Checkbox>
                <Text size="sm" color="muted">
                  {t(
                    '编辑事件规则还需要对所选网站拥有编辑权限。',
                    'Editing event rules also requires update permission on every selected website.',
                  )}
                </Text>
              </Column>
              <Text color="muted">
                {t(`有效令牌 ${activeCount}/${limit}`, `Active tokens ${activeCount}/${limit}`)}
              </Text>
              <Row>
                <Button
                  variant="primary"
                  onPress={create}
                  isDisabled={
                    busy || !!issued || activeCount >= limit || !name.trim() || !websiteIds.length
                  }
                  data-test="mcp-create-token"
                >
                  {t('创建令牌', 'Create token')}
                </Button>
              </Row>
              {issued && (
                <Column gap="3" border borderRadius padding="4" data-test="mcp-issued-token">
                  <Text weight="bold">
                    {t(
                      '请立即复制并妥善保存，关闭后无法再次查看。',
                      'Copy and store this token now. It cannot be shown again.',
                    )}
                  </Text>
                  <Row gap alignItems="center" style={{ flexWrap: 'wrap' }}>
                    <Code style={{ overflowWrap: 'anywhere' }}>{issued.token}</Code>
                    <CopyButton value={issued.token} label={t('复制完整令牌', 'Copy full token')} />
                  </Row>
                  <Row>
                    <Button onPress={() => setIssued(undefined)}>
                      {t('已保存，隐藏令牌', 'Saved; hide token')}
                    </Button>
                  </Row>
                </Column>
              )}
              {error && (
                <Text role="alert" style={{ color: 'var(--color-danger, #dc2626)' }}>
                  {error}
                </Text>
              )}
            </Panel>
            <Panel>
              <Heading size="2xl">{t('我的访问令牌', 'My access tokens')}</Heading>
              <div style={{ overflowX: 'auto' }}>
                <DataTable
                  data={result.data?.tokens || []}
                  aria-label={t('我的访问令牌', 'My access tokens')}
                  style={{ minWidth: '820px' }}
                >
                  <DataColumn id="name" label={t('名称', 'Name')} width="150px" />
                  <DataColumn id="prefix" label={t('标识', 'Identifier')} width="180px">
                    {row => <Code>{row.prefix}…</Code>}
                  </DataColumn>
                  <DataColumn id="websiteIds" label={t('网站数', 'Websites')} width="80px">
                    {row => (
                      <Text title={websiteNames(row.websiteIds)}>{row.websiteIds.length}</Text>
                    )}
                  </DataColumn>
                  <DataColumn id="scopes" label={t('权限', 'Permissions')} width="220px">
                    {row => (
                      <Text>{row.scopes.map(scope => scopeLabels[scope] || scope).join(', ')}</Text>
                    )}
                  </DataColumn>
                  <DataColumn id="expiresAt" label={t('到期时间', 'Expires')} width="170px">
                    {row => new Date(row.expiresAt).toLocaleString(locale)}
                  </DataColumn>
                  <DataColumn id="status" label={t('状态', 'Status')} width="100px">
                    {row => state(row)}
                  </DataColumn>
                  <DataColumn id="actions" label={t('操作', 'Actions')} width="110px">
                    {row =>
                      !row.revokedAt && (
                        <Button size="sm" isDisabled={busy} onPress={() => revoke(row.id)}>
                          {t('撤销', 'Revoke')}
                        </Button>
                      )
                    }
                  </DataColumn>
                </DataTable>
              </div>
            </Panel>
          </Column>
        </LoadingPanel>
      </Column>
    </PageBody>
  );
}
