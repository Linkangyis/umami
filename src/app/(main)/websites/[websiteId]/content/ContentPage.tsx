'use client';
import { keepPreviousData } from '@tanstack/react-query';
import {
  Button,
  Column,
  DataColumn,
  DataTable,
  ListItem,
  Row,
  SearchField,
  Select,
  Text,
  useDebounce,
} from '@umami/react-zen';
import Papa from 'papaparse';
import { useEffect, useState } from 'react';
import { WebsiteControls } from '@/app/(main)/websites/[websiteId]/WebsiteControls';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { Pager } from '@/components/common/Pager';
import { Panel } from '@/components/common/Panel';
import { useApi, useLocale, useMessages, useNavigation } from '@/components/hooks';
import { useDateParameters } from '@/components/hooks/useDateParameters';
import { useFilterParameters } from '@/components/hooks/useFilterParameters';
import { DialogButton } from '@/components/input/DialogButton';
import { MetricCard } from '@/components/metrics/MetricCard';
import { MetricsBar } from '@/components/metrics/MetricsBar';
import {
  CONTENT_MODES,
  CONTENT_SORT_FIELDS,
  type ContentMetrics,
  type ContentMode,
  type ContentReport,
  type ContentSortField,
} from '@/lib/content-report';
import { formatLongNumber, formatShortTime } from '@/lib/format';
import { ContentGroupsManager } from './ContentGroupsManager';
import { getContentCopy } from './contentCopy';

const metrics = [
  'pageviews',
  'visitors',
  'visits',
  'newVisitors',
  'entrances',
  'exits',
  'exitRate',
  'bounceRate',
  'averageDwell',
  'dwellCoverage',
] as const;

export function ContentPage({ websiteId }: { websiteId: string }) {
  const { locale } = useLocale();
  const text = getContentCopy(locale);
  const { getErrorMessage } = useMessages();
  const { get, useQuery } = useApi();
  const dates = useDateParameters();
  const filters = useFilterParameters({ includePagination: false });
  const { query, router, updateParams } = useNavigation();
  const mode: ContentMode = CONTENT_MODES.includes(query.contentMode as ContentMode)
    ? (query.contentMode as ContentMode)
    : 'fullUrl';
  const [search, setSearch] = useState(query.contentSearch || '');
  const searchValue = useDebounce(search, 350);
  const [version, setVersion] = useState(0);
  const hasDetail = query.contentDetail !== undefined;
  const page = Math.max(1, Math.min(10000, Number(query.contentPage) || 1));
  const pageSize = [20, 50, 100].includes(Number(query.contentPageSize))
    ? Number(query.contentPageSize)
    : 50;
  const orderBy: ContentSortField = CONTENT_SORT_FIELDS.includes(
    query.contentSort as ContentSortField,
  )
    ? (query.contentSort as ContentSortField)
    : 'pageviews';
  const parameters = {
    ...dates,
    ...filters,
    mode,
    page,
    pageSize,
    orderBy,
    sortDescending: query.contentDescending !== 'false',
    search: query.contentSearch || '',
    detail: query.contentDetail,
  };
  const report = useQuery<ContentReport>({
    queryKey: ['content-report', websiteId, parameters, version],
    queryFn: () => get(`/websites/${websiteId}/content`, parameters),
    placeholderData: keepPreviousData,
  });
  const update = (values: Record<string, string | number | undefined>) =>
    router.push(updateParams({ contentPage: 1, ...values }), { scroll: false });
  useEffect(() => {
    if (
      report.data &&
      !report.isPlaceholderData &&
      !report.isFetching &&
      page > Math.max(1, Math.ceil(report.data.count / pageSize))
    ) {
      router.replace(updateParams({ contentPage: 1 }), { scroll: false });
    }
  }, [report.data, report.isPlaceholderData, report.isFetching, page, pageSize]);
  useEffect(() => setSearch(query.contentSearch || ''), [query.contentSearch]);
  useEffect(() => {
    if (searchValue !== (query.contentSearch || '')) update({ contentSearch: searchValue });
  }, [searchValue]);
  const modeName = (value: ContentMode) => text[value === 'title' ? 'titleMode' : value];
  const value = (key: keyof ContentMetrics, number: number | null) => {
    if (number === null) return text.unknown;
    if (key === 'averageDwell') return formatShortTime(Math.round(number), ['h', 'm', 's'], ' ');
    if (['exitRate', 'bounceRate', 'dwellCoverage'].includes(key)) return `${number.toFixed(1)}%`;
    return formatLongNumber(number);
  };
  const download = () => {
    const rows = report.data.rows.map(row => ({
      [text.name]: row.name,
      ...Object.fromEntries(metrics.map(key => [text[key], row[key] ?? ''])),
    }));
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', Papa.unparse(rows, { escapeFormulae: true })], {
        type: 'text/csv;charset=utf-8',
      }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `content-${mode}-page-${page}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Column gap="6" data-test="content-report">
      <Column gap="2">
        <Text size="xl" weight="bold">
          {text.title}
        </Text>
        <Text color="muted">{modeName(mode)}</Text>
      </Column>
      <WebsiteControls websiteId={websiteId} allowBounceFilter>
        <DialogButton label={text.options} width="440px" variant="outline">
          {({ close }) => (
            <Column gap="4">
              <Select
                label={text.mode}
                aria-label={text.mode}
                value={mode}
                onChange={value => update({ contentMode: String(value), contentDetail: undefined })}
              >
                {CONTENT_MODES.map(item => (
                  <ListItem key={item} id={item}>
                    {modeName(item)}
                  </ListItem>
                ))}
              </Select>
              <Select
                label={text.rows}
                aria-label={text.rows}
                value={String(pageSize)}
                onChange={value => update({ contentPageSize: String(value) })}
              >
                {[20, 50, 100].map(item => (
                  <ListItem key={item} id={String(item)}>
                    {item}
                  </ListItem>
                ))}
              </Select>
              <Select
                label={text.orderBy}
                aria-label={text.orderBy}
                value={orderBy}
                onChange={value => update({ contentSort: String(value) })}
              >
                {CONTENT_SORT_FIELDS.map(item => (
                  <ListItem key={item} id={item}>
                    {text[item]}
                  </ListItem>
                ))}
              </Select>
              <Select
                label={text.order}
                aria-label={text.order}
                value={parameters.sortDescending ? 'desc' : 'asc'}
                onChange={value => update({ contentDescending: String(value === 'desc') })}
              >
                <ListItem id="desc">{text.descending}</ListItem>
                <ListItem id="asc">{text.ascending}</ListItem>
              </Select>
              <Row justifyContent="flex-end">
                <Button variant="primary" onClick={close}>
                  {text.done}
                </Button>
              </Row>
            </Column>
          )}
        </DialogButton>
        {report.data?.canManageGroups && (
          <DialogButton label={text.groupsManage} width="760px" variant="outline">
            <ContentGroupsManager
              websiteId={websiteId}
              onChange={() => setVersion(version => version + 1)}
            />
          </DialogButton>
        )}
      </WebsiteControls>
      <LoadingPanel
        data={report.data}
        isLoading={report.isLoading}
        error={getErrorMessage(report.error)}
        minHeight="300px"
      >
        {report.data && (
          <Column gap="6" aria-busy={report.isFetching}>
            <MetricsBar>
              {(['pageviews', 'visitors', 'visits', 'entrances'] as const).map(key => (
                <MetricCard
                  key={key}
                  label={text[key]}
                  value={report.data.summary[key]}
                  formatValue={formatLongNumber}
                />
              ))}
            </MetricsBar>
            <Panel>
              <Column gap="4">
                <Row justifyContent="space-between" alignItems="center" wrap="wrap" gap="3">
                  <SearchField
                    aria-label={text.search}
                    placeholder={text.search}
                    value={search}
                    onChange={setSearch}
                  />
                  <Button onClick={download} isDisabled={!report.data.rows.length}>
                    {text.download}
                  </Button>
                </Row>
                {mode === 'group' && (
                  <Text size="sm" color="muted">
                    {text.groupsDefinition}
                  </Text>
                )}
                <div style={{ overflowX: 'auto' }}>
                  <DataTable data={report.data.rows} data-test="content-table">
                    <DataColumn id="name" label={text.name} width="300px">
                      {row => (
                        <Column gap="1">
                          <Text style={{ overflowWrap: 'anywhere' }}>
                            {row.name || text.unknown}
                          </Text>
                          {row.entrances > 0 && (
                            <Row>
                              <Button
                                variant="quiet"
                                size="sm"
                                onClick={() =>
                                  update({ contentDetail: row.key, contentPage: page })
                                }
                              >
                                {text.sourceDetail}
                              </Button>
                            </Row>
                          )}
                        </Column>
                      )}
                    </DataColumn>
                    {metrics.map(key => (
                      <DataColumn key={key} id={key} label={text[key]} align="end" width="120px">
                        {row => value(key, row[key])}
                      </DataColumn>
                    ))}
                  </DataTable>
                </div>
                {!report.data.rows.length && (
                  <Text>
                    {mode === 'group' && report.data.groupCount === 0 ? text.noGroups : text.noData}
                  </Text>
                )}
                <Pager
                  page={page}
                  pageSize={pageSize}
                  count={report.data.count}
                  onPageChange={next => update({ contentPage: next })}
                />
              </Column>
            </Panel>
            <Panel>
              <Column gap="3">
                <Row alignItems="center" justifyContent="space-between" gap="3">
                  <Text weight="bold">{text.sources}</Text>
                  {hasDetail && (
                    <Button
                      variant="quiet"
                      onClick={() => update({ contentDetail: undefined, contentPage: page })}
                    >
                      {text.allSources}
                    </Button>
                  )}
                </Row>
                {hasDetail && (
                  <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                    {report.data.rows.find(row => row.key === query.contentDetail)?.name ||
                      query.contentDetail ||
                      text.unknown}
                  </Text>
                )}
                <Text size="sm" color="muted">
                  {text.sourceDefinition}
                </Text>
                <DataTable data={report.data.sources} data-test="content-sources">
                  <DataColumn id="name" label={text.source}>
                    {row => row.name || text.direct}
                  </DataColumn>
                  <DataColumn id="entrances" label={text.entrances} align="end" />
                  <DataColumn id="visitors" label={text.visitors} align="end" />
                  <DataColumn id="bounceRate" label={text.bounceRate} align="end">
                    {row => value('bounceRate', row.bounceRate)}
                  </DataColumn>
                  <DataColumn id="contribution" label={text.contribution} align="end">
                    {row => `${row.contribution.toFixed(1)}%`}
                  </DataColumn>
                </DataTable>
              </Column>
            </Panel>
          </Column>
        )}
      </LoadingPanel>
      <details>
        <summary>{text.methodology}</summary>
        <Column gap="3" paddingY="3">
          <Text size="sm">{text.definitions}</Text>
          <Text size="sm">{text.dwellDefinition}</Text>
          <Text size="sm">{text.identityDefinition}</Text>
        </Column>
      </details>
    </Column>
  );
}
