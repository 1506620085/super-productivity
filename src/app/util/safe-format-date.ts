import { formatDate } from '@angular/common';
import { DEFAULT_LOCALE } from '../core/locale.constants';

/**
 * Wrapper around Angular's `formatDate` that falls back to the default locale
 * if the requested locale's data hasn't been registered yet.
 *
 * Why: non-default locale data is lazily registered via requestIdleCallback
 * (see main.ts). If a render needs a date string with the user's configured
 * locale before that callback fires, Angular throws NG0701. See issue #7383.
 *
 * hangz: {@link DEFAULT_LOCALE} is `zh-cn` and is registered at bootstrap
 * alongside `zh`. The inner catch still guards unit tests / broken bootstrap
 * where that registration has not run, falling through to Angular's baked-in
 * `en` data so schedule headers never crash.
 *
 * After the idle callback completes and the user triggers any signal change
 * that re-evaluates the calling computed, the formatted output will switch
 * to the user's locale.
 */
export const safeFormatDate = (
  value: Date | string | number,
  format: string,
  locale: string,
): string => {
  try {
    return formatDate(value, format, locale) ?? '';
  } catch {
    try {
      return formatDate(value, format, DEFAULT_LOCALE) ?? '';
    } catch {
      return formatDate(value, format, 'en') ?? '';
    }
  }
};
