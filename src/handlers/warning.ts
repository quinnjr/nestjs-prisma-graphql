export function warning(message: string | string[]): void {
  if (Array.isArray(message)) {
    // eslint-disable-next-line no-console
    console.log('nestjs-prisma-graphql:');
    // eslint-disable-next-line no-console
    console.log(message.join('\n'));
  } else {
    // eslint-disable-next-line no-console
    console.log('nestjs-prisma-graphql:', message);
  }
}
