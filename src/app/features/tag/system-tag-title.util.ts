import { TranslateService } from '@ngx-translate/core';
import { T } from '../../t.const';
import { IMPORTANT_TAG, TODAY_TAG, URGENT_TAG } from './tag.const';

type SystemTagDef = { id: string; title: string; titleKey: string };

const SYSTEM_TAGS: readonly SystemTagDef[] = [
  { id: TODAY_TAG.id, title: TODAY_TAG.title, titleKey: T.G.TODAY_TAG_TITLE },
  { id: URGENT_TAG.id, title: URGENT_TAG.title, titleKey: T.G.URGENT_TAG_TITLE },
  {
    id: IMPORTANT_TAG.id,
    title: IMPORTANT_TAG.title,
    titleKey: T.G.IMPORTANT_TAG_TITLE,
  },
];

/** Translation key for a system tag title, or undefined for user tags / renamed tags. */
export const getSystemTagTitleKey = (
  tagId: string,
  tagTitle?: string,
): string | undefined => {
  const def = SYSTEM_TAGS.find((t) => t.id === tagId);
  if (!def) {
    return undefined;
  }
  if (tagTitle !== undefined && tagTitle !== def.title) {
    return undefined;
  }
  return def.titleKey;
};

export const getLocalizedTagTitle = (
  tag: { id: string; title: string },
  translateService: TranslateService,
): string => {
  const key = getSystemTagTitleKey(tag.id, tag.title);
  return key ? translateService.instant(key) : tag.title;
};
