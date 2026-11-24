import type { EventArguments } from '../types.js';

type LogFunction = (message: string) => void;
const globalConsole: { log: (message?: unknown) => void } = globalThis.console;
const defaultLog: LogFunction = message => {
  globalConsole.log(message);
};

const TS_NOCHECK = '// @ts-nocheck';

/**
 * `esmSuppressTypeErrors`: prepend `// @ts-nocheck` to every generated file.
 * A workaround for deep relations whose truncated file names leave imports
 * that do not type-check.
 */
export function suppressTypeErrors(
  args: Pick<EventArguments, 'config' | 'output' | 'project'>,
  log: LogFunction = defaultLog,
): void {
  const { config, output, project } = args;
  if (!config.esmSuppressTypeErrors) {
    return;
  }

  let count = 0;
  for (const sourceFile of project.getSourceFiles(`${output}/**/*.{ts,js}`)) {
    const text = sourceFile.getFullText();
    if (!text.startsWith(TS_NOCHECK)) {
      sourceFile.replaceWithText(`${TS_NOCHECK}\n${text}`);
      count++;
    }
  }

  if (count > 0) {
    log(`nestjs-prisma-graphql: added ${TS_NOCHECK} to ${String(count)} files`);
  }
}
