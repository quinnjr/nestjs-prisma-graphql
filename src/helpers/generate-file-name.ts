import filenamify from 'filenamify';
import { kebabCase } from 'lodash-es';
import pluralize from 'pluralize';
import pupa from 'pupa';

export function generateFileName(args: {
  type: string;
  name: string;
  getModelName: (name: string) => string | undefined;
  template: string;
}): string {
  const { getModelName, name, template, type } = args;

  const rawPath = pupa(template, {
    get model(): string {
      const result = getModelName(name) ?? 'prisma';
      return kebabCase(result);
    },
    get name() {
      let result = kebabCase(name);

      for (const suffix of ['input', 'args', 'enum']) {
        const ending = `-${suffix}`;
        if (type === suffix && result.endsWith(ending)) {
          result = result.slice(0, -ending.length);
        }
      }
      return result;
    },
    plural: {
      get type() {
        return pluralize(type);
      },
    },
    type,
  });

  // Apply filenamify to each path segment after template expansion
  // Use maxLength: 255 (actual OS limit on ext4, NTFS, and HFS+)
  return rawPath
    .split('/')
    .map(segment => filenamify(segment, { maxLength: 255, replacement: '-' }))
    .join('/');
}
