const TEMPLATE_PREFIX = '`${';
const TEMPLATE_SUFFIX = '}`';

export function getEnumName(referenceName: string): string {
  // `${Role}` -> Role; enums with custom values are referenced directly (Role)
  if (
    referenceName.startsWith(TEMPLATE_PREFIX) &&
    referenceName.endsWith(TEMPLATE_SUFFIX)
  ) {
    return referenceName.slice(TEMPLATE_PREFIX.length, -TEMPLATE_SUFFIX.length);
  }

  return referenceName;
}
