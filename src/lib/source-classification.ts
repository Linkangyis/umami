export const SOURCE_CATEGORIES = [
  'direct',
  'search',
  'external',
  'social',
  'email',
  'paid',
  'ai',
  'campaign',
] as const;
export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];

export const SOURCE_ENGINES = [
  {
    id: 'google',
    name: 'Google',
    domains: [
      'google.com',
      'google.co.uk',
      'google.com.hk',
      'google.cn',
      'google.com.tw',
      'google.co.jp',
      'google.co.kr',
      'google.de',
      'google.fr',
      'google.es',
      'google.it',
      'google.ca',
      'google.com.au',
      'google.co.in',
      'google.com.br',
      'google.ru',
      'google.ch',
      'google.nl',
      'google.be',
      'google.se',
      'google.no',
      'google.dk',
      'google.fi',
      'google.at',
      'google.pl',
      'google.pt',
      'google.co.nz',
      'google.com.sg',
      'google.com.my',
      'google.com.mx',
      'google.co.id',
      'google.com.tr',
      'google.co.za',
      'google.ie',
      'google.cz',
      'google.com.ar',
      'google.com.sa',
      'google.com.eg',
      'google.com.pk',
      'google.com.vn',
      'google.com.ph',
      'google.co.th',
      'google.com.ua',
      'google.gr',
      'google.ro',
    ],
    keys: ['q'],
    excluded: [
      'mail',
      'docs',
      'drive',
      'accounts',
      'calendar',
      'photos',
      'maps',
      'translate',
      'play',
      'support',
      'cloud',
      'analytics',
      'tagmanager',
      'ads',
      'gemini',
    ],
  },
  { id: 'bing', name: 'Bing', domains: ['bing.com'], keys: ['q'], excluded: [] },
  {
    id: 'baidu',
    name: '百度',
    domains: ['baidu.com'],
    keys: ['wd', 'word'],
    excluded: ['tieba', 'zhidao', 'baike', 'wenku', 'pan', 'map', 'yun', 'passport', 'fanyi'],
  },
  {
    id: 'sogou',
    name: '搜狗',
    domains: ['sogou.com'],
    keys: ['query', 'keyword'],
    excluded: ['pinyin', 'fanyi'],
  },
  { id: '360', name: '360 搜索', domains: ['so.com', 'haosou.com'], keys: ['q'], excluded: [] },
  { id: 'sm', name: '神马', domains: ['sm.cn'], keys: ['q'], excluded: [] },
  {
    id: 'yahoo',
    name: 'Yahoo',
    domains: ['yahoo.com', 'yahoo.co.jp'],
    keys: ['p'],
    excluded: ['mail', 'finance', 'sports', 'news', 'login'],
  },
  { id: 'duckduckgo', name: 'DuckDuckGo', domains: ['duckduckgo.com'], keys: ['q'], excluded: [] },
  {
    id: 'yandex',
    name: 'Yandex',
    domains: ['yandex.com', 'yandex.ru'],
    keys: ['text'],
    excluded: ['mail', 'disk', 'maps'],
  },
  { id: 'ecosia', name: 'Ecosia', domains: ['ecosia.org'], keys: ['q'], excluded: [] },
  {
    id: 'naver',
    name: 'Naver',
    domains: ['naver.com'],
    keys: ['query'],
    excluded: ['mail', 'blog', 'cafe'],
  },
  { id: 'brave', name: 'Brave Search', domains: ['search.brave.com'], keys: ['q'], excluded: [] },
] as const;

const SOCIAL_DOMAINS = [
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  't.co',
  'reddit.com',
  'pinterest.com',
  'tiktok.com',
  'weibo.com',
  'weibo.cn',
  'douyin.com',
  'xiaohongshu.com',
  'bilibili.com',
  'tieba.baidu.com',
  'zhihu.com',
  'wx.qq.com',
  'mp.weixin.qq.com',
  'qzone.qq.com',
];
const EMAIL_DOMAINS = [
  'mail.google.com',
  'outlook.live.com',
  'outlook.office.com',
  'mail.yahoo.com',
  'mail.qq.com',
  'mail.163.com',
  'mail.126.com',
];
const AI_DOMAINS = [
  'chatgpt.com',
  'chat.openai.com',
  'claude.ai',
  'perplexity.ai',
  'gemini.google.com',
  'copilot.microsoft.com',
  'deepseek.com',
  'doubao.com',
  'kimi.com',
  'kimi.moonshot.cn',
];
const HIDDEN_TERMS = [
  '(not provided)',
  'not provided',
  '(not set)',
  'not set',
  'undefined',
  'null',
  'unknown',
  '(unknown)',
  'encrypted',
  '关键词未提供',
  '未提供',
  '已加密',
  '-',
];
const PAID_MEDIA = [
  'cpc',
  'ppc',
  'cpm',
  'paid',
  'paid_search',
  'paid-search',
  'paid_social',
  'paid-social',
  'display',
  'retargeting',
  'affiliate',
];

export function normalizeSourceHost(value: string = '') {
  return value
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.+$/, '')
    .replace(/^www\./, '');
}

function hostMatches(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

export function getSourceEngine(value: string): string | null {
  const host = normalizeSourceHost(value);
  return (
    SOURCE_ENGINES.find(
      engine =>
        engine.domains.some(domain => hostMatches(host, domain)) &&
        !engine.excluded.some(prefix => host.startsWith(`${prefix}.`)),
    )?.id || null
  );
}

export function getSourceCategory({
  host = '',
  utmMedium = '',
  utmSource = '',
  utmCampaign = '',
  hasPaidClick = false,
}: {
  host?: string;
  utmMedium?: string;
  utmSource?: string;
  utmCampaign?: string;
  hasPaidClick?: boolean;
}): SourceCategory {
  host = normalizeSourceHost(host);
  const medium = utmMedium.toLowerCase();
  if (hasPaidClick || PAID_MEDIA.includes(medium)) return 'paid';
  if (
    ['email', 'e-mail', 'newsletter'].includes(medium) ||
    EMAIL_DOMAINS.some(domain => hostMatches(host, domain))
  )
    return 'email';
  if (AI_DOMAINS.some(domain => hostMatches(host, domain))) return 'ai';
  if (
    ['social', 'social-media', 'social_media'].includes(medium) ||
    SOCIAL_DOMAINS.some(domain => hostMatches(host, domain))
  )
    return 'social';
  if (getSourceEngine(host) || medium === 'organic') return 'search';
  if (host) return 'external';
  return utmMedium || utmSource || utmCampaign ? 'campaign' : 'direct';
}

export function decodeSourceKeyword(engineId: string | null, query: string = '') {
  const engine = SOURCE_ENGINES.find(engine => engine.id === engineId);
  if (!engine) return { keyword: null, status: 'not-search' as const };
  for (const key of engine.keys) {
    const raw = query
      .replace(/^\?/, '')
      .split('&')
      .find(part => part.slice(0, part.indexOf('=')) === key)
      ?.slice(key.length + 1);
    if (!raw) continue;
    try {
      const keyword = decodeURIComponent(raw.replace(/\+/g, ' ')).trim();
      if (
        !keyword ||
        HIDDEN_TERMS.includes(keyword.toLowerCase()) ||
        /^[*•]+$/.test(keyword) ||
        Array.from(keyword).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
      )
        return { keyword: null, status: 'unavailable' as const };
      return { keyword, status: 'available' as const };
    } catch {
      return { keyword: null, status: 'unavailable' as const };
    }
  }
  return { keyword: null, status: 'unavailable' as const };
}

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;
const matchesSQL = (host: string, domains: readonly string[]) =>
  `(${domains.map(domain => `(${host} = ${literal(domain)} or ${host} like ${literal(`%.${domain}`)})`).join(' or ')})`;

export function sourceHostSQL(field: string, clickhouse: boolean) {
  return clickhouse
    ? `replaceRegexpOne(replaceRegexpOne(replaceRegexpOne(lowerUTF8(trimBoth(ifNull(${field}, ''))), ':[0-9]+$', ''), '[.]+$', ''), '^www[.]', '')`
    : `regexp_replace(regexp_replace(regexp_replace(lower(btrim(coalesce(${field}, ''))), ':[0-9]+$', ''), '[.]+$', ''), '^www[.]', '')`;
}

export function sourceEngineSQL(host: string) {
  return `case ${SOURCE_ENGINES.map(engine => `when ${matchesSQL(host, engine.domains)} ${engine.excluded.length ? `and not (${engine.excluded.map(prefix => `${host} like ${literal(`${prefix}.%`)}`).join(' or ')})` : ''} then ${literal(engine.id)}`).join('\n')} else '' end`;
}

export function sourceCategorySQL({
  host,
  engine,
  medium,
  source,
  campaign = "''",
  paid,
}: {
  host: string;
  engine: string;
  medium: string;
  source: string;
  campaign?: string;
  paid: string;
}) {
  return `case
    when ${paid} or lower(${medium}) in (${PAID_MEDIA.map(literal).join(',')}) then 'paid'
    when lower(${medium}) in ('email','e-mail','newsletter') or ${matchesSQL(host, EMAIL_DOMAINS)} then 'email'
    when ${matchesSQL(host, AI_DOMAINS)} then 'ai'
    when lower(${medium}) in ('social','social-media','social_media') or ${matchesSQL(host, SOCIAL_DOMAINS)} then 'social'
    when ${engine} != '' or lower(${medium}) = 'organic' then 'search'
    when ${host} != '' then 'external'
    when ${medium} != '' or ${source} != '' or ${campaign} != '' then 'campaign'
    else 'direct' end`;
}

export function sourceKeywordRawSQL(engine: string, query: string, clickhouse: boolean) {
  const value = (key: string) =>
    clickhouse
      ? `nullIf(extractURLParameter(concat('https://source.invalid/?', ${query}), '${key}'), '')`
      : `nullif(substring(${query} from '(?:^|&)${key}=([^&]*)'), '')`;
  return `case ${SOURCE_ENGINES.map(item => `when ${engine} = '${item.id}' then coalesce(${item.keys.map(value).join(',')}, '')`).join('\n')} else '' end`;
}

// Valid UTF-8 byte sequences, excluding NUL (PostgreSQL text cannot contain it).
const UTF8_HEX =
  '^(?:0[1-9a-f]|[1-7][0-9a-f]|(?:c[2-9a-f]|d[0-9a-f])[89ab][0-9a-f]|e0[ab][0-9a-f][89ab][0-9a-f]|e[1-9abcef][89ab][0-9a-f][89ab][0-9a-f]|ed[89][0-9a-f][89ab][0-9a-f]|f0[9ab][0-9a-f][89ab][0-9a-f][89ab][0-9a-f]|f[123][89ab][0-9a-f][89ab][0-9a-f][89ab][0-9a-f]|f48[0-9a-f][89ab][0-9a-f][89ab][0-9a-f])*$';

export function sourceKeywordDecodeSQL(field: string, clickhouse: boolean) {
  if (clickhouse) {
    const raw = `if(position(replaceRegexpAll(${field}, '%[0-9A-Fa-f]{2}', ''), '%') = 0, ${field}, '')`;
    const decoded = `decodeURLComponent(replaceAll(${raw}, '+', ' '))`;
    return `if(isValidUTF8(${decoded}) and position(${decoded}, char(0)) = 0, ${decoded}, '')`;
  }
  return `(select case when position('%' in regexp_replace(${field}, '%[0-9A-Fa-f]{2}', '', 'g')) = 0 and encoded.hex ~ '${UTF8_HEX}' then convert_from(decode(encoded.hex, 'hex'), 'UTF8') else '' end
    from (select string_agg(case when piece[1] ~ '^%[0-9A-Fa-f]{2}$' then lower(substr(piece[1], 2)) else encode(convert_to(piece[1], 'UTF8'), 'hex') end, '' order by ordinal) as hex
      from regexp_matches(replace(${field}, '+', ' '), '(%[0-9A-Fa-f]{2}|[^%]+|%)', 'g') with ordinality as parts(piece, ordinal)) encoded)`;
}

export function sourceKeywordCleanSQL(field: string, clickhouse: boolean) {
  const trimmed = clickhouse ? `trimBoth(${field})` : `btrim(${field})`;
  const control = clickhouse ? `match(${trimmed}, '[[:cntrl:]]')` : `${trimmed} ~ '[[:cntrl:]]'`;
  const masked = clickhouse ? `match(${trimmed}, '^[*•]+$')` : `${trimmed} ~ '^[*•]+$'`;
  return `case when ${trimmed} = '' or lower(${trimmed}) in (${HIDDEN_TERMS.map(literal).join(',')}) or ${control} or ${masked} then '' else ${trimmed} end`;
}
