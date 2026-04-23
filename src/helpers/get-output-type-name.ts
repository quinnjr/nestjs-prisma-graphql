export function getOutputTypeName(name: string): string {
  return name.replace(/(?:OutputType|Output)$/, '');
}
