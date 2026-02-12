import { zhCN } from 'date-fns/locale/zh-CN';
import { enUS } from 'date-fns/locale/en-US';
import { id } from 'date-fns/locale/id';
import type { Locale } from 'date-fns';
import { getLocale } from '@/i18n/locale';

const localeMap: Record<string, Locale> = {
  'zh-CN': zhCN,
  en: enUS,
  id: id,
};

/**
 * Get date-fns Locale object for the given app locale string.
 * Falls back to zhCN if locale is unknown.
 */
export function getDateLocale(locale?: string): Locale {
  const resolved = locale ?? getLocale();
  return localeMap[resolved] ?? zhCN;
}
