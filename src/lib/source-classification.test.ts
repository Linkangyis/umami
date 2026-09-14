import { expect, test } from 'vitest';
import {
  decodeSourceKeyword,
  getSourceCategory,
  getSourceEngine,
  normalizeSourceHost,
  sourceEngineSQL,
  sourceKeywordDecodeSQL,
} from './source-classification';

test.each([
  ['www.google.com', 'google'],
  ['www.google.co.uk', 'google'],
  ['GOOGLE.COM.:443', 'google'],
  ['cn.bing.com', 'bing'],
  ['m.baidu.com', 'baidu'],
  ['wap.sogou.com', 'sogou'],
  ['www.so.com', '360'],
  ['m.sm.cn', 'sm'],
  ['search.yahoo.co.jp', 'yahoo'],
  ['duckduckgo.com', 'duckduckgo'],
  ['yandex.ru', 'yandex'],
  ['search.brave.com', 'brave'],
  ['evilgoogle.com', null],
  ['google.com.evil.example', null],
  ['notso.com', null],
  ['mail.google.com', null],
  ['pan.baidu.com', null],
  ['finance.yahoo.com', null],
])('classifies search host %s with domain boundaries', (host, expected) => {
  expect(getSourceEngine(host)).toBe(expected);
});

test('uses campaign evidence without pretending that a UTM term is an organic keyword', () => {
  expect(getSourceCategory({ host: '' })).toBe('direct');
  expect(getSourceCategory({ host: 'google.com', hasPaidClick: true })).toBe('paid');
  expect(getSourceCategory({ host: 'mp.weixin.qq.com' })).toBe('social');
  expect(getSourceCategory({ host: 'chatgpt.com' })).toBe('ai');
  expect(getSourceCategory({ host: 'mail.google.com' })).toBe('email');
  expect(getSourceCategory({ utmSource: 'launch' })).toBe('campaign');
  expect(getSourceCategory({ utmCampaign: 'launch' })).toBe('campaign');
  expect(getSourceCategory({ host: 'google.com.evil.example' })).toBe('external');
  expect(decodeSourceKeyword('google', 'utm_term=made-up')).toEqual({
    keyword: null,
    status: 'unavailable',
  });
});

test('extracts engine-specific keys and safely decodes UTF-8, spaces and withheld values', () => {
  expect(decodeSourceKeyword('baidu', 'wd=%E6%B5%8B%E8%AF%95')).toEqual({
    keyword: '测试',
    status: 'available',
  });
  expect(decodeSourceKeyword('yahoo', 'q=wrong&p=correct+term').keyword).toBe('correct term');
  expect(decodeSourceKeyword('google', 'q=%68ello%20world').keyword).toBe('hello world');
  expect(decodeSourceKeyword('sogou', 'query=site+analytics').keyword).toBe('site analytics');
  for (const value of ['(not+provided)', '%FF', '%00', '%E0%A4%A', '%ZZ', '***', 'null', '']) {
    expect(decodeSourceKeyword('google', `q=${value}`).status).toBe('unavailable');
  }
  expect(decodeSourceKeyword(null, 'q=not-search').status).toBe('not-search');
  expect(normalizeSourceHost(' WWW.Example.COM. ')).toBe('example.com');
});

test('SQL definitions preserve host boundary matching and guard invalid encodings', () => {
  expect(sourceEngineSQL('host')).toContain("host like '%.google.com'");
  expect(sourceEngineSQL('host')).not.toContain("'%google%'");
  expect(sourceKeywordDecodeSQL('raw', false)).toContain('convert_from');
  expect(sourceKeywordDecodeSQL('raw', true)).toContain('isValidUTF8');
});
