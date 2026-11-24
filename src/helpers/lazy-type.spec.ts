import { StructureKind } from 'ts-morph';
import { describe, expect, it } from 'vitest';

import {
  createLazyTypeAlias,
  withExplicitTypeName,
  wrapLazyPropertyType,
} from './lazy-type.js';

describe('wrapLazyPropertyType', () => {
  it('wraps only the matching class reference', () => {
    expect(wrapLazyPropertyType(['Post', 'null'], 'Post')).toEqual([
      '__Lazy<Post>',
      'null',
    ]);
  });

  it('leaves other types untouched', () => {
    expect(wrapLazyPropertyType(['Prisma.AtLeast<A, "id">'], 'A')).toEqual([
      'Prisma.AtLeast<A, "id">',
    ]);
  });
});

describe('createLazyTypeAlias', () => {
  it('creates a non-exported identity alias', () => {
    const alias = createLazyTypeAlias();

    expect(alias).toMatchObject({
      kind: StructureKind.TypeAlias,
      name: '__Lazy',
      type: 'T',
      typeParameters: ['T'],
    });
    expect(alias.isExported).toBeUndefined();
  });
});

describe('withExplicitTypeName', () => {
  it('adds the name when there are no arguments', () => {
    expect(withExplicitTypeName([], 'Post')).toEqual(["'Post'"]);
  });

  it('puts the name before an options object', () => {
    expect(withExplicitTypeName(['{ isAbstract: true }'], 'Post')).toEqual([
      "'Post'",
      '{ isAbstract: true }',
    ]);
  });

  it('keeps a name that is already set', () => {
    expect(withExplicitTypeName(["'Article'", '{}'], 'Post')).toEqual([
      "'Article'",
      '{}',
    ]);
    expect(withExplicitTypeName(['"Article"'], 'Post')).toEqual(['"Article"']);
  });
});
