'use client';

import {
  Button,
  Column,
  DataColumn,
  DataTable,
  ListItem,
  Row,
  Select,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  TextField,
} from '@umami/react-zen';
import Papa from 'papaparse';
import { useState } from 'react';
import { WebsiteControls } from '@/app/(main)/websites/[websiteId]/WebsiteControls';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { Pager } from '@/components/common/Pager';
import { Panel } from '@/components/common/Panel';
import { useApi, useDateParameters, useFilterParameters, useLocale } from '@/components/hooks';
import { DialogButton } from '@/components/input/DialogButton';
import { MetricCard } from '@/components/metrics/MetricCard';
import { MetricsBar } from '@/components/metrics/MetricsBar';
import { parseIpRule } from '@/lib/ip-rules';
import type { IpAnalyticsOptions, IpAnalyticsResult } from '@/types/ipAnalytics';
import styles from './IpAddressesPage.module.css';
import { getIpCopy } from './ipCopy';

type Rule = { id: string; pattern: string; name: string; isEnabled: boolean; createdAt?: string };
type RuleResult = { data: Rule[]; canEdit: boolean; limit: number };

export function IpAddressesPage({ websiteId }: { websiteId: string }) {
  const { locale } = useLocale();
  const copy = getIpCopy(locale);
  const { get, post, put, del, useQuery } = useApi();
  const dates = useDateParameters();
  const filters = useFilterParameters({ includePagination: false });
  const [tab, setTab] = useState('report');
  const [options, setOptions] = useState<IpAnalyticsOptions>({
    search: '',
    orderBy: 'pageviews',
    descending: true,
  });
  const [pagination, setPagination] = useState({ key: '', page: 1 });
  const key = JSON.stringify({ ...dates, ...filters, ...options });
  const page = pagination.key === key ? pagination.page : 1;
  const params = { ...dates, ...filters, ...options, page, pageSize: 25 };
  const report = useQuery<IpAnalyticsResult>({
    queryKey: ['websites:ip-addresses', websiteId, params],
    queryFn: () => get(`/websites/${websiteId}/ip-addresses`, params),
    enabled: tab === 'report',
    placeholderData: previous => previous,
  });
  const rules = useQuery<RuleResult>({
    queryKey: ['websites:ip-rules', websiteId],
    queryFn: () => get(`/websites/${websiteId}/ip-rules`),
  });
  const [editing, setEditing] = useState<Rule | null>(null);
  const [pattern, setPattern] = useState('');
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const number = (value: number) => value.toLocaleString(locale);
  const formatDate = (value: number) =>
    new Date(value).toLocaleString(locale, { timeZone: dates.timezone });
  const beginEdit = (rule?: Rule, ip = '') => {
    setEditing(rule || null);
    setPattern(rule?.pattern || ip);
    setName(rule?.name || '');
    setError('');
    setOpen(true);
  };
  const mutate = async (operation: () => Promise<unknown>, close = false) => {
    setBusy(true);
    setError('');
    try {
      await operation();
      await rules.refetch();
      if (close) setOpen(false);
    } catch (failure) {
      const code = (failure as { code?: string })?.code;
      setError(
        code === 'ip-rule-duplicate'
          ? copy.duplicate
          : code === 'ip-rule-limit'
            ? copy.limit
            : copy.failed,
      );
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    if (!parseIpRule(pattern)) {
      setError(copy.invalid);
      return;
    }
    const body = { pattern, name, isEnabled: editing?.isEnabled ?? true };
    return mutate(
      () =>
        editing
          ? put(`/websites/${websiteId}/ip-rules/${editing.id}`, body)
          : post(`/websites/${websiteId}/ip-rules`, body),
      true,
    );
  };
  const download = async () => {
    setExporting(true);
    setExportError(false);
    try {
      const result: IpAnalyticsResult = await get(`/websites/${websiteId}/ip-addresses`, {
        ...params,
        page: 1,
        pageSize: 10000,
      });
      const csv = Papa.unparse(
        result.data.map(row => ({
          IP: row.ip,
          [copy.visitors]: row.visitors,
          [copy.visits]: row.visits,
          [copy.pageviews]: row.pageviews,
          [copy.lastSeen]: formatDate(row.lastSeen),
        })),
        { escapeFormulae: true },
      );
      const url = URL.createObjectURL(
        new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `ip-addresses-${websiteId}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Column gap data-test="ip-analysis">
      <Column gap="2">
        <Text size="xl" weight="bold">
          {copy.title}
        </Text>
        <Text color="muted">{copy.description}</Text>
      </Column>
      <Tabs selectedKey={tab} onSelectionChange={value => setTab(String(value))}>
        <TabList aria-label={copy.title}>
          <Tab id="report">{copy.report}</Tab>
          <Tab id="rules">{copy.rules}</Tab>
        </TabList>
        <TabPanel id="report">
          <Column gap>
            <WebsiteControls websiteId={websiteId}>
              <DialogButton label={copy.options} width="420px" variant="outline">
                {({ close }) => (
                  <IpOptions
                    initial={options}
                    locale={locale}
                    onApply={value => {
                      setOptions(value);
                      close();
                    }}
                  />
                )}
              </DialogButton>
            </WebsiteControls>
            <LoadingPanel
              isLoading={report.isLoading}
              error={report.error}
              data={report.data}
              minHeight="300px"
            >
              {report.data && (
                <Column gap aria-busy={report.isFetching}>
                  <MetricsBar>
                    {(['addresses', 'visitors', 'visits', 'pageviews'] as const).map(metric => (
                      <MetricCard
                        key={metric}
                        label={copy[metric]}
                        value={report.data.summary[metric]}
                        formatValue={number}
                      />
                    ))}
                  </MetricsBar>
                  <Panel minWidth="0">
                    <Row justifyContent="space-between" alignItems="center" gap wrap="wrap">
                      <Text color="muted">
                        {copy.coverage}：{number(report.data.summary.coveredVisits)} ·{' '}
                        {copy.missing}：{number(report.data.summary.missingVisits)}
                      </Text>
                      <Button
                        onPress={download}
                        isDisabled={exporting || report.isFetching || !report.data.count}
                      >
                        {report.data.count > 10000 ? copy.exportLimit : copy.export}
                      </Button>
                    </Row>
                    {exportError && <Text role="alert">{copy.exportFailed}</Text>}
                    {report.data.data.length ? (
                      <div className={`${styles.scroll} rr-block`} data-umami-ignore>
                        <DataTable
                          data={report.data.data}
                          aria-label={copy.report}
                          className={styles.table}
                        >
                          <DataColumn id="ip" label="IP" width="minmax(170px, 2fr)" />
                          <DataColumn id="visitors" label={copy.visitors} align="end">
                            {row => number(row.visitors)}
                          </DataColumn>
                          <DataColumn id="visits" label={copy.visits} align="end">
                            {row => number(row.visits)}
                          </DataColumn>
                          <DataColumn id="pageviews" label={copy.pageviews} align="end">
                            {row => number(row.pageviews)}
                          </DataColumn>
                          <DataColumn id="lastSeen" label={copy.lastSeen} width="190px">
                            {row => formatDate(row.lastSeen)}
                          </DataColumn>
                          {rules.data?.canEdit && (
                            <DataColumn id="exclude" label="" width="120px">
                              {row => (
                                <Button
                                  variant="quiet"
                                  onPress={() => beginEdit(undefined, row.ip)}
                                >
                                  {copy.exclude}
                                </Button>
                              )}
                            </DataColumn>
                          )}
                        </DataTable>
                      </div>
                    ) : (
                      <Text role="status" color="muted">
                        {copy.empty}
                      </Text>
                    )}
                    <Pager
                      page={page}
                      pageSize={25}
                      count={report.data.count}
                      onPageChange={next => setPagination({ key, page: next })}
                    />
                    <Text color="muted" size="sm">
                      {copy.privacy}
                    </Text>
                    <Text color="muted" size="sm">
                      {copy.countNote}
                    </Text>
                  </Panel>
                </Column>
              )}
            </LoadingPanel>
          </Column>
        </TabPanel>
        <TabPanel id="rules">
          <Panel minWidth="0">
            <Row justifyContent="space-between" alignItems="center" gap wrap="wrap">
              <Text color="muted">{copy.note}</Text>
              {rules.data?.canEdit && <Button onPress={() => beginEdit()}>{copy.add}</Button>}
            </Row>
            {error && !open && <Text role="alert">{error}</Text>}
            <LoadingPanel isLoading={rules.isLoading} error={rules.error} data={rules.data}>
              {!rules.data?.canEdit && <Text color="muted">{copy.readOnly}</Text>}
              {rules.data?.data.length ? (
                <div className={`${styles.scroll} rr-block`} data-umami-ignore>
                  <DataTable
                    data={rules.data.data}
                    aria-label={copy.rules}
                    className={styles.rules}
                  >
                    <DataColumn id="pattern" label={copy.pattern} width="minmax(180px, 2fr)" />
                    <DataColumn id="name" label={copy.name} width="minmax(130px, 1fr)" />
                    <DataColumn id="createdAt" label={copy.addedAt} width="190px">
                      {row => (row.createdAt ? formatDate(Date.parse(row.createdAt)) : '—')}
                    </DataColumn>
                    <DataColumn id="isEnabled" label="" width="90px">
                      {row => (row.isEnabled ? copy.enabled : copy.disabled)}
                    </DataColumn>
                    {rules.data.canEdit && (
                      <DataColumn id="actions" label="" width="220px">
                        {row => (
                          <Row gap="1">
                            <Button
                              variant="quiet"
                              isDisabled={busy}
                              onPress={() => beginEdit(row)}
                            >
                              {copy.edit}
                            </Button>
                            <Button
                              variant="quiet"
                              isDisabled={busy}
                              onPress={() =>
                                mutate(() =>
                                  put(`/websites/${websiteId}/ip-rules/${row.id}`, {
                                    isEnabled: !row.isEnabled,
                                  }),
                                )
                              }
                            >
                              {row.isEnabled ? copy.disable : copy.enable}
                            </Button>
                            <Button
                              variant="quiet"
                              isDisabled={busy}
                              onPress={() =>
                                mutate(() => del(`/websites/${websiteId}/ip-rules/${row.id}`))
                              }
                            >
                              {copy.remove}
                            </Button>
                          </Row>
                        )}
                      </DataColumn>
                    )}
                  </DataTable>
                </div>
              ) : (
                <Text color="muted">{copy.noRules}</Text>
              )}
            </LoadingPanel>
          </Panel>
        </TabPanel>
      </Tabs>
      <DialogButton
        label={editing ? copy.edit : copy.add}
        width="560px"
        isOpen={open}
        onOpenChange={value => {
          if (!busy) setOpen(value);
        }}
      >
        <Column gap="4" className="rr-block" data-umami-ignore>
          <TextField
            label={copy.pattern}
            aria-label={copy.pattern}
            value={pattern}
            onChange={setPattern}
            maxLength={100}
            required
          />
          <Text size="sm" color="muted">
            {copy.example}
          </Text>
          <TextField
            label={copy.name}
            aria-label={copy.name}
            value={name}
            onChange={setName}
            maxLength={100}
          />
          {error && <Text role="alert">{error}</Text>}
          <Row gap="2" justifyContent="flex-end">
            <Button isDisabled={busy} onPress={() => setOpen(false)}>
              {copy.cancel}
            </Button>
            <Button variant="primary" isDisabled={busy} onPress={save}>
              {copy.save}
            </Button>
          </Row>
        </Column>
      </DialogButton>
    </Column>
  );
}

function IpOptions({
  initial,
  locale,
  onApply,
}: {
  initial: IpAnalyticsOptions;
  locale: string;
  onApply: (value: IpAnalyticsOptions) => void;
}) {
  const copy = getIpCopy(locale);
  const [value, setValue] = useState(initial);
  return (
    <Column gap="4">
      <TextField
        label={copy.search}
        aria-label={copy.search}
        value={value.search || ''}
        onChange={search => setValue({ ...value, search })}
        maxLength={100}
      />
      <Select
        label={copy.sort}
        aria-label={copy.sort}
        value={value.orderBy}
        onChange={orderBy =>
          setValue({ ...value, orderBy: orderBy as IpAnalyticsOptions['orderBy'] })
        }
      >
        {(['pageviews', 'visitors', 'visits', 'lastSeen', 'ip'] as const).map(id => (
          <ListItem key={id} id={id}>
            {id === 'ip' ? 'IP' : copy[id]}
          </ListItem>
        ))}
      </Select>
      <Select
        label={copy.direction}
        aria-label={copy.direction}
        value={String(value.descending)}
        onChange={descending => setValue({ ...value, descending: descending === 'true' })}
      >
        <ListItem id="true">{copy.descending}</ListItem>
        <ListItem id="false">{copy.ascending}</ListItem>
      </Select>
      <Button variant="primary" onPress={() => onApply(value)}>
        {copy.apply}
      </Button>
    </Column>
  );
}
