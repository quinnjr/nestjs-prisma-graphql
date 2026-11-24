/**
 * The argument for a class-transformer `@Type()` decorator on a nested input.
 *
 * `@Type()` takes a function returning the class, so the reference is only
 * read after all modules have loaded.
 */
export function classTransformerTypeArgument(graphqlType: string): string {
  return `() => ${graphqlType}`;
}
