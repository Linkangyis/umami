import { Text } from '@umami/react-zen';
import { EmptyPlaceholder } from '@/components/common/EmptyPlaceholder';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { useDateRange, useLocale, useMessages } from '@/components/hooks';
import { useReportQuery } from '@/components/hooks/queries/useReportQuery';
import { Link2Off } from '@/components/icons';
import { Goal } from './Goal';

export function BoardGoal({
  websiteId,
  reportId,
  isPreview,
}: {
  websiteId: string;
  reportId?: string;
  isPreview?: boolean;
}) {
  const { locale } = useLocale();
  const cn = locale.startsWith('zh');
  const { t, messages } = useMessages();
  const {
    dateRange: { startDate, endDate },
  } = useDateRange();
  const { data, isLoading, error, isFetching } = useReportQuery(reportId || '');

  if (!reportId) {
    return (
      <EmptyPlaceholder
        {...(isPreview
          ? {
              title: cn ? '选择转化目标' : 'Select a goal',
              description: cn
                ? '选择已保存的目标，预览转化进度。'
                : 'Choose a saved goal to preview.',
            }
          : {
              icon: <Link2Off />,
              title: cn ? '重新关联目标' : 'Reconnect goal',
              description: cn
                ? '为此站点重新选择一个转化目标。'
                : 'Choose a goal for this website.',
            })}
      />
    );
  }

  if (data && (data.type !== 'goal' || data.websiteId !== websiteId)) {
    return (
      <EmptyPlaceholder
        title={t(messages.goalUnavailable)}
        description={
          cn
            ? '此目标已被删除，或不属于当前站点。'
            : 'This saved goal is no longer available for the selected website.'
        }
      />
    );
  }

  return (
    <LoadingPanel data={data} isLoading={isLoading} isFetching={isFetching} error={error}>
      {data ? (
        <Goal
          id={data.id}
          name={data.name}
          type={data.type}
          parameters={data.parameters}
          websiteId={websiteId}
          startDate={startDate}
          endDate={endDate}
          allowEdit={false}
        />
      ) : (
        <Text color="muted">{t(messages.goalUnavailable)}</Text>
      )}
    </LoadingPanel>
  );
}
