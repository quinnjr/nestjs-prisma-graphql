import type { DMMF } from '../types.js';

import { countBy, isEqual, uniqWith } from 'lodash-es';
import outmatch from 'outmatch';

/**
 * Find input type for graphql field decorator.
 */
export function getGraphqlInputType(
  inputTypes: DMMF.InputTypeRef[],
  pattern?: string,
): DMMF.InputTypeRef {
  let result: DMMF.InputTypeRef | undefined;

  // eslint-disable-next-line no-param-reassign
  inputTypes = inputTypes.filter(t => !['null', 'Null'].includes(t.type));
  // eslint-disable-next-line no-param-reassign
  inputTypes = uniqWith(inputTypes, isEqual);

  if (inputTypes.length === 1) {
    return inputTypes[0];
  }

  const countTypes = countBy(inputTypes, x => x.location);
  const isOneType = Object.keys(countTypes).length === 1;

  if (isOneType) {
    result = inputTypes.find(x => x.isList);
    if (result) {
      return result;
    }
  }

  if (pattern !== null && pattern !== undefined && pattern.length > 0) {
    if (pattern.startsWith('matcher:') || pattern.startsWith('match:')) {
      const { 1: patternValue } = pattern.split(':', 2);
      const isMatch = outmatch(patternValue, { separator: false });
      result = inputTypes.find(x => isMatch(x.type));
      if (result !== undefined) {
        return result;
      }
    }
    result = inputTypes.find(x => x.type.includes(pattern));
    if (result !== undefined) {
      return result;
    }
  }

  result = inputTypes.find(x => x.location === 'inputObjectTypes');
  if (result !== undefined) {
    return result;
  }

  if (
    (countTypes.enumTypes ?? 0) > 0 &&
    (countTypes.scalar ?? 0) > 0 &&
    inputTypes.some(x => x.type === 'Json' && x.location === 'scalar')
  ) {
    result = inputTypes.find(x => x.type === 'Json' && x.location === 'scalar');
    if (result !== undefined) {
      return result;
    }
  }

  if (
    ((countTypes.scalar ?? 0) >= 1 || (countTypes.enumTypes ?? 0) >= 1) &&
    countTypes.fieldRefTypes === 1
  ) {
    result = inputTypes.find(
      x => (x.location === 'scalar' || x.location === 'enumTypes') && x.isList,
    );

    if (result !== undefined) {
      return result;
    }

    result = inputTypes.find(x => x.location === 'scalar' || x.location === 'enumTypes');

    if (result !== undefined) {
      return result;
    }
  }

  throw new TypeError(
    `Cannot get matching input type from ${
      inputTypes.length > 0
        ? inputTypes.map(x => x.type).join(', ')
        : 'zero length inputTypes'
    }`,
  );
}
