/* eslint-disable @typescript-eslint/strict-boolean-expressions, @typescript-eslint/switch-exhaustiveness-check, @typescript-eslint/no-base-to-string, max-lines-per-function */
import type { EventArguments } from '../types.js';

import path from 'node:path';
import {
  type ClassDeclarationStructure,
  type ImportDeclarationStructure,
  type ImportSpecifierStructure,
  type OptionalKind,
  type StatementStructures,
  StructureKind,
} from 'ts-morph';

import { ImportDeclarationMap } from '../helpers/import-declaration-map.js';
import { LAZY_TYPE_NAME } from '../helpers/lazy-type.js';
import { ok } from '../helpers/type-safe-assert.js';
import { suppressTypeErrors } from './suppress-type-errors.js';

/**
 * Generated root helper modules that emitSingle keeps as separate files,
 * because their functions and type aliases are not merged into index.ts.
 */
const SINGLE_FILE_HELPERS = new Set(['decimal-helpers']);
/** Helper specifiers after rewriting by markSingleFileHelperImports */
const SINGLE_FILE_HELPER_SPECIFIER = /^\.\/decimal-helpers(?:\.js)?$/;

/**
 * Rewrites imports of root helper modules to their index.ts-relative
 * specifier; all other relative imports are dropped later.
 */
function markSingleFileHelperImports(
  statements: unknown,
  importingDirectory: string,
  outputDirectory: string,
): void {
  if (!Array.isArray(statements)) {
    return;
  }
  for (const statement of statements as Array<StatementStructures | string>) {
    if (
      typeof statement === 'string' ||
      statement.kind !== StructureKind.ImportDeclaration
    ) {
      continue;
    }
    const helperSpecifier = getSingleFileHelperSpecifier({
      importingDirectory,
      moduleSpecifier: statement.moduleSpecifier,
      outputDirectory,
    });
    // A relative import that is not a root helper must never look like one
    statement.moduleSpecifier =
      helperSpecifier ??
      (SINGLE_FILE_HELPER_SPECIFIER.test(statement.moduleSpecifier)
        ? `../${statement.moduleSpecifier.slice(2)}`
        : statement.moduleSpecifier);
  }
}

/**
 * Maps an import of a root helper module to its specifier from the single
 * index.ts (`./decimal-helpers.js`). The specifier is resolved against the
 * importing file, so a model file that happens to be named like a helper in a
 * subdirectory is not mistaken for it.
 */
function getSingleFileHelperSpecifier(args: {
  moduleSpecifier: string;
  importingDirectory: string;
  outputDirectory: string;
}): string | undefined {
  const { importingDirectory, moduleSpecifier, outputDirectory } = args;
  if (!moduleSpecifier.startsWith('.')) {
    return undefined;
  }

  const extension = moduleSpecifier.endsWith('.js') ? '.js' : '';
  const resolved = path.posix.resolve(
    importingDirectory,
    extension === '' ? moduleSpecifier : moduleSpecifier.slice(0, -extension.length),
  );
  if (path.posix.dirname(resolved) !== path.posix.resolve(outputDirectory)) {
    return undefined;
  }

  const name = path.posix.basename(resolved);
  if (!SINGLE_FILE_HELPERS.has(name)) {
    return undefined;
  }

  return `./${name}${extension}`;
}

type HelperImports = Map<string, Map<string, OptionalKind<ImportSpecifierStructure>>>;

/**
 * Records named imports of root helper modules so emitSingle can re-import
 * them from index.ts, keeping type-only specifiers type-only.
 */
function collectHelperImport(
  helperImports: HelperImports,
  statement: OptionalKind<ImportDeclarationStructure>,
): void {
  const helperSpecifier = SINGLE_FILE_HELPER_SPECIFIER.test(statement.moduleSpecifier)
    ? statement.moduleSpecifier
    : undefined;
  if (helperSpecifier === undefined || !Array.isArray(statement.namedImports)) {
    return;
  }

  const specifiers =
    helperImports.get(helperSpecifier) ??
    new Map<string, OptionalKind<ImportSpecifierStructure>>();
  for (const namedImport of statement.namedImports as ImportSpecifierStructure[]) {
    specifiers.set(namedImport.name, {
      isTypeOnly: namedImport.isTypeOnly === true || statement.isTypeOnly === true,
      name: namedImport.name,
    });
  }
  helperImports.set(helperSpecifier, specifiers);
}

export async function generateFiles(args: EventArguments): Promise<void> {
  const { config, eventEmitter, output, project } = args;

  if (config.emitSingle) {
    const rootDirectory = project.getDirectory(output) ?? project.createDirectory(output);
    const sourceFile =
      rootDirectory.getSourceFile('index.ts') ??
      rootDirectory.createSourceFile('index.ts', undefined, { overwrite: true });
    const statements = project.getSourceFiles().flatMap(s => {
      if (s === sourceFile) {
        return [];
      }
      const baseName = s.getBaseNameWithoutExtension();
      // Only root files can be generated helpers; a model may share their names elsewhere
      const isRootFile = s.getDirectoryPath() === rootDirectory.getPath();
      // Helper modules (functions, type aliases) are kept as separate files
      if (isRootFile && SINGLE_FILE_HELPERS.has(baseName)) {
        return [];
      }
      const classDeclaration = s.getClass(() => true);
      const stmts = s.getStructure().statements;
      markSingleFileHelperImports(stmts, s.getDirectoryPath(), rootDirectory.getPath());
      // Reget decorator full name
      if (Array.isArray(stmts)) {
        for (const statement of stmts) {
          if (!(
            typeof statement === 'object' && statement.kind === StructureKind.Class
          )) {
            continue;
          }
          for (const property of statement.properties ?? []) {
            for (const decorator of property.decorators ?? []) {
              const fullName = classDeclaration
                ?.getProperty(property.name)
                ?.getDecorator(decorator.name)
                ?.getFullName();
              ok(
                fullName !== undefined,
                `Cannot get full name of decorator of class ${String(statement.name)}`,
              );
              decorator.name = fullName;
            }
          }
        }
      }

      project.removeSourceFile(s);
      return stmts;
    });
    const imports = new ImportDeclarationMap();
    const helperImports: HelperImports = new Map();
    const enums: Array<StatementStructures | string> = [];
    const classes: ClassDeclarationStructure[] = [];
    // Files that use the __Lazy alias each declare it; the single file needs it once
    let lazyTypeAlias: StatementStructures | undefined;
    for (const statement of statements as Array<StatementStructures | string>) {
      if (typeof statement === 'string') {
        if (statement.startsWith('registerEnumType')) {
          enums.push(statement);
        }
        continue;
      }
      switch (statement.kind) {
        case StructureKind.ImportDeclaration: {
          if (
            statement.moduleSpecifier.startsWith('./') ||
            statement.moduleSpecifier.startsWith('..')
          ) {
            collectHelperImport(helperImports, statement);
            continue;
          }
          for (const namedImport of statement.namedImports as ImportSpecifierStructure[]) {
            const name = namedImport.alias ?? namedImport.name;
            imports.add(name, statement.moduleSpecifier);
          }
          if (statement.defaultImport) {
            imports.create({
              defaultImport: statement.defaultImport,
              from: statement.moduleSpecifier,
              name: statement.defaultImport,
            });
          }
          if (statement.namespaceImport) {
            imports.create({
              from: statement.moduleSpecifier,
              name: statement.namespaceImport,
              namespaceImport: statement.namespaceImport,
            });
          }
          break;
        }
        case StructureKind.TypeAlias: {
          if (statement.name === LAZY_TYPE_NAME) {
            lazyTypeAlias ??= statement;
          }
          break;
        }
        case StructureKind.Enum: {
          enums.unshift(statement);
          break;
        }
        case StructureKind.Class: {
          classes.push(statement);
          break;
        }
      }
    }
    for (const customImport of config.customImport) {
      imports.create(customImport);
    }
    for (const [moduleSpecifier, specifiers] of helperImports) {
      imports.set(moduleSpecifier, {
        moduleSpecifier,
        namedImports: [...specifiers.values()],
      });
    }
    sourceFile.set({
      kind: StructureKind.SourceFile,
      statements: [
        ...imports.toStatements(),
        ...(lazyTypeAlias ? [lazyTypeAlias] : []),
        ...enums,
        ...classes,
      ],
    });

    // The merge rebuilt index.ts from structures, which drops the // @ts-nocheck
    // added before GenerateFiles, so apply esmSuppressTypeErrors again
    if (config.esmCompatible) {
      suppressTypeErrors(args);
    }
  }

  const sourceFiles = project.getSourceFiles();
  const sourceFileCount = sourceFiles.length;
  // Type-safe console logging
  type ConsoleLogFunction = (message?: unknown, ...optionalParams: unknown[]) => void;
  const globalConsole: { log: ConsoleLogFunction } = globalThis.console;
  const logMessage = (msg: string): void => {
    globalConsole.log(msg);
  };
  logMessage(
    `nestjs-prisma-graphql: saving ${String(sourceFileCount)} source files to ${output}`,
  );

  if (sourceFileCount === 0) {
    throw new Error(
      'nestjs-prisma-graphql: project has 0 source files — nothing to write',
    );
  }

  if (config.emitCompiled) {
    project.compilerOptions.set({
      declaration: true,
      declarationDir: output,
      emitDecoratorMetadata: false,
      outDir: output,
      rootDir: output,
      skipLibCheck: true,
    });
    const emitResult = await project.emit();
    const errors = emitResult.getDiagnostics().map(d => String(d.getMessageText()));
    if (errors.length > 0) {
      eventEmitter.emitSync('Warning', errors);
    }
  } else {
    // For large schemas (2000+ files), save in batches to avoid stack overflow
    // ts-morph's project.save() can build up deep call stacks on large projects
    const BATCH_SIZE = 100;
    if (sourceFileCount > BATCH_SIZE) {
      logMessage(
        `nestjs-prisma-graphql: using batched save for large schema (${String(sourceFileCount)} files)`,
      );
      for (let i = 0; i < sourceFileCount; i += BATCH_SIZE) {
        const batch = sourceFiles.slice(i, i + BATCH_SIZE);
        logMessage(
          `nestjs-prisma-graphql: saving batch ${String(Math.floor(i / BATCH_SIZE) + 1)}/${String(Math.ceil(sourceFileCount / BATCH_SIZE))} (${String(batch.length)} files)`,
        );
        await Promise.all(batch.map(async sf => await sf.save()));
      }
    } else {
      await project.save();
    }
  }
}
