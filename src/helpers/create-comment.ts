import type { ObjectSettings } from '../types.js';

export function createComment(documentation: string, settings?: ObjectSettings): string {
  const documentationLines = documentation.split('\n');
  const commentLines = ['/**'];

  for (const line of documentationLines) {
    commentLines.push(` * ${line}`);
  }

  const fieldArgs = settings?.fieldArguments();
  let deprecationReason: string | undefined;
  if (fieldArgs === undefined) {
    deprecationReason = undefined;
  } else {
    deprecationReason = fieldArgs.deprecationReason as string | undefined;
  }

  if (
    deprecationReason !== undefined &&
    deprecationReason !== null &&
    deprecationReason.length > 0
  ) {
    commentLines.push(` * @deprecated ${deprecationReason}`);
  }

  commentLines.push(' */\n');

  return commentLines.join('\n');
}
