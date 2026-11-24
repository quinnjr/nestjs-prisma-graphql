import type { EventArguments } from '../types.js';

import { relativePath } from '../helpers/relative-path.js';
import { ReExport } from './re-export.js';

/**
 * Generate the register-all-types.ts file that imports all generated types
 * to ensure their registerType() calls are executed.
 *
 * This file must be imported early in the application, before any code
 * tries to use getType() for lazy type resolution.
 *
 * This solves the ESM bundling issue where CJS would return valid bundles
 * but ESM complains about broken dependency cycles.
 */
export function generateRegisterAllTypes(args: EventArguments): void {
  const { config, output, project } = args;

  if (!config.esmCompatible) {
    return;
  }

  const rootDirectory = project.getDirectory(output) ?? project.createDirectory(output);

  // Use .js extension if outputFilePattern uses .js, otherwise .ts
  const extension = config.outputFilePattern?.includes('.js') ? '.js' : '.ts';
  const sourceFile = rootDirectory.createSourceFile(
    `register-all-types${extension}`,
    undefined,
    {
      overwrite: true,
    },
  );

  // Collect all generated source files that have registerType() calls
  const importPaths: string[] = [];
  const typeNames: string[] = [];

  // Get all source files in the output directory
  // Support both .ts (default) and .js (when outputFilePattern uses .js)
  const allSourceFiles = project.getSourceFiles(`${output}/**/*.{ts,js}`);

  for (const file of allSourceFiles) {
    const filePath = file.getFilePath();

    // Skip the root utility files and barrels. Compare by location: a model file may
    // share a helper's name in its own directory (e.g. type-registry/type-registry.ts).
    const isRootFile = file.getDirectoryPath() === rootDirectory.getPath();
    if (
      file === sourceFile ||
      (isRootFile && file.getBaseNameWithoutExtension() === 'type-registry') ||
      filePath.endsWith('index.ts')
    ) {
      continue;
    }

    // Check if this file has a registerType() call
    const fileText = file.getText();
    const registerMatch = /registerType\(['"]([^'"]+)['"]/.exec(fileText);
    if (registerMatch) {
      // Get relative path from register-all-types.ts to this file
      let relPath = relativePath(sourceFile.getFilePath(), filePath);
      // Add .js extension for ESM module resolution
      if (!relPath.endsWith('.js')) {
        relPath += '.js';
      }
      importPaths.push(relPath);
      typeNames.push(registerMatch[1]);
    }
  }

  // Sort for consistent output
  importPaths.sort();
  typeNames.sort();

  // Generate the file content with proper ESM handling
  const fileContent = `/**
 * ESM Type Registration Module
 *
 * This file registers all generated types with the type registry to solve
 * ESM circular dependency issues. In ESM, unlike CommonJS, circular imports
 * can result in undefined values because modules are evaluated in a different order.
 *
 * IMPORTANT: Import this file at the very top of your application entry point,
 * BEFORE any other code that uses the generated types.
 *
 * Example usage in main.ts:
 *
 *   // This MUST be the first import
 *   import './@generated/register-all-types.js';
 *
 *   // Now you can safely import and use generated types
 *   import { NestFactory } from '@nestjs/core';
 *   import { AppModule } from './app.module.js';
 *
 * Why this is needed:
 * - ESM uses "live bindings" where imports reference the actual export
 * - With circular deps (User -> Post -> User), one module isn't ready when imported
 * - CJS would give a partial object that fills in later; ESM gives undefined
 * - This registry pattern defers type resolution until runtime when all modules are loaded
 */

import { markRegistrationComplete } from './type-registry.js';

// Import all generated type files to trigger their registerType() calls
// These are side-effect imports that populate the type registry
${importPaths.map(p => `import '${p}';`).join('\n')}

// Mark registration as complete to enable warning messages
markRegistrationComplete();

// Export type names for validation (optional)
export const registeredTypes = [
${typeNames.map(n => `  '${n}',`).join('\n')}
] as const;

export type RegisteredTypeName = typeof registeredTypes[number];
`;

  sourceFile.addStatements(fileContent);

  // reExport=Single builds the root barrel before this file exists, so add it here
  const rootIndex = rootDirectory.getSourceFile('index.ts');
  // Without purgeOutput, the barrel may already re-export the file from a previous run
  const alreadyExported =
    rootIndex?.getExportDeclaration(
      declaration =>
        declaration.getModuleSpecifierValue()?.replace(/\.js$/, '') ===
        './register-all-types',
    ) !== undefined;
  if (
    config.reExport === ReExport.Single &&
    rootIndex !== undefined &&
    !alreadyExported
  ) {
    rootIndex.addExportDeclaration({ moduleSpecifier: './register-all-types.js' });
  }
}
