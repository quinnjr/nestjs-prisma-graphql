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
  const templateHasType = /\{(?:plural\.)?type\}/.test(template);

  const rawPath = pupa(template, {
    get model() {
      const result = getModelName(name) ?? 'prisma';
      return kebabCase(result);
    },
    get name() {
      let result = kebabCase(name);

      // The type suffix is redundant only when the template already contains the type;
      // otherwise e.g. `ThingSumAggregateInput` would collide with output `ThingSumAggregate`
      if (!templateHasType) {
        return result;
      }

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
  // Drop `.` and empty segments (e.g. a leading `./`), which filenamify would turn into `-`
  return rawPath
    .split('/')
    .filter(segment => segment !== '' && segment !== '.')
    .map(segment => filenamify(segment, { replacement: '-' }))
    .join('/');
}
