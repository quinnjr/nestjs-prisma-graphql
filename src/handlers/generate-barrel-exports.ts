/* eslint-disable no-console, @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unsafe-enum-comparison */
import type { EventArguments } from '../types.js';

/**
 * Creates barrel exports (index.ts files) for the generated GraphQL types.
 *
 * When reExport="None", the generator doesn't create any barrel exports.
 * This function creates them post-generation, avoiding the stack overflow
 * that occurs when ts-morph tries to resolve .js extensions during generation
 * with reExport="Directories".
 *
 * This is only needed when esmCompatible=true and reExport="None".
 */
export function generateBarrelExports(args: EventArguments): void {
  const { config, output, project } = args;

  // Only generate barrels when ESM compatible and no automatic re-export
  if (!config.esmCompatible || config.reExport !== 'None') {
    return;
  }

  const rootDirectory = project.getDirectory(output);
  if (!rootDirectory) {
    console.warn(
      'nestjs-prisma-graphql: output directory not found, skipping barrel generation',
    );
    return;
  }

  const _extension = config.outputFilePattern?.includes('.js') ? '.js' : '.ts'; // eslint-disable-line @typescript-eslint/no-unnecessary-condition
  const subdirs = rootDirectory.getDirectories();
  let barrelCount = 0;

  console.log(
    `nestjs-prisma-graphql: found ${subdirs.length} subdirectories for barrel generation`,
  );

  // Create index file in each subdirectory
  for (const dir of subdirs) {
    const dirName = dir.getBaseName();

    // Skip special directories
    if (dirName === 'type-registry' || dirName.startsWith('.')) {
      continue;
    }

    const files = dir.getSourceFiles();
    console.log(`nestjs-prisma-graphql: ${dirName} has ${files.length} source files`);
    const exports: string[] = [];

    for (const file of files) {
      const fileName = file.getBaseName();

      // Skip index files themselves
      if (fileName === 'index.ts' || fileName === 'index.js') {
        continue;
      }

      // Replace extension with .js for ESM
      const fileNameWithJsExt = fileName.replace(/\.ts$/, '.js');

      // Add export statement
      exports.push(`export * from './${fileNameWithJsExt}';`);
    }

    if (exports.length > 0) {
      exports.sort();
      dir.createSourceFile(`index.ts`, `${exports.join('\n')}\n`, { overwrite: true });
      barrelCount++;
    }
  }

  // Create root index file
  const rootExports: string[] = [];
  for (const dir of subdirs) {
    const dirName = dir.getBaseName();

    if (dirName.startsWith('.')) {
      continue;
    }

    rootExports.push(`export * from './${dirName}/index.js';`);
  }

  if (rootExports.length > 0) {
    rootExports.sort();
    rootDirectory.createSourceFile('index.ts', `${rootExports.join('\n')}\n`, {
      overwrite: true,
    });
    barrelCount++;
  }

  if (barrelCount > 0) {
    console.log(`nestjs-prisma-graphql: generated ${barrelCount} barrel export files`);
  }
}
