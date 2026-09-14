import {
  AlignEndHorizontal,
  ChartPie,
  Clock,
  Eye,
  Flame,
  Sheet,
  Tag,
  User,
  UserPlus,
  Video,
} from '@/components/icons';
import { Funnel, Gauge, Lightning, Magnet, Money, Network, Path, Target } from '@/components/svg';
import { useLocale } from './useLocale';
import { useMessages } from './useMessages';
import { useNavigation } from './useNavigation';

export function useWebsiteNavItems(websiteId: string) {
  const { t, labels } = useMessages();
  const { locale } = useLocale();
  const chinese = locale.startsWith('zh');
  const { pathname, renderUrl } = useNavigation();
  const resetParams = {
    search: undefined,
    page: undefined,
  };

  const renderPath = (path: string) =>
    renderUrl(`/websites/${websiteId}${path}`, {
      ...resetParams,
      event: undefined,
      compare: undefined,
      view: undefined,
      unit: undefined,
      excludeBounce: undefined,
    });

  const items = [
    {
      label: t(labels.traffic),
      items: [
        {
          id: 'overview',
          label: t(labels.overview),
          icon: <Eye />,
          path: renderPath(''),
        },
        {
          id: 'events',
          label: t(labels.events),
          icon: <Lightning />,
          path: renderPath('/events'),
        },
        {
          id: 'traffic',
          label: chinese ? '流量分析' : 'Traffic analysis',
          icon: <Sheet />,
          path: renderPath('/traffic'),
        },
        {
          id: 'sessions',
          label: t(labels.sessions),
          icon: <User />,
          path: renderPath('/sessions'),
        },
        {
          id: 'sources',
          label: chinese ? '来源分析' : 'Sources analysis',
          icon: <Network />,
          path: renderPath('/sources'),
        },
        {
          id: 'content',
          label: chinese ? '页面分析' : 'Content analysis',
          icon: <Sheet />,
          path: renderPath('/content'),
        },
        {
          id: 'realtime',
          label: t(labels.realtime),
          icon: <Clock />,
          path: renderPath('/realtime'),
        },
        {
          id: 'performance',
          label: t(labels.performance),
          icon: <Gauge />,
          path: renderPath('/performance'),
        },
        {
          id: 'compare',
          label: t(labels.compare),
          icon: <AlignEndHorizontal />,
          path: renderPath('/compare'),
        },
        {
          id: 'breakdown',
          label: t(labels.breakdown),
          icon: <Sheet />,
          path: renderPath('/breakdown'),
        },
      ],
    },
    {
      label: t(labels.behavior),
      items: [
        {
          id: 'goals',
          label: t(labels.goals),
          icon: <Target />,
          path: renderPath('/goals'),
        },
        {
          id: 'funnel',
          label: t(labels.funnels),
          icon: <Funnel />,
          path: renderPath('/funnels'),
        },
        {
          id: 'journeys',
          label: t(labels.journeys),
          icon: <Path />,
          path: renderPath('/journeys'),
        },
        {
          id: 'retention',
          label: t(labels.retention),
          icon: <Magnet />,
          path: renderPath('/retention'),
        },
        {
          id: 'replays',
          label: t(labels.replays),
          icon: <Video />,
          path: renderPath('/replays'),
        },
        {
          id: 'heatmaps',
          label: t(labels.heatmaps),
          icon: <Flame />,
          path: renderPath('/heatmaps'),
        },
      ],
    },
    {
      label: t(labels.audience),
      items: [
        {
          id: 'engagement',
          label: chinese ? '访客与互动' : 'Visitor engagement',
          icon: <User />,
          path: renderPath('/engagement'),
        },
        {
          id: 'segments',
          label: t(labels.segments),
          icon: <ChartPie />,
          path: renderPath('/segments'),
        },
        {
          id: 'ip-addresses',
          label: chinese ? 'IP 分析' : 'IP analysis',
          icon: <Network />,
          path: renderPath('/ip-addresses'),
        },
        {
          id: 'cohorts',
          label: t(labels.cohorts),
          icon: <UserPlus />,
          path: renderPath('/cohorts'),
        },
      ],
    },
    {
      label: t(labels.growth),
      items: [
        {
          id: 'utm',
          label: t(labels.utm),
          icon: <Tag />,
          path: renderPath('/utm'),
        },
        {
          id: 'campaigns',
          label: chinese ? '推广链接' : 'Campaign links',
          icon: <Tag />,
          path: renderPath('/campaigns'),
        },
        {
          id: 'revenue',
          label: t(labels.revenue),
          icon: <Money />,
          path: renderPath('/revenue'),
        },
        {
          id: 'attribution',
          label: t(labels.attribution),
          icon: <Network />,
          path: renderPath('/attribution'),
        },
      ],
    },
  ];

  const selectedKey = items
    .flatMap(e => e.items)
    .find(({ path }) => path && pathname.endsWith(path.split('?')[0]))?.id;

  return { items, selectedKey, renderPath };
}
