import { Pipe, PipeTransform } from '@angular/core';
import { getSystemTagTitleKey } from './system-tag-title.util';

@Pipe({ name: 'systemTagTitleKey', standalone: true })
export class SystemTagTitleKeyPipe implements PipeTransform {
  transform(tagId: string | null | undefined, tagTitle?: string): string | null {
    return getSystemTagTitleKey(tagId ?? '', tagTitle) ?? null;
  }
}
