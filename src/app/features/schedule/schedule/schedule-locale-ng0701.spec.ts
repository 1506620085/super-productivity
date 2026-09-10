import { ComponentFixture, TestBed } from '@angular/core/testing';
import { formatDate } from '@angular/common';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';
import { DateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';

import { ScheduleComponent } from './schedule.component';
import { CalendarEventActionsService } from '../../calendar-integration/calendar-event-actions.service';
import { TaskService } from '../../tasks/task.service';
import { LayoutService } from '../../../core-ui/layout/layout.service';
import { ScheduleService } from '../schedule.service';
import { GlobalTrackingIntervalService } from '../../../core/global-tracking-interval/global-tracking-interval.service';
import { GlobalConfigService } from '../../config/global-config.service';
import { DateTimeLocales } from '../../../core/locale.constants';
import { safeFormatDate } from '../../../util/safe-format-date';

/**
 * Regression guard for issue #7383 (NG0701 on /schedule).
 *
 * Upstream: non-default locales may be registered lazily via requestIdleCallback,
 * so schedule could render before locale data is ready and formatDate('zh-cn')
 * would throw NG0701. Fix: schedule goes through safeFormatDate (fallback).
 *
 * hangz: DEFAULT_LANGUAGE/DEFAULT_LOCALE are zh / zh-cn and register at
 * bootstrap, so the "zh-cn unregistered" race is not reproducible here — do
 * not assert that formatDate('zh-cn') throws. Keep the safeFormatDate /
 * headerTitle guards below.
 */
describe('issue #7383 — NG0701 race on /schedule', () => {
  describe('via Angular formatDate', () => {
    it('does NOT throw for en-gb (Angular falls back to baked-in en data)', () => {
      expect(() => formatDate(new Date(2026, 3, 20), 'LLLL yyyy', 'en-gb')).not.toThrow();
    });
  });

  describe('via ScheduleComponent.headerTitle()', () => {
    let component: ScheduleComponent;
    let fixture: ComponentFixture<ScheduleComponent>;
    let mockScheduleService: jasmine.SpyObj<ScheduleService>;
    let mockLayoutService: jasmine.SpyObj<LayoutService>;
    let localeSignal: ReturnType<
      typeof signal<{ firstDayOfWeek: number; dateTimeLocale: string }>
    >;

    beforeEach(async () => {
      const mockTaskService = jasmine.createSpyObj('TaskService', ['currentTaskId']);
      (mockTaskService as any).currentTaskId = signal(null);

      mockLayoutService = jasmine.createSpyObj('LayoutService', [], {
        selectedTimeView: signal('month'),
      });

      mockScheduleService = jasmine.createSpyObj('ScheduleService', [
        'getDaysToShow',
        'getMonthDaysToShow',
        'buildScheduleDays',
        'getTodayStr',
        'createScheduleDaysWithContext',
        'getDayClass',
        'hasEventsForDay',
        'getEventsForDay',
      ]);
      const monthDays = Array.from({ length: 35 }, (_, i) => {
        const d = new Date(2026, 3, 1 + i);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      });
      mockScheduleService.getDaysToShow.and.returnValue(monthDays);
      mockScheduleService.getMonthDaysToShow.and.returnValue(monthDays);
      mockScheduleService.buildScheduleDays.and.returnValue([]);
      mockScheduleService.getTodayStr.and.returnValue('2026-04-15');
      mockScheduleService.createScheduleDaysWithContext.and.returnValue([]);
      mockScheduleService.getDayClass.and.returnValue('');
      mockScheduleService.hasEventsForDay.and.returnValue(false);
      mockScheduleService.getEventsForDay.and.returnValue([]);
      (mockScheduleService as any).scheduleRefreshTick = signal(0);

      const mockGlobalTrackingIntervalService = jasmine.createSpyObj(
        'GlobalTrackingIntervalService',
        [],
        { todayDateStr$: of('2026-04-15') },
      );

      // The reporter's environment: dateTimeLocale='zh-cn'.
      localeSignal = signal({ firstDayOfWeek: 1, dateTimeLocale: 'zh-cn' });
      const mockGlobalConfigService = jasmine.createSpyObj('GlobalConfigService', [], {
        localization: localeSignal,
        cfg: signal(undefined),
      });

      await TestBed.configureTestingModule({
        imports: [ScheduleComponent, TranslateModule.forRoot()],
        providers: [
          provideMockStore({
            initialState: { issueProvider: { ids: [], entities: {} } },
          }),
          { provide: TaskService, useValue: mockTaskService },
          { provide: LayoutService, useValue: mockLayoutService },
          { provide: ScheduleService, useValue: mockScheduleService },
          { provide: MatDialog, useValue: jasmine.createSpyObj('MatDialog', ['open']) },
          {
            // ScheduleComponent's children (schedule-week/schedule-event) eagerly
            // inject the root-provided CalendarEventActionsService, whose real DI
            // chain pulls in IssueService → SnackService → LOCAL_ACTIONS (needs NgRx
            // Actions, which provideMockStore does not supply). Without a mock the
            // deferred CD pass after the test hits NG0201 and the async error kills
            // the whole Karma session. Mock it to keep the injector self-contained.
            provide: CalendarEventActionsService,
            useValue: jasmine.createSpyObj('CalendarEventActionsService', [
              'hasEventUrl',
              'isPluginEvent',
              'canMoveEvent',
              'openEventLink',
              'reschedule',
              'createAsTask',
              'hideForever',
              'deleteEvent',
            ]),
          },
          {
            provide: GlobalTrackingIntervalService,
            useValue: mockGlobalTrackingIntervalService,
          },
          { provide: GlobalConfigService, useValue: mockGlobalConfigService },
          {
            provide: DateAdapter,
            useValue: { getFirstDayOfWeek: () => 1, setLocale: () => {} },
          },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(ScheduleComponent);
      component = fixture.componentInstance;
    });

    it('does NOT throw for headerTitle when locale is zh-cn (safeFormatDate / #7383)', () => {
      // headerTitle() in month view calls safeFormatDate(mid, 'LLLL yyyy', 'zh-cn').
      // Must never crash the schedule view regardless of registration timing.
      let result: string | undefined;
      expect(() => {
        result = component.headerTitle();
      }).not.toThrow();
      expect(result).toMatch(/\S/);
    });
  });
});

/**
 * Coverage proof for issue #7405 (reported as a possible duplicate of #7383).
 *
 * #7405's reporter is on en-US Chrome but did not share their configured
 * `dateTimeLocale`. This block verifies that:
 *   1. 'en-us' itself never throws NG0701 (Angular ships en-US baked in),
 *      which would *refute* the duplicate diagnosis if and only if the
 *      reporter's `dateTimeLocale` was 'en-us'.
 *   2. safeFormatDate handles every locale string a user could have
 *      configured via DateTimeLocales — bounding the fix's safety across
 *      the entire config surface, regardless of which exact value the
 *      #7405 reporter had set.
 */
describe('issue #7405 — safeFormatDate coverage across DateTimeLocales', () => {
  const sample = new Date(2026, 3, 20);

  it("'en-us' does not throw NG0701 even without explicit registration", () => {
    // Refutes the duplicate hypothesis if reporter's dateTimeLocale was 'en-us'.
    expect(() => formatDate(sample, 'LLLL yyyy', 'en-us')).not.toThrow();
  });

  Object.entries(DateTimeLocales).forEach(([key, locale]) => {
    it(`safeFormatDate(_, _, '${locale}') returns non-empty without throwing [key=${key}]`, () => {
      let result: string | undefined;
      expect(() => {
        result = safeFormatDate(sample, 'LLLL yyyy', locale);
      }).not.toThrow();
      expect(result).toMatch(/\S/);
    });
  });
});
