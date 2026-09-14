'use client';
import {
  Button,
  Column,
  DataColumn,
  DataTable,
  Heading,
  Row,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
} from '@umami/react-zen';
import Papa from 'papaparse';
import { useState } from 'react';
import { WebsiteControls } from '@/app/(main)/websites/[websiteId]/WebsiteControls';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { Panel } from '@/components/common/Panel';
import { useApi, useDateParameters, useFilterParameters, useLocale } from '@/components/hooks';
import { MetricCard } from '@/components/metrics/MetricCard';
import { MetricsBar } from '@/components/metrics/MetricsBar';
import type { EngagementBucket, EngagementResult } from '@/types/engagement';
import styles from './Engagement.module.css';
import { type EngagementCopy, getEngagementCopy } from './engagementCopy';

type Distribution = keyof EngagementResult['distributions'];

export function EngagementPage({ websiteId }: { websiteId: string }) {
  const { locale } = useLocale();
  const { get, useQuery } = useApi();
  const { startAt, endAt, timezone } = useDateParameters();
  const filters = useFilterParameters({ includePagination: false });
  const params = { startAt, endAt, timezone, ...filters };
  const result = useQuery<EngagementResult>({
    queryKey: ['websites:engagement', { websiteId, ...params }],
    queryFn: () => get(`/websites/${websiteId}/engagement`, params),
    enabled: !!websiteId,
  });

  return (
    <Column gap>
      <WebsiteControls websiteId={websiteId} allowBounceFilter />
      <LoadingPanel
        data={result.data}
        isLoading={result.isLoading}
        isFetching={result.isFetching}
        error={result.error}
        minHeight="300px"
      >
        {result.data && (
          <EngagementReport
            data={result.data}
            locale={locale}
            filename={`engagement-${websiteId}`}
          />
        )}
      </LoadingPanel>
    </Column>
  );
}

export function EngagementReport({
  data,
  locale,
  filename,
}: {
  data: EngagementResult;
  locale: string;
  filename: string;
}) {
  const copy = getEngagementCopy(locale);
  const [distribution, setDistribution] = useState<Distribution>('duration');
  const number = (value: number) => value.toLocaleString(locale, { maximumFractionDigits: 2 });
  const percent = (value: number) => `${number(value * 100)}%`;
  const duration = (value: number) =>
    `${Math.floor(value / 60)} ${copy.minute} ${Math.floor(value % 60)} ${copy.second}`;
  const all = data.summary.all;
  const summary = (['all', 'new', 'returning'] as const).map(type => ({
    id: type,
    type,
    ...data.summary[type],
  }));
  const cards = [
    {
      label: copy.visitors,
      value: all.visitors,
      formatValue: (value: number) => Math.round(value).toLocaleString(locale),
    },
    {
      label: copy.pageviews,
      value: all.pageviews,
      formatValue: (value: number) => Math.round(value).toLocaleString(locale),
    },
    { label: copy.pagesPerVisit, value: all.pagesPerVisit, formatValue: number },
    { label: copy.avgDuration, value: all.avgDuration, formatValue: duration },
  ];
  const buckets = data.distributions[distribution];
  const summaryExport = summary.map(row => ({
    [copy.audience]: copy[row.type],
    [copy.visitors]: row.visitors,
    [copy.visitorShare]: percent(row.visitorRatio),
    [copy.visits]: row.visits,
    [copy.pageviews]: row.pageviews,
    [copy.bounceRate]: percent(row.bounceRate),
    [copy.pagesPerVisit]: row.pagesPerVisit,
    [`${copy.avgDuration} (${copy.second})`]: row.avgDuration,
  }));
  const bucketExport = buckets.map(row => ({
    [copy.bucket]: bucketLabel(row, distribution, copy),
    [copy.visitors]: row.visitors,
    [copy.visitorShare]: percent(row.visitorRatio),
    [copy.visits]: row.visits,
    [copy.visitShare]: percent(row.visitRatio),
    [copy.pageviews]: row.pageviews,
    [copy.pageviewShare]: percent(row.pageviewRatio),
  }));

  return (
    <Column gap data-test="engagement-report">
      <MetricsBar data-test="engagement-metrics">
        {cards.map(card => (
          <MetricCard key={card.label} {...card} />
        ))}
      </MetricsBar>
      {all.visits === 0 && (
        <Text role="status" color="muted">
          {copy.empty}
        </Text>
      )}
      <Panel minWidth="0">
        <Row alignItems="center" justifyContent="space-between" gap style={{ flexWrap: 'wrap' }}>
          <Heading size="2xl">{copy.audience}</Heading>
          <CsvButton filename={`${filename}-audience`} rows={summaryExport} label={copy.download} />
        </Row>
        <div className={styles.scroll}>
          <DataTable data={summary} className={styles.table} aria-label={copy.audience}>
            <DataColumn id="type" label={copy.audience} width="minmax(150px, 1.3fr)">
              {row => <Text weight="bold">{copy[row.type]}</Text>}
            </DataColumn>
            <DataColumn id="visitors" label={copy.visitors} align="end" width="100px">
              {row => number(row.visitors)}
            </DataColumn>
            <DataColumn id="visitorRatio" label={copy.visitorShare} align="end" width="120px">
              {row => <Share text={percent(row.visitorRatio)} />}
            </DataColumn>
            <DataColumn id="visits" label={copy.visits} align="end" width="100px">
              {row => number(row.visits)}
            </DataColumn>
            <DataColumn id="pageviews" label={copy.pageviews} align="end" width="100px">
              {row => number(row.pageviews)}
            </DataColumn>
            <DataColumn id="bounceRate" label={copy.bounceRate} align="end" width="110px">
              {row => percent(row.bounceRate)}
            </DataColumn>
            <DataColumn id="pagesPerVisit" label={copy.pagesPerVisit} align="end" width="130px">
              {row => number(row.pagesPerVisit)}
            </DataColumn>
            <DataColumn id="avgDuration" label={copy.avgDuration} align="end" width="160px">
              {row => duration(row.avgDuration)}
            </DataColumn>
          </DataTable>
        </div>
        <Text color="muted" size="sm">
          {copy.identityNote}
        </Text>
      </Panel>
      <Panel minWidth="0">
        <Row alignItems="center" justifyContent="space-between" gap style={{ flexWrap: 'wrap' }}>
          <Heading size="2xl">{copy.title}</Heading>
          <CsvButton
            filename={`${filename}-${distribution}`}
            rows={bucketExport}
            label={copy.download}
          />
        </Row>
        <Text color="muted">{copy.description}</Text>
        <Tabs
          selectedKey={distribution}
          onSelectionChange={value => setDistribution(value as Distribution)}
          style={{ minWidth: 0 }}
        >
          <TabList aria-label={copy.title}>
            {(['duration', 'depth', 'frequency'] as const).map(type => (
              <Tab key={type} id={type}>
                {copy[type]}
              </Tab>
            ))}
          </TabList>
          {(['duration', 'depth', 'frequency'] as const).map(type => (
            <TabPanel key={type} id={type}>
              <Column gap>
                <Text color="muted" size="sm">
                  {copy[`${type}Note`]}
                </Text>
                <div className={styles.scroll}>
                  <DataTable
                    data={data.distributions[type]}
                    className={styles.table}
                    aria-label={copy[type]}
                  >
                    <DataColumn id="id" label={copy.bucket} width="minmax(150px, 1.3fr)">
                      {row => <Text weight="bold">{bucketLabel(row, type, copy)}</Text>}
                    </DataColumn>
                    <DataColumn id="visitors" label={copy.visitors} align="end">
                      {row => number(row.visitors)}
                    </DataColumn>
                    {type === 'frequency' && (
                      <DataColumn id="visitorRatio" label={copy.visitorShare} align="end">
                        {row => percent(row.visitorRatio)}
                      </DataColumn>
                    )}
                    <DataColumn id="visits" label={copy.visits} align="end">
                      {row => number(row.visits)}
                    </DataColumn>
                    <DataColumn id="visitRatio" label={copy.visitShare} align="end">
                      {row => <Share text={percent(row.visitRatio)} />}
                    </DataColumn>
                    <DataColumn id="pageviews" label={copy.pageviews} align="end">
                      {row => number(row.pageviews)}
                    </DataColumn>
                    <DataColumn id="pageviewRatio" label={copy.pageviewShare} align="end">
                      {row => percent(row.pageviewRatio)}
                    </DataColumn>
                  </DataTable>
                </div>
              </Column>
            </TabPanel>
          ))}
        </Tabs>
      </Panel>
      <Text color="muted" size="sm">
        {copy.filterNote}
      </Text>
    </Column>
  );
}

function Share({ text }: { text: string }) {
  return <Text color="muted">{text}</Text>;
}

function bucketLabel(bucket: EngagementBucket, distribution: Distribution, copy: EngagementCopy) {
  const range =
    bucket.max === null
      ? `${bucket.min}+`
      : bucket.min === bucket.max
        ? `${bucket.min}`
        : `${bucket.min}–${bucket.max}`;
  return `${range} ${distribution === 'duration' ? copy.second : distribution === 'depth' ? copy.pages : copy.times}`;
}

function CsvButton({
  filename,
  rows,
  label,
}: {
  filename: string;
  rows: Record<string, unknown>[];
  label: string;
}) {
  const download = () => {
    const content = Papa.unparse(rows, { escapeFormulae: true });
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Button variant="outline" size="sm" onPress={download}>
      {label}
    </Button>
  );
}
