import type { EventArguments } from '../types.js';

import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Node, type SourceFile } from 'ts-morph';

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
  '  - files from 1.x that are no longer generated are deleted from the output directory',
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

const REGISTRY_IMPORT = /from\s+['"][^'"]*\/type-registry(?:\.js)?['"]/;
const REGISTER_CALL = /\bregisterType\(/;
// 1.x always emitted these two imports on separate lines
const GENERATED_REGISTER_IMPORT =
  /^import \{ registerType \} from '[^']*\/type-registry\.js';$/m;
const GENERATED_GET_TYPE_IMPORT =
  /^import \{ getType \} from '[^']*\/type-registry\.js';$/m;

/**
 * Whether a file still uses the removed registry at all.
 */
function usesTypeRegistry(text: string): boolean {
  return REGISTRY_IMPORT.test(text) && REGISTER_CALL.test(text);
}

/**
 * Whether a file has exactly the shape the 1.x generator wrote: its two
 * registry imports, other imports, one decorated class made only of
 * properties, and `registerType('X', X);` as the final statement. Anything
 * else may be hand-written and must not be deleted.
 */
function isGeneratedRegistryConsumer(sourceFile: SourceFile): boolean {
  const text = sourceFile.getFullText();
  if (!GENERATED_REGISTER_IMPORT.test(text) || !GENERATED_GET_TYPE_IMPORT.test(text)) {
    return false;
  }

  const statements = sourceFile.getStatements();
  const classes = sourceFile.getClasses();
  const [classDeclaration] = classes;
  const lastStatement = statements.at(-1);
  if (
    classes.length !== 1 ||
    classDeclaration === undefined ||
    lastStatement === undefined
  ) {
    return false;
  }

  const className = classDeclaration.getName() ?? '';
  const onlyGeneratedStatements = statements.every(
    statement =>
      statement === lastStatement ||
      statement === classDeclaration ||
      Node.isImportDeclaration(statement) ||
      Node.isTypeAliasDeclaration(statement),
  );
  const onlyProperties = classDeclaration
    .getMembers()
    .every(member => Node.isPropertyDeclaration(member));
  const registersItself =
    lastStatement.getText().replaceAll(/\s/g, '') ===
    `registerType('${className}',${className});`;

  return (
    onlyGeneratedStatements &&
    onlyProperties &&
    registersItself &&
    classDeclaration.getDecorators().length > 0
  );
}

/**
 * Deals with files that this run did not regenerate and that still use the
 * removed registry. Without `purgeOutput`, 1.x files for a model that was
 * since removed or renamed (or for types an option no longer emits) stay in
 * the output directory, and the barrels would re-export them, so one orphan
 * breaks the whole build. Every file regenerated in this run no longer
 * imports the registry, so anything that still does is left over.
 *
 * - A file with the exact shape the 1.x generator wrote is deleted.
 * - Any other file may be hand-written: it is kept on disk, left out of this
 *   run's barrels, and reported so its owner can migrate it.
 */
export function removeOrphanedRegistryConsumers(
  args: Pick<EventArguments, 'config' | 'output' | 'project'>,
  log: LogFunction = defaultLog,
): { removed: string[]; skipped: string[] } {
  const { config, output, project } = args;
  const removed: string[] = [];
  const skipped: string[] = [];
  if (!config.esmCompatible) {
    return { removed, skipped };
  }

  for (const sourceFile of project.getSourceFiles(`${output}/**/*.ts`)) {
    if (!usesTypeRegistry(sourceFile.getFullText())) {
      continue;
    }

    const filePath = sourceFile.getFilePath();
    const isGenerated = isGeneratedRegistryConsumer(sourceFile);
    project.removeSourceFile(sourceFile);

    if (!isGenerated) {
      skipped.push(filePath);
      log(
        `nestjs-prisma-graphql: WARNING ${filePath} still uses the removed type registry and was not written by the generator. It was left untouched and is excluded from this run's index files. Replace getType('X') with the class and delete registerType() calls.`,
      );
      continue;
    }

    // Also remove the emitCompiled forms next to it
    const basePath = filePath.replace(/\.ts$/, '');
    for (const extension of STALE_EXTENSIONS) {
      rmSync(`${basePath}${extension}`, { force: true });
    }
    removed.push(filePath);
    log(`nestjs-prisma-graphql: deleted orphaned 1.x file ${filePath}`);
  }

  if (removed.length > 0) {
    log(
      `nestjs-prisma-graphql: deleted ${String(removed.length)} file(s) left by a 1.x generate that still imported the removed type registry. Set purgeOutput = true to keep the output directory clean.`,
    );
  }

  return { removed, skipped };
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
