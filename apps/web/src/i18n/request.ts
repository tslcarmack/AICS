import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, resolveLocale, type SupportedLocale } from '@aics/shared';

import zhCN from '../../messages/zh-CN.json';
import en from '../../messages/en.json';
import id from '../../messages/id.json';

const messagesMap: Record<SupportedLocale, typeof zhCN> = {
  'zh-CN': zhCN,
  en: en,
  id: id,
};

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('NEXT_LOCALE')?.value;
  const locale = resolveLocale(localeCookie);

  return {
    locale,
    messages: messagesMap[locale],
    onError(error) {
      // Silently fall back on missing translations
      if (error.code === 'MISSING_MESSAGE') return;
      console.error(error);
    },
    getMessageFallback({ namespace, key }) {
      return `${namespace}.${key}`;
    },
  };
});
