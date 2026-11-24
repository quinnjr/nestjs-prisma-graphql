import { describe, expect, it } from 'vitest';

import { classTransformerTypeArgument } from './class-transformer-type-argument.js';

describe('classTransformerTypeArgument', () => {
  it('returns a thunk to the class', () => {
    expect(classTransformerTypeArgument('UserWhereInput')).toBe('() => UserWhereInput');
  });
});
