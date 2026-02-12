import { Injectable } from '@nestjs/common';
import { DEFAULT_LOCALE, resolveLocale } from '@aics/shared';
import * as zhCN from './locales/zh-CN.json';
import * as en from './locales/en.json';
import * as id from './locales/id.json';

type TranslationMap = Record<string, unknown>;

const translations: Record<string, TranslationMap> = {
  'zh-CN': zhCN,
  en: en,
  id: id,
};

@Injectable()
export class I18nService {
  /**
   * Translate a key for the given locale.
   * Supports nested keys like 'ticket.notFound'.
   * Supports parameter interpolation with {param} syntax.
   * Falls back to DEFAULT_LOCALE if key not found.
   */
  t(key: string, locale?: string, params?: Record<string, string>): string {
    const resolvedLocale = resolveLocale(locale);
    let message = this.resolve(key, resolvedLocale);

    // Fall back to default locale
    if (!message && resolvedLocale !== DEFAULT_LOCALE) {
      message = this.resolve(key, DEFAULT_LOCALE);
    }

    // Fall back to key itself
    if (!message) {
      return key;
    }

    // Interpolate parameters
    if (params) {
      for (const [param, value] of Object.entries(params)) {
        message = message.replace(new RegExp(`\\{${param}\\}`, 'g'), value);
      }
    }

    return message;
  }

  private resolve(key: string, locale: string): string | undefined {
    const parts = key.split('.');
    let current: unknown = translations[locale];

    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return typeof current === 'string' ? current : undefined;
  }
}
