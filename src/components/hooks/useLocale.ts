import { useEffect } from 'react';
import { LOCALE_CONFIG } from '@/lib/constants';
import { httpGet } from '@/lib/fetch';
import { getDateLocale, getTextDirection } from '@/lib/lang';
import { isSupportedLocale } from '@/lib/locale';
import { setItem } from '@/lib/storage';
import { setLocale, useApp } from '@/store/app';
import enUS from '../../../public/intl/messages/en-US.json';
import zhCN from '../../../public/intl/messages/zh-CN.json';
import { useForceUpdate } from './useForceUpdate';

const messages = {
  'en-US': enUS,
  'zh-CN': zhCN,
};

const selector = (state: { locale: string }) => state.locale;

export function useLocale() {
  const locale = useApp(selector);
  const forceUpdate = useForceUpdate();
  const dir = getTextDirection(locale);
  const dateLocale = getDateLocale(locale);

  async function loadMessages(locale: string) {
    const { data } = await httpGet(`${process.env.basePath || ''}/intl/messages/${locale}.json`);

    messages[locale] = {
      label: { ...enUS.label, ...data?.label },
      message: { ...enUS.message, ...data?.message },
    };
  }

  async function saveLocale(value: string) {
    if (!isSupportedLocale(value)) return;
    if (!messages[value]) {
      await loadMessages(value);
    }

    setItem(LOCALE_CONFIG, value);

    if (locale !== value) {
      setLocale(value);
    } else {
      forceUpdate();
    }
  }

  useEffect(() => {
    if (!messages[locale]) {
      saveLocale(locale);
    }
  }, [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.setAttribute('dir', getTextDirection(locale));
  }, [locale]);

  useEffect(() => {
    const url = new URL(window?.location?.href);
    const locale = url.searchParams.get('locale');

    if (locale) {
      saveLocale(locale);
    }
  }, []);

  return { locale, saveLocale, messages, dir, dateLocale };
}
