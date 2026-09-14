const en = {
  title: 'Visitor engagement',
  description: 'Understand who returns, how long visits last, and how deeply visitors explore.',
  audience: 'New & returning visitors',
  all: 'All visitors',
  new: 'New visitors',
  returning: 'Returning visitors',
  visitors: 'Visitors',
  visits: 'Visits',
  pageviews: 'Pageviews',
  visitorShare: 'Visitor share',
  visitShare: 'Visit share',
  pageviewShare: 'Pageview share',
  bounceRate: 'Bounce rate',
  pagesPerVisit: 'Pages / visit',
  avgDuration: 'Avg. visit duration',
  duration: 'Visit duration',
  depth: 'Page depth',
  frequency: 'Visit frequency',
  bucket: 'Range',
  download: 'Download CSV',
  empty: 'No visits in this date range. Try a different date range or remove filters.',
  durationNote:
    'Duration runs from the first to the last pageview in the selected period. Single-page visits have a recorded duration of zero; this is not a measurement of time spent on the last page.',
  depthNote:
    'Page depth counts recorded pageviews per visit, including repeated views of the same page. A visitor can appear in more than one duration or depth range.',
  frequencyNote:
    'Frequency counts each visitor’s visits within the selected date range. This adds a view of repeat engagement beyond new and returning totals.',
  filterNote:
    'Filters select matching visits; metrics include all pageviews within those visits and the selected period.',
  identityNote:
    'New visitors are identities whose first retained pageview falls in the selected period; returning visitors have an earlier retained pageview. Identity rotation and deleted history limit recognition across periods. The default identity rotation is monthly.',
  rotation: 'Configured identity rotation',
  second: 's',
  minute: 'm',
  pages: 'pages',
  times: 'visits',
};

const zh: typeof en = {
  title: '访客互动分析',
  description: '了解新老访客、访问时长、浏览深度和回访频次。',
  audience: '新老访客',
  all: '全部访客',
  new: '新访客',
  returning: '老访客',
  visitors: '访客数',
  visits: '访问次数',
  pageviews: '浏览量（PV）',
  visitorShare: '访客占比',
  visitShare: '访问占比',
  pageviewShare: '浏览量占比',
  bounceRate: '跳出率',
  pagesPerVisit: '平均访问页数',
  avgDuration: '平均访问时长',
  duration: '访问时长',
  depth: '访问深度',
  frequency: '访问频次',
  bucket: '区间',
  download: '下载 CSV',
  empty: '当前日期范围内暂无访问，请调整日期或移除筛选条件。',
  durationNote:
    '访问时长为所选期间首次至末次页面浏览的时间差。单页访问的记录时长为 0，无法据此得知访客在最后一个页面的实际停留时间。',
  depthNote:
    '访问深度按每次访问记录的浏览量统计，包含同一页面的重复浏览。同一访客可能出现在多个时长或深度区间中。',
  frequencyNote: '访问频次统计每位访客在所选期间内的访问次数，帮助进一步了解重复访问情况。',
  filterNote: '筛选条件用于选出匹配的访问，指标统计这些访问在所选期间内的全部页面浏览。',
  identityNote:
    '新访客指现存记录中的首次页面浏览位于所选期间内的访客，老访客指此前已有页面浏览记录的访客。身份轮换和历史数据删除会影响跨期识别；默认按月轮换身份。',
  rotation: '当前身份轮换周期',
  second: '秒',
  minute: '分',
  pages: '页',
  times: '次',
};

export const getEngagementCopy = (locale: string) => (locale.startsWith('zh') ? zh : en);
export type EngagementCopy = typeof en;
