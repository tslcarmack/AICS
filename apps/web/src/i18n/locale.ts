import { DEFAULT_LOCALE, resolveLocale, type SupportedLocale } from '@aics/shared';

const LOCALE_COOKIE = 'NEXT_LOCALE';
const LOCALE_STORAGE_KEY = 'locale';

export function getLocale(): SupportedLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  return resolveLocale(stored);
}

export function setLocale(locale: SupportedLocale): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=31536000;SameSite=Lax`;
  // Update html lang attribute
  document.documentElement.lang = locale;
}

/** Initialize locale on app load — sync localStorage to cookie if needed */
export function initLocale(): SupportedLocale {
  const locale = getLocale();
  // Ensure cookie is in sync
  setLocale(locale);
  return locale;
}
