// Type-safe console.log wrapper
type LogFunction = (msg: string) => void;
type ConsoleLogFunction = (message?: unknown, ...optionalParams: unknown[]) => void;
const globalConsole: { log: ConsoleLogFunction } = globalThis.console;
const log: LogFunction = (msg: string): void => {
  globalConsole.log(msg);
};

export function warning(message: string | string[]): void {
  if (Array.isArray(message)) {
    log('nestjs-prisma-graphql:');
    log(message.join('\n'));
  } else {
    log(`nestjs-prisma-graphql: ${message}`);
  }
}
