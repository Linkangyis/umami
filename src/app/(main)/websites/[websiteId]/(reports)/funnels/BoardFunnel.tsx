import { Text } from '@umami/react-zen';
import { EmptyPlaceholder } from '@/components/common/EmptyPlaceholder';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { useLocale, useMessages } from '@/components/hooks';
import { useReportQuery } from '@/components/hooks/queries/useReportQuery';
import { Link2Off } from '@/components/icons';
import { Funnel } from './Funnel';

export function BoardFunnel({
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
  const { data, isLoading, error, isFetching } = useReportQuery(reportId || '');

  if (!reportId) {
    return (
      <EmptyPlaceholder
        {...(isPreview
          ? {
              title: cn ? '选择漏斗' : 'Select a funnel',
              description: cn
                ? '选择已保存的漏斗，预览各步骤的转化情况。'
                : 'Choose a saved funnel to preview.',
            }
          : {
              icon: <Link2Off />,
              title: cn ? '重新关联漏斗' : 'Reconnect funnel',
              description: cn ? '为此站点重新选择一个漏斗。' : 'Choose a funnel for this website.',
            })}
      />
    );
  }

  if (data && (data.type !== 'funnel' || data.websiteId !== websiteId)) {
    return (
      <EmptyPlaceholder
        title={t(messages.funnelUnavailable)}
        description={
          cn
            ? '此漏斗已被删除，或不属于当前站点。'
            : 'This saved funnel is no longer available for the selected website.'
        }
      />
    );
  }

  return (
    <LoadingPanel data={data} isLoading={isLoading} isFetching={isFetching} error={error}>
      {data ? (
        <Funnel
          id={data.id}
          name={data.name}
          type={data.type}
          parameters={data.parameters}
          websiteId={websiteId}
          allowEdit={false}
        />
      ) : (
        <Text color="muted">{t(messages.funnelUnavailable)}</Text>
      )}
    </LoadingPanel>
  );
}
