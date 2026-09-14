'use client';

import { Button, Column, ListItem, Row, Select, Text, TextField } from '@umami/react-zen';
import { endOfDay, startOfDay, startOfMonth, subDays, subMonths } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import Papa from 'papaparse';
import { useState } from 'react';
import { WebsiteControls } from '@/app/(main)/websites/[websiteId]/WebsiteControls';
import { Chart } from '@/components/charts/Chart';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { Panel } from '@/components/common/Panel';
import { useApi, useLocale, useNavigation, useWebsite } from '@/components/hooks';
import { useDateParameters } from '@/components/hooks/useDateParameters';
import { useFilterParameters } from '@/components/hooks/useFilterParameters';
import { DialogButton } from '@/components/input/DialogButton';
import { MetricCard } from '@/components/metrics/MetricCard';
import { MetricsBar } from '@/components/metrics/MetricsBar';
import { getDateRangeValue } from '@/lib/date';
import { formatLongNumber, formatShortTime } from '@/lib/format';
import {
  TRAFFIC_UNITS,
  type TrafficMetrics,
  type TrafficReport,
  type TrafficUnit,
} from '@/lib/traffic';
import styles from './TrafficPage.module.css';
import { trafficMessages } from './trafficMessages';

const metricKeys = [
  'pageviews',
  'visitors',
  'newVisitors',
  'visits',
  'bounceRate',
  'averageDuration',
  'viewsPerVisit',
] as const;
type Metric = (typeof metricKeys)[number];

export function TrafficPage({ websiteId }: { websiteId: string }) {
  const { locale } = useLocale();
  const text = trafficMessages[locale.startsWith('zh') ? 'zh' : 'en'];
  const { get, useQuery } = useApi();
  const date = useDateParameters();
  const filters = useFilterParameters();
  const website = useWebsite();
  const { query, router, updateParams } = useNavigation();
  const storedCompareDate = (value?: string) =>
    value && Number.isFinite(+new Date(Number(value)))
      ? formatInTimeZone(new Date(Number(value)), date.timezone, 'yyyy-MM-dd')
      : '';
  const [metric, setMetric] = useState<Metric>('pageviews');
  const [page, setPage] = useState(0);
  const [compareStart, setCompareStart] = useState(() => storedCompareDate(query.compareStartAt));
  const [compareEnd, setCompareEnd] = useState(() => storedCompareDate(query.compareEndAt));
  const [invalidComparison, setInvalidComparison] = useState(false);
  const unit = (
    TRAFFIC_UNITS.includes(query.trafficUnit as TrafficUnit) ? query.trafficUnit : 'day'
  ) as TrafficUnit;
  const compare = query.trafficCompare || 'prev';
  const parameters = {
    ...date,
    ...filters,
    unit,
    visitorType: query.visitorType || 'all',
    compare,
    compareStartAt: query.compareStartAt,
    compareEndAt: query.compareEndAt,
  };
  const { data, isLoading, isFetching, error } = useQuery<TrafficReport>({
    queryKey: ['websites:traffic', websiteId, parameters],
    queryFn: () => get(`/websites/${websiteId}/traffic`, parameters),
    enabled: !!websiteId && (compare !== 'custom' || !!query.compareStartAt),
  });
  const update = (params: Record<string, string | number>) => {
    setPage(0);
    router.push(updateParams(params), { scroll: false });
  };
  const setPreset = (preset: 'days' | 'months' | 'weeks') => {
    const now = toZonedTime(new Date(), date.timezone);
    const start =
      preset === 'days'
        ? startOfDay(subDays(now, 6))
        : preset === 'months'
          ? startOfMonth(subMonths(now, 23))
          : startOfDay(toZonedTime(new Date(website.createdAt), date.timezone));
    update({
      date: getDateRangeValue(start, endOfDay(now)),
      offset: 0,
      trafficUnit: preset === 'days' ? 'day' : preset === 'months' ? 'month' : 'week',
    });
  };
  const applyComparison = () => {
    const start = fromZonedTime(`${compareStart}T00:00:00`, date.timezone);
    const end = fromZonedTime(`${compareEnd}T23:59:59.999`, date.timezone);
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || start > end) {
      setInvalidComparison(true);
      return;
    }
    setInvalidComparison(false);
    update({ compareStartAt: +start, compareEndAt: +end, trafficCompare: 'custom' });
  };
  const formatValue = (key: Metric, value: number) => {
    if (key === 'bounceRate') return `${value.toFixed(1)}%`;
    if (key === 'averageDuration') return formatShortTime(Math.round(value), ['h', 'm', 's'], ' ');
    if (key === 'viewsPerVisit') return value.toFixed(2);
    return formatLongNumber(Math.round(value));
  };
  const formatPeriod = (value: string) =>
    formatInTimeZone(value, date.timezone, unit === 'hour' ? 'yyyy-MM-dd HH:mm XXX' : 'yyyy-MM-dd');
  const download = () => {
    const rows = [
      ...data.rows.map(row => ({ period: text.current, ...row })),
      ...(data.comparison?.rows.map(row => ({ period: text.comparison, ...row })) || []),
    ].map(row => ({
      period: row.period,
      date: formatPeriod(row.x),
      timezone: data.timezone,
      ...Object.fromEntries(metricKeys.map(key => [key, row[key]])),
    }));
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', Papa.unparse(rows, { escapeFormulae: true })], {
        type: 'text/csv;charset=utf-8',
      }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `traffic-${websiteId}-${unit}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const chartData = data && {
    labels: data.rows.map(row => formatPeriod(row.x)),
    datasets: [
      { label: text.current, data: data.rows.map(row => row[metric]), backgroundColor: '#4c78ef' },
      ...(data.comparison
        ? [
            {
              label: text.comparison,
              data: data.rows.map((_, index) => data.comparison.rows[index]?.[metric] ?? null),
              backgroundColor: '#aabce9',
            },
          ]
        : []),
    ],
  };
  const lastPage = Math.max(0, Math.ceil((data?.rows.length || 0) / 50) - 1);
  const currentPage = Math.min(page, lastPage);
  const cells = (values: TrafficMetrics) =>
    metricKeys.map(key => <td key={key}>{formatValue(key, values[key])}</td>);

  return (
    <Column gap="6" data-test="traffic-report">
      <Column gap="2">
        <Text size="xl" weight="bold">
          {text.title}
        </Text>
        <Text color="muted">
          {text[unit]} · {text[parameters.visitorType]} · {text[compare]}
        </Text>
      </Column>
      <WebsiteControls websiteId={websiteId} allowBounceFilter>
        <DialogButton label={text.options} width="440px" variant="outline">
          {({ close }) => (
            <Column gap="4">
              <Select
                label={text.quickRange}
                placeholder={text.chooseRange}
                onChange={value => setPreset(value as 'days' | 'months' | 'weeks')}
              >
                <ListItem id="days">{text.recentDays}</ListItem>
                <ListItem id="months">{text.recentMonths}</ListItem>
                <ListItem id="weeks">{text.allWeeks}</ListItem>
              </Select>
              <Select
                label={text.interval}
                value={unit}
                onChange={value => update({ trafficUnit: String(value) })}
              >
                {TRAFFIC_UNITS.map(value => (
                  <ListItem key={value} id={value}>
                    {text[value]}
                  </ListItem>
                ))}
              </Select>
              <Select
                label={text.visitorsFilter}
                value={parameters.visitorType}
                onChange={value => update({ visitorType: String(value) })}
              >
                {(['all', 'new', 'returning'] as const).map(value => (
                  <ListItem key={value} id={value}>
                    {text[value]}
                  </ListItem>
                ))}
              </Select>
              <Select
                label={text.comparison}
                value={compare}
                onChange={value => update({ trafficCompare: String(value) })}
              >
                {(['prev', 'yoy', 'none', 'custom'] as const).map(value => (
                  <ListItem key={value} id={value}>
                    {text[value]}
                  </ListItem>
                ))}
              </Select>
              {compare === 'custom' && (
                <>
                  <TextField
                    label={text.compareStart}
                    type="date"
                    value={compareStart}
                    onChange={setCompareStart}
                  />
                  <TextField
                    label={text.compareEnd}
                    type="date"
                    value={compareEnd}
                    onChange={setCompareEnd}
                  />
                  <Button onClick={applyComparison}>{text.apply}</Button>
                </>
              )}
              {invalidComparison && <Text role="alert">{text.invalidComparison}</Text>}
              <Row justifyContent="flex-end">
                <Button variant="primary" onClick={close}>
                  {text.done}
                </Button>
              </Row>
            </Column>
          )}
        </DialogButton>
      </WebsiteControls>
      <LoadingPanel
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        minHeight="300px"
      >
        {data && (
          <Column gap="6">
            <MetricsBar>
              {metricKeys.map(key => (
                <MetricCard
                  key={key}
                  label={text[key]}
                  value={data.summary[key]}
                  change={data.summary[key] - (data.comparison?.summary[key] || 0)}
                  formatValue={value => formatValue(key, Number(value))}
                  showChange={!!data.comparison}
                  reverseColors={key === 'bounceRate'}
                />
              ))}
            </MetricsBar>
            {!data.summary.pageviews && <Text>{text.empty}</Text>}
            <Panel>
              <Column gap="4">
                <Row justifyContent="space-between" alignItems="center" wrap="wrap" gap="3">
                  <Select
                    label={text.metric}
                    value={metric}
                    onChange={value => setMetric(value as Metric)}
                  >
                    {metricKeys.map(key => (
                      <ListItem key={key} id={key}>
                        {text[key]}
                      </ListItem>
                    ))}
                  </Select>
                  <Text size="sm">
                    {text.timezone}: {data.timezone}
                  </Text>
                </Row>
                <Chart
                  type="bar"
                  chartData={chartData}
                  height="300px"
                  chartOptions={{
                    plugins: { legend: { display: false }, tooltip: { enabled: true } },
                    scales: { y: { beginAtZero: true }, x: { ticks: { maxTicksLimit: 12 } } },
                  }}
                />
                {data.comparison && (
                  <Text size="sm">
                    {text.comparison}: {formatPeriod(data.comparison.startDate)} —{' '}
                    {formatPeriod(data.comparison.endDate)}. {text.alignment}
                  </Text>
                )}
              </Column>
            </Panel>
            <Panel>
              <Column gap="4">
                <Row justifyContent="space-between" alignItems="center">
                  <Text weight="bold">{text.details}</Text>
                  <Button onClick={download}>{text.download}</Button>
                </Row>
                <div className={styles.tableWrap}>
                  <table className={styles.table} data-test="traffic-table">
                    <thead>
                      <tr>
                        <th scope="col">{text.date}</th>
                        {metricKeys.map(key => (
                          <th key={key} scope="col">
                            {text[key]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.slice(currentPage * 50, (currentPage + 1) * 50).map(row => (
                        <tr key={row.x}>
                          <td>{formatPeriod(row.x)}</td>
                          {cells(row)}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>{text.summary}</td>
                        {cells(data.summary)}
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {lastPage > 0 && (
                  <Row justifyContent="flex-end" alignItems="center" gap="3">
                    <Button isDisabled={!currentPage} onClick={() => setPage(currentPage - 1)}>
                      {text.previous}
                    </Button>
                    <Text>
                      {currentPage + 1} / {lastPage + 1}
                    </Text>
                    <Button
                      isDisabled={currentPage === lastPage}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      {text.next}
                    </Button>
                  </Row>
                )}
              </Column>
            </Panel>
          </Column>
        )}
      </LoadingPanel>
      <details className={styles.methodology}>
        <summary>{text.methodology}</summary>
        <p>{text.definitions}</p>
        <p>{text.durationNote}</p>
      </details>
    </Column>
  );
}
