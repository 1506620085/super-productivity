import { TestBed } from '@angular/core/testing';
import { NumberToMonthPipe } from './number-to-month.pipe';
import { DateTimeFormatService } from '../../core/date-time-format/date-time-format.service';

describe('NumberToMonthPipe', () => {
  const createPipe = (locale: string): NumberToMonthPipe => {
    TestBed.configureTestingModule({
      providers: [
        NumberToMonthPipe,
        {
          provide: DateTimeFormatService,
          useValue: { textLocale: () => locale },
        },
      ],
    });
    return TestBed.inject(NumberToMonthPipe);
  };

  it('formats month names in English', () => {
    const pipe = createPipe('en-US');
    expect(pipe.transform(1)).toBe('January');
    expect(pipe.transform('12')).toBe('December');
  });

  it('formats month names in Simplified Chinese', () => {
    const pipe = createPipe('zh-CN');
    expect(pipe.transform(1)).toBe('一月');
    expect(pipe.transform(12)).toBe('十二月');
  });

  it('accepts an explicit locale override', () => {
    const pipe = createPipe('en-US');
    expect(pipe.transform(3, 'zh-CN')).toBe('三月');
  });

  it('returns undefined for invalid month numbers', () => {
    const pipe = createPipe('en-US');
    expect(pipe.transform(0)).toBeUndefined();
    expect(pipe.transform(13)).toBeUndefined();
    expect(pipe.transform('x')).toBeUndefined();
  });
});
