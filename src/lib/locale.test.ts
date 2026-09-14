import { createRequire } from 'node:module';
import { expect, test } from 'vitest';
import { labels, messages } from '@/components/messages';
import enUS from '../../public/intl/messages/en-US.json';
import zhCN from '../../public/intl/messages/zh-CN.json';
import { isSupportedLocale, resolveAppLocale } from './locale';

const require = createRequire(import.meta.url);
const intlRequire = createRequire(createRequire(require.resolve('next-intl')).resolve('use-intl'));
const formatterRequire = createRequire(intlRequire.resolve('intl-messageformat'));
const { parse } = formatterRequire('@formatjs/icu-messageformat-parser');

function placeholders(message: string) {
  const variables = new Set<string>();
  const tags = new Set<string>();
  const visit = (nodes: any[]) => {
    for (const node of nodes) {
      if (node.type >= 1 && node.type <= 6) variables.add(node.value);
      if (node.type === 8) tags.add(node.value);
      if (node.children) visit(node.children);
      if (node.options) {
        for (const option of Object.values(node.options)) visit((option as any).value);
      }
    }
  };
  visit(parse(message));
  return { variables: [...variables].sort(), tags: [...tags].sort() };
}

test('clean installs use Simplified Chinese while explicit preferences remain authoritative', () => {
  expect(resolveAppLocale()).toBe('zh-CN');
  expect(resolveAppLocale('en-US')).toBe('en-US');
  expect(resolveAppLocale('fr-FR', 'zh-CN')).toBe('fr-FR');
  expect(resolveAppLocale(undefined, 'en-US')).toBe('en-US');
  expect(resolveAppLocale('unknown', 'invalid')).toBe('zh-CN');
  expect(isSupportedLocale('../../unexpected')).toBe(false);
});

test('every English message has a populated Chinese translation with matching ICU values and tags', () => {
  const technicalLabels = new Set(['cls', 'fcp', 'inp', 'lcp', 'llm', 'ttfb', 'url', 'utm']);
  for (const group of ['label', 'message'] as const) {
    expect(Object.keys(zhCN[group]).sort()).toEqual(Object.keys(enUS[group]).sort());
    for (const [key, source] of Object.entries(enUS[group])) {
      const translated = zhCN[group][key];
      expect(typeof translated, `${group}.${key}`).toBe('string');
      expect(translated.trim(), `${group}.${key}`).not.toBe('');
      expect(
        /\p{Script=Han}/u.test(translated) || (group === 'label' && technicalLabels.has(key)),
        `${group}.${key} must be translated`,
      ).toBe(true);
      expect(placeholders(translated), `${group}.${key}`).toEqual(placeholders(source));
    }
  }
});

test('message aliases resolve and visible analytics terms use consistent Chinese', () => {
  for (const alias of [...Object.values(labels), ...Object.values(messages)]) {
    const [group, key] = alias.split('.');
    expect(zhCN[group]?.[key], alias).toBeTruthy();
    expect(enUS[group]?.[key], alias).toBeTruthy();
  }
  expect(zhCN.label).toMatchObject({
    events: '事件',
    breakdown: '多维分析',
    retention: '留存分析',
    sessions: '会话',
    visitors: '访客',
    visits: '访问次数',
    'board-type': '看板类型',
    medium: '推广媒介',
  });
});
