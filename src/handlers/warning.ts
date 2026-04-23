// Type-safe console.log wrapper
type LogFunction = (msg: string) => void;
type ConsoleLogFunction = (message?: unknown, ...optionalParams: unknown[]) => void;
const consoleLog: ConsoleLogFunction = console.log as ConsoleLogFunction;
const log: LogFunction = (msg: string): void => {
   
  consoleLog(msg);
};

export function warning(message: string | string[]): void {
  if (Array.isArray(message)) {
    log('nestjs-prisma-graphql:');
    log(message.join('\n'));
  } else {
    log(`nestjs-prisma-graphql: ${message}`);
  }
}
