import type Shepherd from 'shepherd.js';
type StepOptions = Shepherd.Step.StepOptions;
import { nextOnObs, twoWayObs } from './shepherd-helper';
import { LayoutService } from '../../core-ui/layout/layout.service';
import { TaskService } from '../tasks/task.service';
import { filter, switchMap } from 'rxjs/operators';
import { ofType } from '@ngrx/effects';
import { TaskSharedActions } from '../../root-store/meta/task-shared.actions';
import { GlobalConfigState } from '../config/global-config.model';
import { promiseTimeout } from '../../util/promise-timeout';
import { hideAddTaskBar } from '../../core-ui/layout/store/layout.actions';
import { KeyboardConfig } from '@sp/keyboard-config';
import { WorkContextService } from '../work-context/work-context.service';
import { ShepherdService } from './shepherd.service';
import { Observable } from 'rxjs';
import { Action } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { T } from '../../t.const';

const PRIMARY_CLASSES =
  'mdc-button mdc-button--unelevated mat-mdc-unelevated-button mat-primary mat-mdc-button-base';

export enum TourId {
  CreateTask = 'CreateTask',
  KeyboardNav = 'KeyboardNav',
}

export const SHEPHERD_STEPS = (
  shepherdService: ShepherdService,
  cfg: GlobalConfigState,
  actions$: Observable<Action>,
  layoutService: LayoutService,
  taskService: TaskService,
  workContextService: WorkContextService,
  translate: TranslateService,
): Array<StepOptions> => {
  const KEY_COMBO = (action: keyof KeyboardConfig): string =>
    `<kbd>${cfg.keyboard[action]}</kbd>`;
  const t = (key: string, params?: Record<string, string>): string =>
    translate.instant(key, params);

  const NEXT_BTN = {
    classes: PRIMARY_CLASSES,
    text: t(T.SHEPHERD.NEXT),
    type: 'next',
  };

  return [
    {
      id: TourId.CreateTask,
      title: t(T.SHEPHERD.CREATE_TASK.TITLE),
      text: t(T.SHEPHERD.CREATE_TASK.INTRO),
      buttons: [
        {
          classes: PRIMARY_CLASSES,
          text: t(T.SHEPHERD.CREATE_TASK.OPEN_BAR),
          action: () => {
            layoutService.showAddTaskBar();
            window.setTimeout(() => shepherdService.next());
          },
        },
      ],
    },
    {
      title: t(T.SHEPHERD.CREATE_TASK.TITLE),
      text: t(T.SHEPHERD.CREATE_TASK.TRY_EXAMPLE),
      attachTo: {
        element: 'add-task-bar',
        on: 'bottom',
      },
      beforeShowPromise: () => promiseTimeout(200),
      when: twoWayObs(
        {
          obs: actions$.pipe(ofType(TaskSharedActions.addTask)),
        },
        { obs: actions$.pipe(ofType(hideAddTaskBar)) },
        shepherdService,
      ),
    },
    {
      title: t(T.SHEPHERD.CREATE_TASK.CLOSE_BAR_TITLE),
      text: t(T.SHEPHERD.CREATE_TASK.CLOSE_BAR),
      attachTo: {
        element: 'add-task-bar',
        on: 'bottom',
      },
      beforeShowPromise: () => promiseTimeout(200),
      when: nextOnObs(actions$.pipe(ofType(hideAddTaskBar)), shepherdService),
    },
    {
      title: t(T.SHEPHERD.CREATE_TASK.SHORT_SYNTAX_TITLE),
      text: t(T.SHEPHERD.CREATE_TASK.SHORT_SYNTAX),
      buttons: [NEXT_BTN],
    },
    {
      title: t(T.SHEPHERD.CREATE_TASK.SHORT_SYNTAX_SETTINGS_TITLE),
      text: t(T.SHEPHERD.CREATE_TASK.SHORT_SYNTAX_SETTINGS),
      buttons: [
        {
          text: t(T.SHEPHERD.END_TOUR),
          classes: PRIMARY_CLASSES,
          action: () => {
            shepherdService.complete();
          },
        },
      ],
    },
    {
      id: TourId.KeyboardNav,
      title: t(T.SHEPHERD.KEYBOARD_NAV.TITLE),
      text: t(T.SHEPHERD.KEYBOARD_NAV.INTRO),
      buttons: [NEXT_BTN],
    },
    {
      title: t(T.SHEPHERD.KEYBOARD_NAV.TITLE),
      text: t(T.SHEPHERD.KEYBOARD_NAV.ADD_TASKS, {
        key: KEY_COMBO('addNewTask'),
      }),
      when: nextOnObs(
        layoutService.isShowAddTaskBar$.pipe(filter((v) => v)),
        shepherdService,
      ),
    },
    {
      title: t(T.SHEPHERD.KEYBOARD_NAV.ENTER_TITLE_TITLE),
      text: t(T.SHEPHERD.KEYBOARD_NAV.ENTER_TITLE),
      attachTo: {
        element: 'add-task-bar',
        on: 'bottom',
      },
      beforeShowPromise: () => promiseTimeout(200),
      when: twoWayObs(
        {
          obs: actions$.pipe(
            ofType(TaskSharedActions.addTask),
            switchMap(() =>
              workContextService.mainListTasks$.pipe(
                filter((tasks) => tasks.length >= 4),
              ),
            ),
          ),
        },
        { obs: actions$.pipe(ofType(hideAddTaskBar)) },
        shepherdService,
      ),
    },
    {
      title: t(T.SHEPHERD.KEYBOARD_NAV.CLOSE_BAR_TITLE),
      text: t(T.SHEPHERD.KEYBOARD_NAV.CLOSE_BAR),
      attachTo: {
        element: 'add-task-bar',
        on: 'bottom',
      },
      beforeShowPromise: () => promiseTimeout(200),
      when: nextOnObs(
        actions$.pipe(ofType(hideAddTaskBar)),
        // delay because other hide should trigger first
        shepherdService,
      ),
    },
    {
      title: t(T.SHEPHERD.KEYBOARD_NAV.FOCUSED_TASK_TITLE),
      text: t(T.SHEPHERD.KEYBOARD_NAV.FOCUSED_TASK),
      when: {
        show: () => taskService.focusFirstTaskIfVisible(),
      },
      buttons: [NEXT_BTN],
    },
    {
      title: t(T.SHEPHERD.KEYBOARD_NAV.FOCUSING_TITLE),
      text: t(T.SHEPHERD.KEYBOARD_NAV.FOCUSING, {
        key: KEY_COMBO('goToWorkView'),
      }),
      buttons: [NEXT_BTN],
    },
    {
      title: t(T.SHEPHERD.KEYBOARD_NAV.MOVING_AROUND_TITLE),
      text: t(T.SHEPHERD.KEYBOARD_NAV.MOVING_AROUND),
      when: {
        show: () => taskService.focusFirstTaskIfVisible(),
      },
      buttons: [NEXT_BTN],
      attachTo: {
        element: 'task-list',
        on: 'bottom',
      },
      highlightClass: '',
    },
    {
      title: t(T.SHEPHERD.KEYBOARD_NAV.MOVING_TASKS_TITLE),
      text: t(T.SHEPHERD.KEYBOARD_NAV.MOVING_TASKS, {
        up: KEY_COMBO('moveTaskUp'),
        down: KEY_COMBO('moveTaskDown'),
      }),
      when: {
        show: () => taskService.focusFirstTaskIfVisible(),
      },
      buttons: [NEXT_BTN],
      attachTo: {
        element: 'task-list',
        on: 'bottom',
      },
      highlightClass: '',
    },
    {
      title: t(T.SHEPHERD.KEYBOARD_NAV.EDIT_TITLE_TITLE),
      text: t(T.SHEPHERD.KEYBOARD_NAV.EDIT_TITLE),
      when: {
        show: () => taskService.focusFirstTaskIfVisible(),
      },
      buttons: [NEXT_BTN],
      attachTo: {
        element: 'task-list',
        on: 'bottom',
      },
      highlightClass: '',
    },
    {
      title: t(T.SHEPHERD.KEYBOARD_NAV.DETAILS_TITLE),
      text: t(T.SHEPHERD.KEYBOARD_NAV.DETAILS),
      when: {
        show: () => taskService.focusFirstTaskIfVisible(),
      },
      buttons: [NEXT_BTN],
      attachTo: {
        element: 'task-list',
        on: 'bottom',
      },
      highlightClass: '',
    },
    {
      title: t(T.SHEPHERD.KEYBOARD_NAV.MORE_SHORTCUTS_TITLE),
      when: {
        show: () => taskService.focusFirstTaskIfVisible(),
      },
      text: t(T.SHEPHERD.KEYBOARD_NAV.MORE_SHORTCUTS, {
        schedule: KEY_COMBO('taskSchedule'),
        delete: KEY_COMBO('taskDelete'),
        toggleDone: KEY_COMBO('taskToggleDone'),
        addSubTask: KEY_COMBO('taskAddSubTask'),
        addAttachment: KEY_COMBO('taskAddAttachment'),
        togglePlay: KEY_COMBO('togglePlay'),
      }),
      buttons: [NEXT_BTN],
      attachTo: {
        element: 'task-list',
        on: 'bottom',
      },
      highlightClass: '',
    },
    {
      title: t(T.SHEPHERD.KEYBOARD_NAV.CONGRATS_TITLE),
      text: t(T.SHEPHERD.KEYBOARD_NAV.CONGRATS),
      buttons: [
        {
          text: t(T.SHEPHERD.END_TOUR),
          classes: PRIMARY_CLASSES,
          action: () => {
            shepherdService.complete();
          },
        },
      ],
    },
  ];
};
