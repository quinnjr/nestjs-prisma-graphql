export function getEnumName(referenceName: string): string {
  // `${Role}`
  return referenceName.slice(3, -2);
}
