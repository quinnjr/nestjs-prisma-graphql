import getRelativePath from 'get-relative-path';

export function relativePath(from: string, to: string): string {
  let fromPath = from;
  let toPath = to;
  if (!fromPath.startsWith('/')) {
    fromPath = `/${fromPath}`;
  }
  if (!toPath.startsWith('/')) {
    toPath = `/${toPath}`;
  }
  let result = getRelativePath(fromPath, toPath);
  if (!result.startsWith('.')) {
    result = `./${result}`;
  }
  if (result.endsWith('.ts')) {
    result = result.slice(0, -3);
  }
  return result;
}
