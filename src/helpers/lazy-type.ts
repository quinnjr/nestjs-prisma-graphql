import { StructureKind, type TypeAliasDeclarationStructure } from 'ts-morph';

// Prisma model and enum names must start with a letter, so this cannot collide
export const LAZY_TYPE_NAME = '__Lazy';

/**
 * Wraps the class reference of a property in the `__Lazy<T>` identity alias.
 *
 * With `emitDecoratorMetadata`, a property typed as a class `X` emits
 * `design:type` metadata that reads `X` while the owning class is being
 * defined. Inside an ESM import cycle `X` may not be initialized yet, which
 * throws a TDZ ReferenceError at load time. A type alias has no runtime value,
 * so TypeScript records `Object` instead. Field types themselves are thunks
 * (`@Field(() => X)`), so nothing else reads the class eagerly.
 */
export function wrapLazyPropertyType(propertyType: string[], typeName: string): string[] {
  return propertyType.map(type =>
    type === typeName ? `${LAZY_TYPE_NAME}<${type}>` : type,
  );
}

/**
 * The file-local `type __Lazy<T> = T;` declaration. It is emitted into every
 * generated file that uses the alias, so no shared helper module is needed.
 */
export function createLazyTypeAlias(): TypeAliasDeclarationStructure {
  return {
    docs: [
      'Identity alias: keeps decorator metadata from reading a class during an ESM import cycle.',
    ],
    kind: StructureKind.TypeAlias,
    name: LAZY_TYPE_NAME,
    type: 'T',
    typeParameters: ['T'],
  };
}

/**
 * Makes the GraphQL type name explicit in `@ObjectType()` / `@InputType()`
 * arguments. NestJS otherwise derives it from the class name, which bundlers
 * and minifiers rename (`Post2`, `$`). A name already given (e.g. through an
 * `@ObjectType({ name })` setting) is kept.
 */
export function withExplicitTypeName(
  decoratorArguments: string[],
  name: string,
): string[] {
  const [first] = decoratorArguments;
  if (first !== undefined && /^['"`]/.test(first)) {
    return decoratorArguments;
  }

  return [`'${name}'`, ...decoratorArguments];
}
