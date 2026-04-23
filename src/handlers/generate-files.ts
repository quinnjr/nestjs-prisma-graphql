/* eslint-disable @typescript-eslint/strict-boolean-expressions, @typescript-eslint/switch-exhaustiveness-check, @typescript-eslint/no-base-to-string, max-lines-per-function */
import type { EventArguments } from '../types.js';

import {
  type ClassDeclarationStructure,
  type ImportSpecifierStructure,
  type StatementStructures,
  StructureKind,
} from 'ts-morph';

import { ImportDeclarationMap } from '../helpers/import-declaration-map.js';
import { ok } from '../helpers/type-safe-assert.js';

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
      const classDeclaration = s.getClass(() => true);
      const stmts = s.getStructure().statements;
      // Reget decorator full name
      if (Array.isArray(stmts)) {
        for (const statement of stmts) {
          if (
            !(typeof statement === 'object' && statement.kind === StructureKind.Class)
          ) {
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
    const enums: Array<StatementStructures | string> = [];
    const classes: ClassDeclarationStructure[] = [];
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
    sourceFile.set({
      kind: StructureKind.SourceFile,
      statements: [...imports.toStatements(), ...enums, ...classes],
    });
  }

  const sourceFiles = project.getSourceFiles();
  const sourceFileCount = sourceFiles.length;
  // Type-safe console logging
  const logMessage = (msg: string): void => {
    // eslint-disable-next-line no-console
    console.log(msg);
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
