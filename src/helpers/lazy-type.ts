import type { ImportDeclarationMap } from './import-declaration-map.js';

// Prisma model and enum names must start with a letter, so this cannot collide
export const LAZY_TYPE_NAME = '__Lazy';

/**
 * Wraps the class reference of a lazily resolved (getType) property in the
 * generated `__Lazy<T>` identity alias.
 *
 * With `emitDecoratorMetadata`, a property typed as a class `X` emits
 * `design:type` metadata that reads `X` while the owning class is being
 * defined. Inside an ESM import cycle `X` may not be initialized yet, which
 * throws a TDZ ReferenceError at load time. A type alias has no runtime value,
 * so TypeScript records `Object` instead.
 */
export function wrapLazyPropertyType(propertyType: string[], typeName: string): string[] {
  return propertyType.map(type =>
    type === typeName ? `${LAZY_TYPE_NAME}<${type}>` : type,
  );
}

/**
 * Imports `__Lazy` as an inline type-only specifier (`import { type __Lazy }`), which
 * the ESM import post-processing leaves untouched.
 */
export function addLazyTypeImport(
  importDeclarations: ImportDeclarationMap,
  typeRegistryPath: string,
): void {
  importDeclarations.set(`type:${LAZY_TYPE_NAME}`, {
    moduleSpecifier: typeRegistryPath,
    namedImports: [{ isTypeOnly: true, name: LAZY_TYPE_NAME }],
  });
}
