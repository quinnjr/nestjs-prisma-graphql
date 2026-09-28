/**
 * The argument for a class-transformer `@Type()` decorator on a nested input.
 *
 * `@Type()` takes a function returning the class, so the registry lookup must
 * be wrapped in a thunk just like the direct reference.
 */
export function classTransformerTypeArgument(
  graphqlType: string,
  useGetType: boolean,
): string {
  return useGetType ? `() => getType('${graphqlType}')` : `() => ${graphqlType}`;
}
