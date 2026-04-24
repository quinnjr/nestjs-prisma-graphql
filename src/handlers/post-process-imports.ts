/* eslint-disable no-console, @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import type { EventArguments } from '../types.js';

/**
 * Post-process generated files to add .js extensions to relative imports
 * and convert type-only imports to regular imports for ESM compatibility.
 *
 * This must run after all files are generated but before they're saved,
 * to avoid the stack overflow that occurs when ts-morph tries to resolve
 * .js extensions during generation with reExport="Directories".
 */
export function postProcessImports(args: EventArguments): void {
  const { config, output, project } = args;

  if (!config.esmCompatible) {
    return;
  }

  // Get all generated source files
  const extension = config.outputFilePattern?.includes('.js') ? '.js' : '.ts';
  const allSourceFiles = project.getSourceFiles(`${output}/**/*${extension}`);

  let modifiedCount = 0;

  for (const sourceFile of allSourceFiles) {
    let modified = false;
    const content = sourceFile.getText();

    // Add .js to relative imports (both regular and type imports)
    const withExtensions = content.replace(
      /from ['"](\.\.[/.][\w\-/]*(?:\/[\w\-]+)?)['"]/g,
      (match: string, importPath: string) => {
        if (importPath && typeof importPath === 'string' && !importPath.endsWith('.js')) {
          modified = true;
          return `from '${importPath}.js'`;
        }
        return match;
      },
    );

    // Convert type-only imports to regular imports
    // This fixes the circular dependency issue where getType() fails
    const withRegularImports = withExtensions.replace(
      /import\s+type\s+(\{[^}]+\})\s+from\s+['"]([^'"]+)['"]/g,
      (_match: string, imports: string, importPath: string) => {
        modified = true;
        return `import ${imports} from '${importPath}'`;
      },
    );

    if (modified) {
      sourceFile.replaceWithText(withRegularImports);
      modifiedCount++;
    }
  }

  if (modifiedCount > 0) {
    console.log(
      `nestjs-prisma-graphql: added .js extensions and converted type imports in ${modifiedCount} files`,
    );
  }
}
