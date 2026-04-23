import { describe, it, expect } from 'vitest';
import { generateFileName } from './generate-file-name.js';

describe('generateFileName', () => {
  const getModelName = (name: string) => {
    if (name.startsWith('User')) return 'User';
    if (name.startsWith('Post')) return 'Post';
    return undefined;
  };

  it('should generate file name with default template', () => {
    const result = generateFileName({
      name: 'UserCreateInput',
      type: 'input',
      template: '{model}/{name}.{type}.ts',
      getModelName,
    });

    expect(result).toBe('user/user-create.input.ts');
  });

  it('should generate file name for args type', () => {
    const result = generateFileName({
      name: 'UserFindManyArgs',
      type: 'args',
      template: '{model}/{name}.{type}.ts',
      getModelName,
    });

    expect(result).toBe('user/user-find-many.args.ts');
  });

  it('should fallback to prisma folder for unknown model', () => {
    const result = generateFileName({
      name: 'SomeUnknownType',
      type: 'input',
      template: '{model}/{name}.{type}.ts',
      getModelName,
    });

    expect(result).toBe('prisma/some-unknown-type.input.ts');
  });

  it('should handle plural type in template', () => {
    const result = generateFileName({
      name: 'UserCreateInput',
      type: 'input',
      template: '{plural.type}/{name}.{type}.ts',
      getModelName,
    });

    expect(result).toBe('inputs/user-create.input.ts');
  });

  it('should handle long compound unique input names up to 255 chars', () => {
    // Simulate a compound unique input with very long field names
    const longName = 'UserByVeryLongFieldNameOneAndVeryLongFieldNameTwoAndVeryLongFieldNameThreeAndVeryLongFieldNameFourCompoundUniqueInput';

    const result = generateFileName({
      name: longName,
      type: 'input',
      template: '{model}/{name}.{type}.ts',
      getModelName,
    });

    // Should not truncate at 100 chars (old behavior)
    // Should allow up to 255 chars for the filename segment
    expect(result.length).toBeLessThanOrEqual('user/'.length + 255);
    expect(result).toContain('user/');
    expect(result).toContain('.input.ts');
  });

  it('should sanitize invalid filename characters', () => {
    const result = generateFileName({
      name: 'User:Invalid<Name>Input',
      type: 'input',
      template: '{model}/{name}.{type}.ts',
      getModelName,
    });

    // Invalid characters should be replaced with '-'
    expect(result).toBe('user/user-invalid-name.input.ts');
  });
});
