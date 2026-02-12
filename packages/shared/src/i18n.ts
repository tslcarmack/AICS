export const SUPPORTED_LOCALES = ['zh-CN', 'en', 'id'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'zh-CN';

export const LOCALE_NAMES: Record<SupportedLocale, string> = {
  'zh-CN': '简体中文',
  en: 'English',
  id: 'Bahasa Indonesia',
};

export function isValidLocale(locale: string): locale is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale);
}

export function resolveLocale(locale: string | null | undefined): SupportedLocale {
  if (locale && isValidLocale(locale)) return locale;
  return DEFAULT_LOCALE;
}
