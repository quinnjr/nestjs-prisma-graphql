import type { EventArguments } from '../types.js';

import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

type LogFunction = (message: string) => void;
const globalConsole: { log: (message?: unknown) => void } = globalThis.console;
const defaultLog: LogFunction = message => {
  globalConsole.log(message);
};

/**
 * Printed on every esmCompatible run: the generator cannot know whether the
 * application has already been migrated off the type registry.
 */
export const TYPE_REGISTRY_REMOVED_NOTICE = [
  '',
  '!!! nestjs-prisma-graphql 2.0: the ESM type registry has been REMOVED !!!',
  '  - type-registry.ts and register-all-types.ts are no longer generated',
  "  - remove `import './@generated/register-all-types.js'` from your app entry point",
  "  - replace getType('X') / registerType() in your own code with the class itself",
  '  - nothing has to be imported first any more: import generated types directly',
  '  Migration guide: https://github.com/quinnjr/nestjs-prisma-graphql#migrating-to-20',
  '',
].join('\n');

/**
 * Files written by the 1.x type registry, with text that only the generator's
 * own versions contain. `.ts` is the normal output, `.js` and `.d.ts` come
 * from `emitCompiled`.
 */
const STALE_REGISTRY_FILES: ReadonlyArray<{ baseName: string; signature: RegExp }> = [
  {
    baseName: 'type-registry',
    signature: /function registerType\b[\s\S]*function getType\b/,
  },
  {
    baseName: 'register-all-types',
    // The .d.ts form drops the markRegistrationComplete import but keeps these exports
    signature:
      /\bmarkRegistrationComplete\b|\bregisteredTypes\b[\s\S]*\bRegisteredTypeName\b/,
  },
];
const STALE_EXTENSIONS = ['.ts', '.js', '.d.ts'];

/**
 * Deletes registry files left behind by a 1.x generate, with or without
 * `purgeOutput`. A stale `register-all-types` would keep an old import
 * compiling against code that no longer registers anything. A file is only
 * removed when its content identifies it as generated, so an unrelated user
 * file with the same name is never touched.
 */
export function removeStaleTypeRegistryFiles(
  args: Pick<EventArguments, 'output' | 'project'>,
  log: LogFunction = defaultLog,
): string[] {
  const { output, project } = args;
  const removed: string[] = [];

  for (const { baseName, signature } of STALE_REGISTRY_FILES) {
    for (const extension of STALE_EXTENSIONS) {
      const filePath = path.join(output, `${baseName}${extension}`);
      const sourceFile = project.getSourceFile(filePath);
      const onDisk = existsSync(filePath);
      if (!sourceFile && !onDisk) {
        continue;
      }

      const text = sourceFile ? sourceFile.getFullText() : readFileSync(filePath, 'utf8');
      if (!signature.test(text)) {
        continue;
      }

      if (sourceFile) {
        project.removeSourceFile(sourceFile);
      }
      if (onDisk) {
        rmSync(filePath, { force: true });
      }
      removed.push(filePath);
      log(`nestjs-prisma-graphql: deleted stale type registry file ${filePath}`);
    }
  }

  return removed;
}

/**
 * Announces the removal of the type registry and cleans up its old files.
 */
export function announceTypeRegistryRemoval(
  args: Pick<EventArguments, 'config' | 'output' | 'project'>,
  log: LogFunction = defaultLog,
): void {
  if (!args.config.esmCompatible) {
    return;
  }

  removeStaleTypeRegistryFiles(args, log);
  log(TYPE_REGISTRY_REMOVED_NOTICE);
}
