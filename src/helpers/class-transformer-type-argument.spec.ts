import { describe, expect, it } from 'vitest';

import { classTransformerTypeArgument } from './class-transformer-type-argument.js';

describe('classTransformerTypeArgument', () => {
  it('should reference the class directly when not using the type registry', () => {
    expect(classTransformerTypeArgument('UserWhereInput', false)).toBe(
      '() => UserWhereInput',
    );
  });

  it('should wrap the registry lookup in a thunk when using the type registry', () => {
    expect(classTransformerTypeArgument('UserWhereInput', true)).toBe(
      "() => getType('UserWhereInput')",
    );
  });

  // class-transformer's @Type() calls its argument as a function. Passing
  // getType('X') hands it the class itself, which throws "Class constructor X
  // cannot be invoked without 'new'" once X is registered.
  it('should always produce a function for @Type()', () => {
    for (const useGetType of [false, true]) {
      expect(
        classTransformerTypeArgument('CaseNullableScalarRelationFilter', useGetType),
      ).toMatch(/^\(\) => /);
    }
  });
});
