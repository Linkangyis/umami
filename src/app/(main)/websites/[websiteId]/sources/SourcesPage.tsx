'use client';
import {
  Button,
  Checkbox,
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
  Tabs,
  Text,
} from '@umami/react-zen';
import Papa from 'papaparse';
import { useCallback, useEffect, useState } from 'react';
import { WebsiteControls } from '@/app/(main)/websites/[websiteId]/WebsiteControls';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { Pager } from '@/components/common/Pager';
import { Panel } from '@/components/common/Panel';
import { useApi, useDateParameters, useFilterParameters, useLocale } from '@/components/hooks';
import { DialogButton } from '@/components/input/DialogButton';
import { MetricCard } from '@/components/metrics/MetricCard';
import { SOURCE_ENGINES } from '@/lib/source-classification';
import { getItem, setItem } from '@/lib/storage';
import {
  SOURCE_SORT_FIELDS,
  SOURCE_VIEWS,
  type SourceReport,
  type SourceRow,
  type SourceSort,
  type SourceView,
} from '@/types/sources';
import { getSourceCategoryNames, getSourceCopy } from './sourceCopy';

const metricColumns = [
  'visitors',
  'pageviews',
  'visits',
  'newVisitors',
  'ips',
  'ipCoverage',
  'bounceRate',
  'pagesPerVisit',
  'averageDuration',
] as const;
type MetricColumn = (typeof metricColumns)[number];
const initialExclusions = (key: string) => {
  const value = getItem(key);
  return {
    domains: Array.isArray(value?.domains)
      ? value.domains.filter(item => typeof item === 'string').slice(0, 50)
      : [],
    keywords: Array.isArray(value?.keywords)
      ? value.keywords.filter(item => typeof item === 'string').slice(0, 50)
      : [],
  };
};

export function SourcesPage({ websiteId }: { websiteId: string }) {
  const { locale } = useLocale();
  const copy = getSourceCopy(locale);
  const categories = getSourceCategoryNames(locale);
  const { get, useQuery } = useApi();
  const { startAt, endAt, timezone } = useDateParameters();
  const filters = useFilterParameters({ includePagination: false });
  const [view, setView] = useState<SourceView>('channels');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const handleSearch = useCallback(
    (value: string) => {
      if (value === search) return;
      setSearch(value);
      setPage(1);
    },
    [search],
  );
  const [sort, setSort] = useState<SourceSort>('visitors');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [engine, setEngine] = useState('all');
  const [keywordStatus, setKeywordStatus] = useState('all');
  const [matrix, setMatrix] = useState(false);
  const [columns, setColumns] = useState<MetricColumn[]>([...metricColumns]);
  const storageKey = `umami.source-exclusions.${websiteId}`;
  const [excluded, setExcluded] = useState(() => initialExclusions(storageKey));
  useEffect(() => {
    setExcluded(initialExclusions(storageKey));
    setPage(1);
  }, [storageKey]);
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    setPage(1);
  }, [startAt, endAt, filterKey]);
  const engineName = (id: string) => {
    if (!id) return '';
    if (!locale.startsWith('zh')) {
      const english = { baidu: 'Baidu', sogou: 'Sogou', '360': '360 Search', sm: 'Shenma' };
      if (english[id]) return english[id];
    }
    return SOURCE_ENGINES.find(engine => engine.id === id)?.name || id;
  };
  const normalizedSearch =
    SOURCE_ENGINES.find(item => engineName(item.id).toLowerCase() === search.toLowerCase())?.id ||
    (view === 'channels'
      ? Object.entries(categories).find(([, label]) => label === search)?.[0]
      : '') ||
    search;
  const params = {
    ...filters,
    startAt,
    endAt,
    timezone,
    view,
    page,
    pageSize,
    sort,
    direction,
    search: normalizedSearch || undefined,
    engine: engine === 'all' ? undefined : engine,
    keywordStatus,
    matrix: String(matrix),
    excludeDomains: JSON.stringify(excluded.domains),
    excludeKeywords: JSON.stringify(excluded.keywords),
  };
  const result = useQuery<SourceReport>({
    queryKey: ['websites:sources', { websiteId, ...params }],
    queryFn: () => get(`/websites/${websiteId}/sources`, params),
    enabled: !!websiteId,
  });
  const report = result.data;
  const isMatrix = view === 'keywords' && matrix;
  const matrixEngines = [...new Set((report?.matrixCells || []).map(row => row.engine))].sort();
  const matrixCells = new Map(
    (report?.matrixCells || []).map(row => [
      JSON.stringify([row.name, row.keywordStatus, row.engine]),
      row,
    ]),
  );
  const matrixCell = (row: SourceRow, engineId: string) => {
    const cell = matrixCells.get(JSON.stringify([row.name, row.keywordStatus, engineId]));
    return `${cell?.pageviews || 0} / ${cell?.visitors || 0}`;
  };
  const metrics = report?.viewSummary;
  const number = (value: number) => value.toLocaleString(locale, { maximumFractionDigits: 2 });
  const percent = (value: number) => `${number(value * 100)}%`;
  const duration = (value: number) =>
    `${Math.floor(value / 60)} ${copy.minutes} ${Math.floor(value % 60)} ${copy.seconds}`;
  const rowName = (row: SourceRow) =>
    view === 'channels'
      ? categories[row.name] || row.name
      : view === 'engines'
        ? engineName(row.name)
        : row.keywordStatus === 'unavailable'
          ? copy.unavailable
          : row.name;
  const formatMetric = (row: SourceRow, key: MetricColumn) =>
    key === 'ips' && row.ips === null
      ? copy.noIp
      : key === 'ipCoverage' || key === 'bounceRate'
        ? percent(row[key])
        : key === 'averageDuration'
          ? duration(row[key])
          : number(row[key] as number);
  const updateExclusions = (next: typeof excluded) => {
    setExcluded(next);
    setItem(storageKey, next);
    setPage(1);
  };
  const excludeRow = (row: SourceRow) => {
    if (view === 'keywords')
      updateExclusions({
        ...excluded,
        keywords: [...new Set([...excluded.keywords, row.name])].slice(0, 50),
      });
    else
      updateExclusions({
        ...excluded,
        domains: [
          ...new Set([...excluded.domains, view === 'urls' ? row.name.split('/')[0] : row.name]),
        ].slice(0, 50),
      });
  };
  const exportRows = () => {
    const rows = (report?.rows || []).map(row =>
      Object.fromEntries([
        [copy.name, rowName(row)],
        ...(view === 'keywords' && !isMatrix ? [[copy.engine, engineName(row.engine)]] : []),
        ...columns.map(key => [copy[key], formatMetric(row, key)]),
        ...(isMatrix
          ? matrixEngines.map(id => [`${engineName(id)} PV / UV`, matrixCell(row, id)])
          : []),
      ]),
    );
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', Papa.unparse(rows, { escapeFormulae: true })], {
        type: 'text/csv;charset=utf-8',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `sources-${view}-${websiteId}-page-${page}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const switchView = (next: SourceView) => {
    setView(next);
    setPage(1);
    setSearch('');
    setKeywordStatus('all');
    setEngine('all');
  };

  return (
    <Column gap="6">
      <Column gap="2">
        <Heading size="2xl">{copy.title}</Heading>
        <Text color="muted">{copy.description}</Text>
      </Column>
      <WebsiteControls websiteId={websiteId} allowBounceFilter>
        <DialogButton
          label={copy.options}
          aria-label={copy.options}
          width="440px"
          variant="outline"
        >
          {({ close }) => (
            <Column gap="4">
              {['engines', 'keywords'].includes(view) && (
                <Select
                  label={copy.engine}
                  aria-label={copy.engine}
                  value={engine}
                  onChange={value => {
                    setEngine(String(value));
                    setPage(1);
                  }}
                >
                  <ListItem id="all">{copy.all}</ListItem>
                  {SOURCE_ENGINES.map(item => (
                    <ListItem key={item.id} id={item.id}>
                      {engineName(item.id)}
                    </ListItem>
                  ))}
                </Select>
              )}
              {view === 'keywords' && (
                <Select
                  label={copy.keywordState}
                  aria-label={copy.keywordState}
                  value={keywordStatus}
                  onChange={value => {
                    setKeywordStatus(String(value));
                    setPage(1);
                  }}
                >
                  <ListItem id="all">{copy.all}</ListItem>
                  <ListItem id="available">{copy.available}</ListItem>
                  <ListItem id="unavailable">{copy.unavailable}</ListItem>
                </Select>
              )}
              <Select
                label={copy.sort}
                aria-label={copy.sort}
                value={sort}
                onChange={value => {
                  setSort(value as SourceSort);
                  setPage(1);
                }}
              >
                {SOURCE_SORT_FIELDS.map(key => (
                  <ListItem key={key} id={key}>
                    {copy[key]}
                  </ListItem>
                ))}
              </Select>
              <Select
                label={copy.order}
                aria-label={copy.order}
                value={direction}
                onChange={value => {
                  setDirection(value as 'asc' | 'desc');
                  setPage(1);
                }}
              >
                <ListItem id="desc">{copy.desc}</ListItem>
                <ListItem id="asc">{copy.asc}</ListItem>
              </Select>

              {view === 'keywords' && (
                <Checkbox
                  aria-label={copy.matrix}
                  isSelected={matrix}
                  onChange={value => {
                    setMatrix(value);
                    setPage(1);
                  }}
                >
                  {copy.matrix}
                </Checkbox>
              )}
              <Button variant="primary" onPress={close}>
                {copy.done}
              </Button>
            </Column>
          )}
        </DialogButton>
      </WebsiteControls>
      <Tabs selectedKey={view} onSelectionChange={key => switchView(key as SourceView)}>
        <TabList aria-label={copy.title}>
          {SOURCE_VIEWS.map(id => (
            <Tab key={id} id={id}>
              {copy[id]}
            </Tab>
          ))}
        </TabList>
      </Tabs>
      {metrics && (
        <Grid columns={{ base: '1fr 1fr', lg: 'repeat(4, 1fr)' }} gap>
          <MetricCard label={copy.visitors} value={metrics.visitors} />
          <MetricCard label={copy.pageviews} value={metrics.pageviews} />
          <MetricCard label={copy.visits} value={metrics.visits} />
          <MetricCard
            label={copy.ips}
            value={metrics.ips || 0}
            formatValue={value => (metrics.ips === null ? '—' : number(Math.round(value)))}
            tooltip={`${copy.ipCoverage}: ${percent(metrics.ipCoverage)} (${metrics.ipVisits}/${metrics.visits})`}
          />
        </Grid>
      )}
      <Panel>
        <Row gap alignItems="end" wrap="wrap">
          <SearchField
            aria-label={copy.search}
            placeholder={copy.search}
            value={search}
            onSearch={handleSearch}
            delay={300}
          />
          <DialogButton
            label={copy.columns}
            aria-label={copy.columns}
            width="400px"
            variant="outline"
          >
            {({ close }) => (
              <Column gap="3">
                {metricColumns.map(key => (
                  <Checkbox
                    key={key}
                    aria-label={copy[key]}
                    isSelected={columns.includes(key)}
                    onChange={checked =>
                      setColumns(current =>
                        checked
                          ? [...new Set([...current, key])]
                          : current.filter(value => value !== key),
                      )
                    }
                  >
                    {copy[key]}
                  </Checkbox>
                ))}
                <Button variant="primary" onPress={close}>
                  {copy.done}
                </Button>
              </Column>
            )}
          </DialogButton>
          <Button aria-label={copy.export} onPress={exportRows} isDisabled={!report?.rows.length}>
            {copy.export}
          </Button>
        </Row>
        {view === 'keywords' && (
          <Column gap="2">
            <Text color="muted" size="sm">
              {copy.unavailableNote}
            </Text>
          </Column>
        )}
        {view === 'urls' && (
          <Text color="muted" size="sm">
            {copy.urlNote}
          </Text>
        )}
        {(excluded.domains.length > 0 || excluded.keywords.length > 0) && (
          <Column gap="2">
            <Text size="sm">
              {copy.excludedDomains}: {excluded.domains.join(', ') || '—'} · {copy.excludedKeywords}
              : {excluded.keywords.join(', ') || '—'}
            </Text>
            <Row>
              <Button onPress={() => updateExclusions({ domains: [], keywords: [] })}>
                {copy.clearExclusions}
              </Button>
            </Row>
          </Column>
        )}
        <LoadingPanel
          data={result.data}
          isLoading={result.isLoading}
          isFetching={result.isFetching}
          error={result.error}
          isEmpty={report?.rows.length === 0}
          renderEmpty={() => <Text>{copy.empty}</Text>}
          minHeight="250px"
        >
          <div style={{ overflowX: 'auto' }}>
            <DataTable data={report?.rows || []} aria-label={copy[view]}>
              <DataColumn
                id="name"
                label={view === 'keywords' ? copy.keyword : copy.name}
                width="minmax(220px, 2fr)"
              >
                {row => <Text style={{ overflowWrap: 'anywhere' }}>{rowName(row)}</Text>}
              </DataColumn>
              {view === 'keywords' && !isMatrix && (
                <DataColumn id="engine" label={copy.engine} width="140px">
                  {row => engineName(row.engine)}
                </DataColumn>
              )}
              {columns.map(key => (
                <DataColumn key={key} id={key} label={copy[key]} align="end" width="125px">
                  {row => formatMetric(row, key)}
                </DataColumn>
              ))}
              {isMatrix &&
                matrixEngines.map(id => (
                  <DataColumn
                    key={`matrix-${id}`}
                    id={`matrix-${id}`}
                    label={`${engineName(id)} PV / UV`}
                    width="150px"
                    align="end"
                  >
                    {row => matrixCell(row, id)}
                  </DataColumn>
                ))}
              {['domains', 'urls', 'keywords'].includes(view) && (
                <DataColumn id="actions" label={copy.exclude} width="140px">
                  {row =>
                    row.keywordStatus !== 'unavailable' && (
                      <Button size="sm" variant="quiet" onPress={() => excludeRow(row)}>
                        {view === 'keywords' ? copy.excludeKeyword : copy.excludeDomain}
                      </Button>
                    )
                  }
                </DataColumn>
              )}
            </DataTable>
          </div>
        </LoadingPanel>
        <Row gap alignItems="center" wrap="wrap" data-test="sources-pager">
          <Select
            label={copy.perPage}
            aria-label={copy.perPage}
            value={pageSize}
            onChange={value => {
              setPageSize(Number(value));
              setPage(1);
            }}
          >
            {[10, 20, 50, 100].map(size => (
              <ListItem key={size} id={size}>
                {size}
              </ListItem>
            ))}
          </Select>
          <Pager
            page={page}
            pageSize={pageSize}
            count={report?.totalRows || 0}
            onPageChange={setPage}
          />
        </Row>
        {metrics && (
          <Text color="muted" size="sm">
            {copy.total}: {copy.visitors} {number(metrics.visitors)} · {copy.newVisitors}{' '}
            {number(metrics.newVisitors)} · {copy.bounceRate} {percent(metrics.bounceRate)} ·{' '}
            {copy.pagesPerVisit} {number(metrics.pagesPerVisit)} · {copy.averageDuration}{' '}
            {duration(metrics.averageDuration)}
          </Text>
        )}
      </Panel>
      <Column gap="2">
        <Text color="muted" size="sm">
          {copy.metricsNote}
        </Text>
        <Text color="muted" size="sm">
          {copy.identityNote}
        </Text>
        <Text color="muted" size="sm">
          {copy.ipNote}
        </Text>
        <Text color="muted" size="sm">
          {copy.exclusionsNote}
        </Text>
      </Column>
    </Column>
  );
}
