import { describe, expect, it } from 'vitest';

import { ImportDeclarationMap } from './import-declaration-map.js';
import { addLazyTypeImport, wrapLazyPropertyType } from './lazy-type.js';

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

describe('addLazyTypeImport', () => {
  it('adds an inline type-only import specifier', () => {
    const map = new ImportDeclarationMap();
    addLazyTypeImport(map, '../type-registry.js');

    expect([...map.toStatements()]).toEqual([
      expect.objectContaining({
        moduleSpecifier: '../type-registry.js',
        namedImports: [{ isTypeOnly: true, name: '__Lazy' }],
      }),
    ]);
  });
});
