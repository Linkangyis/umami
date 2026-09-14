'use client';
import {
  Button,
  Code,
  Column,
  DataColumn,
  DataTable,
  Grid,
  Heading,
  ListItem,
  Row,
  SearchField,
  Select,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  TextField,
} from '@umami/react-zen';
import { useEffect, useMemo, useState } from 'react';
import { CopyButton } from '@/components/common/CopyButton';
import { LinkButton } from '@/components/common/LinkButton';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { Panel } from '@/components/common/Panel';
import { useApi, useLocale, useWebsite } from '@/components/hooks';
import {
  buildCampaignUrl,
  CAMPAIGN_FIELDS,
  CAMPAIGN_QUERY_KEYS,
  type CampaignField,
  type CampaignLinkInput,
  campaignAnalysisUrl,
  campaignLinkSchema,
} from '@/lib/campaigns';
import type {
  CampaignLink,
  CampaignLinksResponse,
  CampaignParameter,
  CampaignParametersResponse,
} from '@/types/campaigns';

const emptyLink: CampaignLinkInput = {
  name: '',
  destinationUrl: '',
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
  utmTerm: '',
  utmContent: '',
};
const fieldNames = {
  utmSource: ['来源', 'Source'],
  utmMedium: ['媒介', 'Medium'],
  utmCampaign: ['活动', 'Campaign'],
  utmTerm: ['关键词', 'Term'],
  utmContent: ['内容', 'Content'],
};

export function CampaignsPage({ websiteId }: { websiteId: string }) {
  const { locale } = useLocale();
  const cn = locale.startsWith('zh');
  const t = (zh: string, en: string) => (cn ? zh : en);
  const label = (field: CampaignField) => fieldNames[field][cn ? 0 : 1];
  const website = useWebsite();
  const { get, post, put, del, useQuery } = useApi();
  const linksPath = `/websites/${websiteId}/campaigns`;
  const parametersPath = `/websites/${websiteId}/campaign-parameters`;
  const links = useQuery<CampaignLinksResponse>({
    queryKey: ['campaign-links', websiteId],
    queryFn: () => get(linksPath),
  });
  const parameters = useQuery<CampaignParametersResponse>({
    queryKey: ['campaign-parameters', websiteId],
    queryFn: () => get(parametersPath),
  });
  const [tab, setTab] = useState('links');
  const [draft, setDraft] = useState<CampaignLinkInput>(emptyLink);
  const [editingLink, setEditingLink] = useState<string>();
  const [parameterField, setParameterField] = useState<CampaignField>('utmSource');
  const [parameterValue, setParameterValue] = useState('');
  const [parameterLabel, setParameterLabel] = useState('');
  const [editingParameter, setEditingParameter] = useState<string>();
  const [search, setSearch] = useState('');
  const [parameterSearch, setParameterSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canEdit = links.data?.canEdit === true;
  const presets = parameters.data?.data || [];
  const preview = useMemo(() => {
    try {
      return { url: buildCampaignUrl(draft.destinationUrl, draft) };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }, [draft]);
  const visibleLinks = (links.data?.data || []).filter(link =>
    `${link.name} ${link.url}`.toLowerCase().includes(search.toLowerCase()),
  );
  const visibleParameters = presets.filter(parameter =>
    `${parameter.label} ${parameter.value}`.toLowerCase().includes(parameterSearch.toLowerCase()),
  );

  useEffect(() => {
    const domain = website?.domain?.split(',')[0]?.trim();
    if (!domain) return;
    const destinationUrl = /^https?:\/\//i.test(domain)
      ? domain
      : `${/^(localhost|127\.|\[::1\])/.test(domain) ? 'http' : 'https'}://${domain}/`;
    setDraft(current => (current.destinationUrl ? current : { ...current, destinationUrl }));
  }, [website?.domain]);

  const errorMessage = (value: unknown) => {
    const code = (value as { code?: string })?.code;
    if (code === 'campaign-limit')
      return t(
        '已达到本站的保存数量上限，请先删除不再使用的条目。',
        'The website limit is reached. Delete an unused item first.',
      );
    if (code === 'campaign-duplicate')
      return t('相同类型和值的常用参数已经存在。', 'That parameter type and value already exist.');
    if (code === 'forbidden' || code === 'unauthorized')
      return t('当前账号没有修改权限。', 'This account does not have update permission.');
    return t('操作失败，请检查输入后重试。', 'The operation failed. Check the values and retry.');
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const update = (field: keyof CampaignLinkInput, value: string) =>
    setDraft(current => ({ ...current, [field]: value }));
  const resetParameter = () => {
    setEditingParameter(undefined);
    setParameterValue('');
    setParameterLabel('');
  };

  const saveLink = () => {
    const parsed = campaignLinkSchema.safeParse(draft);
    if (!parsed.success) {
      setError(
        t(
          '请填写链接名称、有效目标地址和来源，并检查链接长度。',
          'Enter a name, valid destination and source, and check the URL length.',
        ),
      );
      return;
    }
    run(async () => {
      if (editingLink) await put(`${linksPath}/${editingLink}`, parsed.data);
      else await post(linksPath, parsed.data);
      await links.refetch();
      setEditingLink(undefined);
      setNotice(t('渠道链接已保存。', 'Campaign link saved.'));
    });
  };
  const editLink = (link: CampaignLink) => {
    const { name, destinationUrl, utmSource, utmMedium, utmCampaign, utmTerm, utmContent } = link;
    setDraft({ name, destinationUrl, utmSource, utmMedium, utmCampaign, utmTerm, utmContent });
    setEditingLink(link.id);
    setError('');
    setNotice('');
  };
  const saveParameter = () =>
    run(async () => {
      const value = {
        field: parameterField,
        value: parameterValue.trim(),
        ...(parameterLabel.trim() || editingParameter ? { label: parameterLabel.trim() } : {}),
      };
      if (editingParameter) await put(`${parametersPath}/${editingParameter}`, value);
      else await post(parametersPath, value);
      await parameters.refetch();
      resetParameter();
      setNotice(
        t(
          '常用参数已保存，相同参数会自动复用。',
          'Reusable parameter saved. Matching values are reused.',
        ),
      );
    });
  const editParameter = (parameter: CampaignParameter) => {
    setEditingParameter(parameter.id);
    setParameterField(parameter.field);
    setParameterValue(parameter.value);
    setParameterLabel(parameter.label);
    setError('');
    setNotice('');
  };

  return (
    <Column gap>
      <Row justifyContent="space-between" alignItems="center" gap style={{ flexWrap: 'wrap' }}>
        <Heading size="2xl">{t('渠道链接与参数', 'Campaign links and parameters')}</Heading>
        <LinkButton href={`/websites/${websiteId}/utm`} variant="outline">
          {t('UTM 分析', 'UTM analysis')}
        </LinkButton>
      </Row>
      <Text color="muted">
        {t(
          '生成带 UTM 标记的推广链接，保存常用来源和活动参数，再查看这些渠道带来的实际访问。',
          'Build UTM-tagged links, reuse source and campaign values, then inspect their actual traffic.',
        )}
      </Text>
      {error && (
        <Text role="alert" style={{ color: '#dc2626' }}>
          {error}
        </Text>
      )}
      {notice && <Text role="status">{notice}</Text>}
      <LoadingPanel
        data={links.data}
        isLoading={links.isLoading || parameters.isLoading}
        error={links.error || parameters.error}
        minHeight="300px"
      >
        <Tabs
          selectedKey={tab}
          onSelectionChange={value => {
            setTab(String(value));
            setError('');
            setNotice('');
          }}
        >
          <TabList>
            <Tab id="links">{t('渠道链接', 'Campaign links')}</Tab>
            <Tab id="parameters">{t('常用参数', 'Reusable parameters')}</Tab>
          </TabList>
          <TabPanel id="links">
            <Column gap>
              <Panel>
                <Heading size="xl">
                  {editingLink ? t('编辑链接', 'Edit link') : t('生成链接', 'Build a link')}
                </Heading>
                <Grid columns={{ base: '1fr', md: '1fr 1fr' }} gap="4">
                  <Column gap="2">
                    <TextField
                      label={t('链接名称', 'Link name')}
                      aria-label={t('链接名称', 'Link name')}
                      value={draft.name}
                      onChange={value => update('name', value)}
                      maxLength={100}
                      data-test="campaign-name"
                    />
                  </Column>
                  <Column gap="2">
                    <TextField
                      label={t('目标地址', 'Destination URL')}
                      aria-label={t('目标地址', 'Destination URL')}
                      value={draft.destinationUrl}
                      onChange={value => update('destinationUrl', value)}
                      placeholder="https://example.com/?products/"
                      maxLength={2183}
                      data-test="campaign-destination"
                    />
                  </Column>
                </Grid>
                <Grid columns={{ base: '1fr', md: '1fr 1fr', xl: 'repeat(3, 1fr)' }} gap="4">
                  {CAMPAIGN_FIELDS.map(field => {
                    const values = presets.filter(parameter => parameter.field === field);
                    return (
                      <Column key={field} gap="2">
                        <TextField
                          label={`${label(field)} (${CAMPAIGN_QUERY_KEYS[field]})${field === 'utmSource' ? ' *' : ''}`}
                          aria-label={`${label(field)} (${CAMPAIGN_QUERY_KEYS[field]})${field === 'utmSource' ? ' *' : ''}`}
                          value={draft[field]}
                          onChange={value => update(field, value)}
                          maxLength={200}
                          data-test={`campaign-${field}`}
                        />
                        {values.length > 0 && (
                          <Select
                            aria-label={`${t('选择常用', 'Choose saved')} ${label(field)}`}
                            placeholder={t('选择常用参数', 'Choose a saved value')}
                            value={values.find(value => value.value === draft[field])?.id || ''}
                            onChange={id => {
                              const item = values.find(value => value.id === id);
                              if (item) update(field, item.value);
                            }}
                          >
                            {values.map(parameter => (
                              <ListItem id={parameter.id} key={parameter.id}>
                                {parameter.label
                                  ? `${parameter.label} · ${parameter.value}`
                                  : parameter.value}
                              </ListItem>
                            ))}
                          </Select>
                        )}
                      </Column>
                    );
                  })}
                </Grid>
                {preview.url ? (
                  <Column gap="2">
                    <TextField
                      label={t('生成的链接', 'Generated link')}
                      aria-label={t('生成的链接', 'Generated link')}
                      value={preview.url}
                      isReadOnly
                      asTextArea
                      resize="none"
                      data-test="campaign-preview"
                    />
                    <Row gap>
                      <CopyButton
                        value={preview.url}
                        label={t('复制渠道链接', 'Copy campaign link')}
                      />
                      <LinkButton
                        size="sm"
                        href={campaignAnalysisUrl(websiteId, draft)}
                        variant="outline"
                      >
                        {t('查看渠道分析', 'View campaign analysis')}
                      </LinkButton>
                    </Row>
                  </Column>
                ) : (
                  <Text color="muted">
                    {preview.error === 'url-too-long'
                      ? t(
                          '生成的链接超过 2183 个字符，请缩短参数。',
                          'The generated URL exceeds 2183 characters. Shorten its values.',
                        )
                      : t(
                          '填写有效目标地址和来源后，即可预览并复制链接。',
                          'Enter a valid destination and source to preview and copy a link.',
                        )}
                  </Text>
                )}
                <Text color="muted" size="sm">
                  {t(
                    '保留目标地址的其他查询参数与锚点；已有 UTM 参数会被当前填写的值替换。',
                    'Other query parameters and fragments are preserved. Existing UTM parameters are replaced by these values.',
                  )}
                </Text>
                {canEdit ? (
                  <Row gap>
                    <Button
                      variant="primary"
                      onPress={saveLink}
                      isDisabled={busy || !preview.url || !draft.name.trim()}
                      data-test="campaign-save"
                    >
                      {t('保存链接', 'Save link')}
                    </Button>
                    {editingLink && (
                      <Button
                        onPress={() => {
                          setEditingLink(undefined);
                          setDraft(emptyLink);
                        }}
                      >
                        {t('取消编辑', 'Cancel editing')}
                      </Button>
                    )}
                  </Row>
                ) : (
                  <Text color="muted">
                    {t(
                      '当前账号可以查看和复制链接，没有保存或修改权限。',
                      'This account can view and copy links but cannot save or edit them.',
                    )}
                  </Text>
                )}
              </Panel>
              <Panel>
                <Row
                  justifyContent="space-between"
                  alignItems="center"
                  gap
                  style={{ flexWrap: 'wrap' }}
                >
                  <Heading size="xl">
                    {t('已保存链接', 'Saved links')} ({links.data?.count || 0}/
                    {links.data?.limit || 500})
                  </Heading>
                  <SearchField
                    aria-label={t('搜索链接', 'Search links')}
                    value={search}
                    onSearch={setSearch}
                    placeholder={t('搜索链接', 'Search links')}
                  />
                </Row>
                <div style={{ overflowX: 'auto' }}>
                  <DataTable
                    data={visibleLinks}
                    aria-label={t('已保存链接', 'Saved links')}
                    style={{ minWidth: '800px' }}
                  >
                    <DataColumn id="name" label={t('名称', 'Name')} width="140px" />
                    <DataColumn id="utmSource" label={label('utmSource')} width="100px" />
                    <DataColumn id="utmCampaign" label={label('utmCampaign')} width="130px" />
                    <DataColumn id="url" label={t('链接', 'Link')} width="minmax(200px,1fr)">
                      {row => (
                        <Row gap alignItems="center" minWidth="0" width="100%">
                          <Text truncate title={row.url} style={{ minWidth: 0, flex: 1 }}>
                            {row.url}
                          </Text>
                          <CopyButton value={row.url} label={t('复制链接', 'Copy link')} />
                        </Row>
                      )}
                    </DataColumn>
                    <DataColumn id="actions" label={t('操作', 'Actions')} width="250px">
                      {row => (
                        <Row gap="2">
                          <LinkButton
                            size="sm"
                            variant="quiet"
                            href={campaignAnalysisUrl(websiteId, row)}
                          >
                            {t('分析', 'Analyze')}
                          </LinkButton>
                          {canEdit && (
                            <>
                              <Button size="sm" variant="quiet" onPress={() => editLink(row)}>
                                {t('编辑', 'Edit')}
                              </Button>
                              <Button
                                size="sm"
                                variant="quiet"
                                isDisabled={busy}
                                onPress={() =>
                                  run(async () => {
                                    await del(`${linksPath}/${row.id}`);
                                    await links.refetch();
                                    if (editingLink === row.id) setEditingLink(undefined);
                                  })
                                }
                              >
                                {t('删除', 'Delete')}
                              </Button>
                            </>
                          )}
                        </Row>
                      )}
                    </DataColumn>
                  </DataTable>
                </div>
                {!visibleLinks.length && (
                  <Text color="muted">
                    {t('暂无匹配的渠道链接。', 'No matching campaign links.')}
                  </Text>
                )}
              </Panel>
            </Column>
          </TabPanel>
          <TabPanel id="parameters">
            <Panel>
              <Heading size="xl">
                {t('常用参数字典', 'Reusable parameter dictionary')} ({parameters.data?.count || 0}/
                {parameters.data?.limit || 500})
              </Heading>
              <Text color="muted">
                {t(
                  '按来源、媒介、活动、关键词和内容保存常用值。修改或删除字典项不会改动已保存的链接与已有统计。',
                  'Save values for source, medium, campaign, term and content. Editing or deleting a preset does not change saved links or collected traffic.',
                )}
              </Text>
              {canEdit && (
                <Column gap="3">
                  <Grid columns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap="4">
                    <Column gap="2">
                      <Select
                        label={t('参数类型', 'Parameter type')}
                        aria-label={t('参数类型', 'Parameter type')}
                        value={parameterField}
                        onChange={value => setParameterField(value as CampaignField)}
                      >
                        {CAMPAIGN_FIELDS.map(field => (
                          <ListItem id={field} key={field}>
                            {label(field)} ({CAMPAIGN_QUERY_KEYS[field]})
                          </ListItem>
                        ))}
                      </Select>
                    </Column>
                    <Column gap="2">
                      <TextField
                        label={t('参数值', 'Parameter value')}
                        aria-label={t('参数值', 'Parameter value')}
                        value={parameterValue}
                        onChange={setParameterValue}
                        maxLength={200}
                        data-test="campaign-parameter-value"
                      />
                    </Column>
                    <Column gap="2">
                      <TextField
                        label={t('显示名称（可选）', 'Display label (optional)')}
                        aria-label={t('显示名称（可选）', 'Display label (optional)')}
                        value={parameterLabel}
                        onChange={setParameterLabel}
                        maxLength={100}
                        data-test="campaign-parameter-label"
                      />
                    </Column>
                  </Grid>
                  <Row gap>
                    <Button
                      variant="primary"
                      isDisabled={busy || !parameterValue.trim()}
                      onPress={saveParameter}
                      data-test="campaign-parameter-save"
                    >
                      {editingParameter
                        ? t('保存修改', 'Save changes')
                        : t('保存参数', 'Save parameter')}
                    </Button>
                    {editingParameter && (
                      <Button onPress={resetParameter}>{t('取消编辑', 'Cancel editing')}</Button>
                    )}
                  </Row>
                </Column>
              )}
              <SearchField
                aria-label={t('搜索常用参数', 'Search reusable parameters')}
                value={parameterSearch}
                onSearch={setParameterSearch}
                placeholder={t('搜索常用参数', 'Search reusable parameters')}
              />
              <div style={{ overflowX: 'auto' }}>
                <DataTable
                  data={visibleParameters}
                  aria-label={t('常用参数字典', 'Reusable parameter dictionary')}
                  style={{ minWidth: '600px' }}
                >
                  <DataColumn id="field" label={t('类型', 'Type')} width="130px">
                    {row => label(row.field)}
                  </DataColumn>
                  <DataColumn id="value" label={t('参数值', 'Parameter value')}>
                    {row => <Code>{row.value}</Code>}
                  </DataColumn>
                  <DataColumn id="label" label={t('显示名称', 'Display label')} />
                  <DataColumn id="actions" label={t('操作', 'Actions')} width="200px">
                    {row => (
                      <Row gap="2">
                        <Button
                          size="sm"
                          variant="quiet"
                          onPress={() => {
                            update(row.field, row.value);
                            setTab('links');
                          }}
                        >
                          {t('使用', 'Use')}
                        </Button>
                        {canEdit && (
                          <>
                            <Button size="sm" variant="quiet" onPress={() => editParameter(row)}>
                              {t('编辑', 'Edit')}
                            </Button>
                            <Button
                              size="sm"
                              variant="quiet"
                              isDisabled={busy}
                              onPress={() =>
                                run(async () => {
                                  await del(`${parametersPath}/${row.id}`);
                                  await parameters.refetch();
                                  if (editingParameter === row.id) resetParameter();
                                })
                              }
                            >
                              {t('删除', 'Delete')}
                            </Button>
                          </>
                        )}
                      </Row>
                    )}
                  </DataColumn>
                </DataTable>
              </div>
            </Panel>
          </TabPanel>
        </Tabs>
      </LoadingPanel>
    </Column>
  );
}
