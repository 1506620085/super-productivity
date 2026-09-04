import { TranslateService } from '@ngx-translate/core';
import { T } from '../../t.const';
import { getLocalizedTagTitle, getSystemTagTitleKey } from './system-tag-title.util';
import { IMPORTANT_TAG, URGENT_TAG } from './tag.const';

describe('system-tag-title.util', () => {
  const translateService = {
    instant: (key: string) => {
      const map: Record<string, string> = {
        [T.G.URGENT_TAG_TITLE]: '紧急',
        [T.G.IMPORTANT_TAG_TITLE]: '重要',
      };
      return map[key] ?? key;
    },
  } as TranslateService;

  it('returns translation keys for default urgent/important titles', () => {
    expect(getSystemTagTitleKey(URGENT_TAG.id, URGENT_TAG.title)).toBe(
      T.G.URGENT_TAG_TITLE,
    );
    expect(getSystemTagTitleKey(IMPORTANT_TAG.id, IMPORTANT_TAG.title)).toBe(
      T.G.IMPORTANT_TAG_TITLE,
    );
  });

  it('returns undefined when the user renamed the tag', () => {
    expect(getSystemTagTitleKey(URGENT_TAG.id, 'Very urgent')).toBeUndefined();
  });

  it('localizes default system tag titles', () => {
    expect(getLocalizedTagTitle(URGENT_TAG, translateService)).toBe('紧急');
    expect(getLocalizedTagTitle(IMPORTANT_TAG, translateService)).toBe('重要');
  });

  it('keeps custom tag titles unchanged', () => {
    expect(
      getLocalizedTagTitle({ id: 'custom', title: 'My tag' }, translateService),
    ).toBe('My tag');
  });
});
