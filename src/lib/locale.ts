import { DEFAULT_LOCALE } from '@/lib/constants';
import { languages } from '@/lib/lang';

export function isSupportedLocale(locale: unknown): locale is keyof typeof languages {
  return typeof locale === 'string' && Object.hasOwn(languages, locale);
}

export function resolveAppLocale(preferred?: unknown, configured?: unknown): string {
  if (isSupportedLocale(preferred)) return preferred;
  if (isSupportedLocale(configured)) return configured;
  return DEFAULT_LOCALE;
}
