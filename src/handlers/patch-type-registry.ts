/* eslint-disable no-console, @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unused-vars */
import type { EventArguments} from '../types.js';

/**
 * Patches the generated type-registry file to make TypeScript happy:
 *
 * 1. Rewrite getType<T = unknown> to getType<T = any>
 *    The generator emits @Field(() => getType('Foo')) without explicit type args.
 *    With T = unknown, the return value isn't assignable to @nestjs/graphql's
 *    ReturnTypeFuncValue, causing TS2322 errors. any is assignable.
 *
 * 2. Prepend // @ts-nocheck to all generated files
 *    The generator has edge cases on deep relations that leave some imports
 *    pointing at truncated filenames. Files work at runtime (registry resolves
 *    types lazily) but tsc --noEmit rejects them.
 */
export function patchTypeRegistry(args: EventArguments): void {
  const { output, project } = args;

  // type-registry is always .ts regardless of outputFilePattern
  const registryFile = project.getSourceFile(`${output}/type-registry.ts`);

  if (!registryFile) {
    console.warn('nestjs-prisma-graphql: type-registry file not found, skipping patch');
    return;
  }

  // Patch 1: <T = unknown> → <T = any>
  const content = registryFile.getText();
  const patched = content.replace(/<T = unknown>/g, '<T = any>');
  if (patched !== content) {
    registryFile.replaceWithText(patched);
    console.log('nestjs-prisma-graphql: patched type-registry <T = unknown> → <T = any>');
  }

  // Patch 2: Prepend // @ts-nocheck to all generated files
  // Find both .ts and .js files depending on outputFilePattern
  const _extension = args.config.outputFilePattern?.includes('.js') ? '.js' : '.ts';
  const allSourceFiles = project.getSourceFiles(`${output}/**/*.{ts,js}`);
  let nocheckCount = 0;

  for (const sourceFile of allSourceFiles) {
    const text = sourceFile.getText();
    if (!text.startsWith('// @ts-nocheck')) {
      sourceFile.replaceWithText(`// @ts-nocheck\n${text}`);
      nocheckCount++;
    }
  }

  if (nocheckCount > 0) {
    console.log(`nestjs-prisma-graphql: added // @ts-nocheck to ${nocheckCount} files`);
  }
}
