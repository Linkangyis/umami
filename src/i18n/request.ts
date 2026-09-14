import { getRequestConfig } from 'next-intl/server';
import { resolveAppLocale } from '@/lib/locale';

export default getRequestConfig(async () => {
  const locale = resolveAppLocale(
    undefined,
    process.env.defaultLocale || process.env.DEFAULT_LOCALE,
  );
  return {
    locale,
    messages: (await import(`../../public/intl/messages/${locale}.json`)).default,
  };
});
