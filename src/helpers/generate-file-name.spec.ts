import { describe, expect, it } from 'vitest';

import { generateFileName } from './generate-file-name.js';

describe('generateFileName', () => {
  const getModelName = (name: string) => {
    if (name.startsWith('User')) {
      return 'User';
    }
    if (name.startsWith('Post')) {
      return 'Post';
    }
    return undefined;
  };

  it('should generate file name with default template', () => {
    const result = generateFileName({
      getModelName,
      name: 'UserCreateInput',
      template: '{model}/{name}.{type}.ts',
      type: 'input',
    });

    expect(result).toBe('user/user-create.input.ts');
  });

  it('should generate file name for args type', () => {
    const result = generateFileName({
      getModelName,
      name: 'UserFindManyArgs',
      template: '{model}/{name}.{type}.ts',
      type: 'args',
    });

    expect(result).toBe('user/user-find-many.args.ts');
  });

  it('should fallback to prisma folder for unknown model', () => {
    const result = generateFileName({
      getModelName,
      name: 'SomeUnknownType',
      template: '{model}/{name}.{type}.ts',
      type: 'input',
    });

    expect(result).toBe('prisma/some-unknown-type.input.ts');
  });

  it('should handle plural type in template', () => {
    const result = generateFileName({
      getModelName,
      name: 'UserCreateInput',
      template: '{plural.type}/{name}.{type}.ts',
      type: 'input',
    });

    expect(result).toBe('inputs/user-create.input.ts');
  });

  it('should keep the type suffix when the template has no {type}', () => {
    const base = { getModelName: () => 'Thing', template: '{model}/{name}.ts' };

    expect(
      generateFileName({ ...base, name: 'ThingSumAggregateInput', type: 'input' }),
    ).toBe('thing/thing-sum-aggregate-input.ts');
    expect(generateFileName({ ...base, name: 'ThingSumAggregate', type: 'output' })).toBe(
      'thing/thing-sum-aggregate.ts',
    );
  });

  it('should strip the type suffix when the template uses {plural.type} only', () => {
    expect(
      generateFileName({
        getModelName: () => 'User',
        name: 'UserCreateInput',
        template: '{plural.type}/{name}.ts',
        type: 'input',
      }),
    ).toBe('inputs/user-create.ts');
  });

  it('should ignore a leading ./ in the template', () => {
    expect(
      generateFileName({
        getModelName: () => 'User',
        name: 'UserCreateInput',
        template: './{model}/{name}.{type}.ts',
        type: 'input',
      }),
    ).toBe('user/user-create.input.ts');
  });
});
