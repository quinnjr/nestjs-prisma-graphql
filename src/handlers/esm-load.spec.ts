import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bin = (name: string): string => path.join(repoRoot, 'node_modules/.bin', name);
const CLIENT_SPECIFIER = 'test-prisma-client';

function exec(cwd: string, file: string, args: string[]): string {
  try {
    return execFileSync(file, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    const { stderr, stdout } = error as { stdout?: string; stderr?: string };
    throw new Error(`${path.basename(file)} failed:\n${stdout ?? ''}${stderr ?? ''}`, {
      cause: error,
    });
  }
}

function writeProject(directory: string, generatorOptions: string): void {
  symlinkSync(path.join(repoRoot, 'node_modules'), path.join(directory, 'node_modules'));
  writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}');
  // Models named like generated helpers guard against name clashes
  writeFileSync(
    path.join(directory, 'schema.prisma'),
    `datasource db {
  provider = "postgresql"
}

generator client {
  provider     = "prisma-client"
  output       = "./client"
  moduleFormat = "esm"
}

generator nestgraphql {
  provider           = "${bin('tsx')} ${path.join(repoRoot, 'src/index.ts')}"
  output             = "./generated"
  esmCompatible      = true
  prismaClientImport = "${CLIENT_SPECIFIER}"
${generatorOptions}
}

enum Level {
  /// @EnumValue(1)
  LOW
  /// @EnumValue(2)
  HIGH
}

model Thing {
  id     Int     @id
  level  Level?
  amount Decimal?
  posts  Lazy[]
}

model Lazy {
  id      Int   @id
  thingId Int
  thing   Thing @relation(fields: [thingId], references: [id])
}

model TypeRegistry {
  id    Int    @id
  label String
}

model RegisterAllTypes {
  id    Int    @id
  label String
}
`,
  );
  writeFileSync(
    path.join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
        module: 'nodenext',
        moduleResolution: 'nodenext',
        outDir: 'out',
        paths: { [CLIENT_SPECIFIER]: ['./client/client.ts'] },
        rootDir: '.',
        skipLibCheck: true,
        strict: true,
        target: 'es2022',
        types: [],
      },
      include: ['generated/**/*.ts'],
    }),
  );

  // Runtime resolution for the bare client specifier used by generated files
  const shim = path.join(directory, 'out/node_modules', CLIENT_SPECIFIER);
  mkdirSync(shim, { recursive: true });
  writeFileSync(
    path.join(shim, 'package.json'),
    JSON.stringify({ main: 'index.js', name: CLIENT_SPECIFIER, type: 'module' }),
  );
  writeFileSync(path.join(shim, 'index.js'), "export * from '../../client/client.js';\n");
}

/**
 * Generates esmCompatible output for a schema with relation/input cycles,
 * compiles it like a NestJS app (strict + emitDecoratorMetadata) and loads it.
 */
describe.each([
  { entry: 'register-all-types.js', mode: 'multiple files', options: '' },
  { entry: 'index.js', mode: 'emitSingle', options: '  emitSingle = true' },
  {
    entry: 'index.js',
    mode: 'emitSingle with {model}/{name}.ts',
    options: '  emitSingle = true\n  outputFilePattern = "{model}/{name}.ts"',
  },
  {
    entry: 'register-all-types.js',
    mode: 'multiple files with {model}/{name}.ts',
    options: '  outputFilePattern = "{model}/{name}.ts"',
  },
  {
    // The schema has Int but no Float fields: FloatFilter only exists as NestedFloatFilter
    entry: 'register-all-types.js',
    mode: 'combineScalarFilters and noAtomicOperations',
    options: '  combineScalarFilters = true\n  noAtomicOperations = true',
  },
  {
    entry: 'register-all-types.js',
    mode: 'reExport = Single',
    options: '  reExport = Single',
  },
])('esmCompatible output, $mode (compile and load)', ({ entry, options }) => {
  let directory: string;
  let compileError: unknown;

  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'npg-esm-'));
    writeProject(directory, options);
    exec(directory, bin('prisma'), ['generate', '--schema', 'schema.prisma']);
    try {
      exec(directory, bin('tsc'), ['-p', 'tsconfig.json']);
    } catch (error) {
      // tsc still emits on type errors; report them in their own test
      compileError = error;
    }
  }, 180_000);

  afterAll(() => {
    rmSync(directory, { force: true, recursive: true });
  });

  it('compiles under strict mode', () => {
    expect(compileError).toBeUndefined();
  });

  it('loads without TDZ errors from decorator metadata in import cycles', () => {
    writeFileSync(
      path.join(directory, 'load.mjs'),
      `import 'reflect-metadata';\nawait import('./out/generated/${entry}');\nconsole.log('loaded');\n`,
    );

    expect(exec(directory, process.execPath, ['load.mjs'])).toContain('loaded');
  }, 60_000);
});
