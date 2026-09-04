import { inject, Pipe, PipeTransform } from '@angular/core';
import { DateTimeFormatService } from '../../core/date-time-format/date-time-format.service';

@Pipe({ name: 'numberToMonth' })
export class NumberToMonthPipe implements PipeTransform {
  private readonly _dateTimeFormatService = inject(DateTimeFormatService);

  /**
   * @param value 1–12 month number
   * @param locale optional override; defaults to spelled-out text locale
   */
  transform(value: number | string, locale?: string): string | undefined {
    const monthIndex = parseInt(String(value), 10) - 1;
    if (!Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
      return undefined;
    }

    const effectiveLocale = locale || this._dateTimeFormatService.textLocale();
    return new Intl.DateTimeFormat(effectiveLocale, { month: 'long' }).format(
      new Date(2000, monthIndex, 1),
    );
  }
}
