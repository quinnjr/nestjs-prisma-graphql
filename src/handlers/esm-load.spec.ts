import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bin = (name: string): string => path.join(repoRoot, 'node_modules/.bin', name);
const CLIENT_SPECIFIER = 'test-prisma-client';
const REGISTRY_TRACES = /type-registry|register-all-types|registerType\(|getType\(/;

interface EsbuildApi {
  buildSync: (options: Record<string, unknown>) => unknown;
}
// esbuild is installed as a dependency of tsx; adding it directly rewrites the lockfile
const esbuild = createRequire(createRequire(import.meta.url).resolve('tsx/package.json'))(
  'esbuild',
) as EsbuildApi;

interface ProjectOptions {
  /** Extra generator options, one per line */
  generatorOptions?: string;
  /** `module` (ESM output) or `commonjs` */
  moduleType?: 'module' | 'commonjs';
  esmCompatible?: boolean;
  /** Where app.ts imports the generated classes from */
  imports?: 'directories' | 'root';
  withDecimal?: boolean;
  /** Files written into the output directory before generating (path -> content) */
  seedFiles?: Record<string, string>;
  /** Replaces the default models (User, Post, Lazy) */
  models?: string;
}

interface BuiltProject {
  directory: string;
  compileError: unknown;
}

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

function listFiles(directory: string, extension: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(extension))
    .map(entry => path.join(entry.parentPath, entry.name));
}

/**
 * Generates output for a schema full of import cycles (User <-> Post, a User
 * self-relation, and a model named `Lazy` to guard the `__Lazy` alias), plus an
 * app.ts with a resolver, and compiles both like a NestJS app.
 */
function buildProject(options: ProjectOptions): BuiltProject {
  const {
    esmCompatible = true,
    generatorOptions = '',
    imports = 'directories',
    models,
    moduleType = 'module',
    seedFiles = {},
    withDecimal = false,
  } = options;
  const defaultModels = `model User {
  id        Int      @id
  level     Level?
${withDecimal ? '  amount    Decimal?\n' : ''}  posts     Post[]
  lazies    Lazy[]
  manager   User?    @relation("manager", fields: [managerId], references: [id])
  managerId Int?
  reports   User[]   @relation("manager")
}

model Post {
  id       Int     @id
  authorId Int
  author   User    @relation(fields: [authorId], references: [id])
  /// @Directive('@deprecated(reason: "Use title instead")')
  legacy   String?
}

model Lazy {
  id     Int  @id
  userId Int
  user   User @relation(fields: [userId], references: [id])
}
`;
  const directory = mkdtempSync(path.join(tmpdir(), 'npg-esm-'));
  const isEsm = moduleType === 'module';

  symlinkSync(path.join(repoRoot, 'node_modules'), path.join(directory, 'node_modules'));
  writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ type: moduleType }),
  );
  writeFileSync(
    path.join(directory, 'schema.prisma'),
    `datasource db {
  provider = "postgresql"
}

generator client {
  provider     = "prisma-client"
  output       = "./client"
  moduleFormat = "${isEsm ? 'esm' : 'cjs'}"
}

generator nestgraphql {
  provider           = "${bin('tsx')} ${path.join(repoRoot, 'src/index.ts')}"
  output             = "./generated"
  esmCompatible      = ${String(esmCompatible)}
  prismaClientImport = "${CLIENT_SPECIFIER}"
${generatorOptions}
}

enum Level {
  /// @EnumValue(1)
  LOW
  /// @EnumValue(2)
  HIGH
}

${models ?? defaultModels}`,
  );

  const from = (model: string): string =>
    imports === 'root' ? './generated/index.js' : `./generated/${model}/index.js`;
  writeFileSync(
    path.join(directory, 'app.ts'),
    `import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import {
  Args,
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { lexicographicSortSchema, printSchema } from 'graphql';
import { FindManyUserArgs, User } from '${from('user')}';
import { CreateOnePostArgs, Post } from '${from('post')}';
// NestJS adds every loaded @ObjectType to the schema, so load all of them in each layout
import '${from('lazy')}';
import '${from('prisma')}';

@Resolver(() => User)
class UserResolver {
  @Query(() => [User])
  users(@Args() _args: FindManyUserArgs): User[] {
    return [];
  }

  @Mutation(() => Post)
  createPost(@Args() _args: CreateOnePostArgs): Post {
    return {} as Post;
  }
}

async function main(): Promise<void> {
  const app = await NestFactory.create(GraphQLSchemaBuilderModule, { logger: false });
  await app.init();
  const schema = await app.get(GraphQLSchemaFactory).create([UserResolver]);
  writeFileSync(process.argv[2] ?? 'schema.graphql', printSchema(lexicographicSortSchema(schema)));
  await app.close();
}

void main();
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
        // Generated files must not declare an unused __Lazy alias
        noUnusedLocals: true,
        outDir: 'out',
        paths: { [CLIENT_SPECIFIER]: ['./client/client.ts'] },
        rootDir: '.',
        skipLibCheck: true,
        strict: true,
        target: 'es2022',
        types: [],
      },
      include: ['generated/**/*.ts', 'app.ts'],
    }),
  );

  // Runtime resolution for the bare client specifier used by generated files
  const shim = path.join(directory, 'out/node_modules', CLIENT_SPECIFIER);
  mkdirSync(shim, { recursive: true });
  writeFileSync(
    path.join(shim, 'package.json'),
    JSON.stringify({ main: 'index.js', name: CLIENT_SPECIFIER, type: moduleType }),
  );
  writeFileSync(
    path.join(shim, 'index.js'),
    isEsm
      ? "export * from '../../client/client.js';\n"
      : "module.exports = require('../../client/client.js');\n",
  );

  for (const [relativePath, content] of Object.entries(seedFiles)) {
    const seedPath = path.join(directory, 'generated', relativePath);
    mkdirSync(path.dirname(seedPath), { recursive: true });
    writeFileSync(seedPath, content);
  }

  exec(directory, bin('prisma'), ['generate', '--schema', 'schema.prisma']);

  let compileError: unknown;
  try {
    exec(directory, bin('tsc'), ['-p', 'tsconfig.json']);
  } catch (error) {
    // tsc still emits on type errors; report them in their own test
    compileError = error;
  }

  return { compileError, directory };
}

/** Runs the compiled app, which builds the GraphQL schema, and returns its SDL. */
function buildSdl(directory: string, entry = 'out/app.js'): string {
  const sdlPath = path.join(directory, `${path.basename(entry)}.graphql`);
  exec(directory, process.execPath, [entry, sdlPath]);

  return readFileSync(sdlPath, 'utf8');
}

const projects = new Map<string, BuiltProject>();

function project(name: string, options: ProjectOptions): BuiltProject {
  const built = buildProject(options);
  projects.set(name, built);

  return built;
}

afterAll(() => {
  for (const { directory } of projects.values()) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('esmCompatible output has no type registry', () => {
  let built: BuiltProject;
  let sdl: string;

  beforeAll(() => {
    built = project('default', { withDecimal: true });
    sdl = buildSdl(built.directory);
  }, 240_000);

  it('compiles under strict mode with emitDecoratorMetadata', () => {
    expect(built.compileError).toBeUndefined();
  });

  it('generates no registry files, registerType() or getType() calls', () => {
    const generated = path.join(built.directory, 'generated');
    const files = listFiles(generated, '.ts');
    const offenders = files.filter(
      file =>
        REGISTRY_TRACES.test(file) || REGISTRY_TRACES.test(readFileSync(file, 'utf8')),
    );

    expect(files.length).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });

  it('builds a GraphQL schema with the cyclic relations resolved', () => {
    expect(sdl).toMatch(/type Post \{[^}]*author: User!/);
    expect(sdl).toMatch(/type User \{[^}]*posts: \[Post!\]/);
    expect(sdl).toMatch(/type User \{[^}]*manager: User\b/);
    expect(sdl).toMatch(/input PostListRelationFilter \{[^}]*every: PostWhereInput/);
  });

  it('emits a /// @Directive given as a plain string with its argument', () => {
    // printSchema does not print applied directives, so check the generated source;
    // the compile and load tests above prove the decorator call is valid
    const model = readFileSync(
      path.join(built.directory, 'generated/post/post.model.ts'),
      'utf8',
    );

    expect(model).toContain(`@Directive('@deprecated(reason: "Use title instead")')`);
  });

  it('loads every generated file as the first import, in its own process', () => {
    const files = listFiles(path.join(built.directory, 'out/generated'), '.js');
    writeFileSync(
      path.join(built.directory, 'load-each.mjs'),
      `import { spawn } from 'node:child_process';
const files = ${JSON.stringify(files)};
const failures = [];
let next = 0;
const worker = async () => {
  while (next < files.length) {
    const file = files[next++];
    await new Promise(resolve => {
      const child = spawn(process.execPath, ['--input-type=module', '-e',
        "import 'reflect-metadata'; await import(" + JSON.stringify('file://' + file) + ");"],
        { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.on('close', code => {
        if (code !== 0) { failures.push(file + ': ' + stderr.split('\\n').find(l => /Error/.test(l))); }
        resolve();
      });
    });
  }
};
await Promise.all(Array.from({ length: 8 }, worker));
console.log(JSON.stringify(failures));
`,
    );

    const failures = JSON.parse(
      exec(built.directory, process.execPath, ['load-each.mjs']),
    ) as string[];

    expect(files.length).toBeGreaterThan(50);
    expect(failures).toEqual([]);
  }, 240_000);

  it.each([
    { minify: false, name: 'bundled' },
    { minify: true, name: 'bundled and minified' },
  ])(
    'produces the same schema when $name with esbuild',
    ({ minify }) => {
      const outfile = path.join(built.directory, `out/bundle-${String(minify)}.mjs`);
      esbuild.buildSync({
        absWorkingDir: built.directory,
        bundle: true,
        entryPoints: ['out/app.js'],
        format: 'esm',
        logLevel: 'silent',
        minify,
        outfile,
        // Only the generated code is bundled; packages resolve from node_modules
        packages: 'external',
        platform: 'node',
      });

      expect(buildSdl(built.directory, path.relative(built.directory, outfile))).toBe(
        sdl,
      );
    },
    120_000,
  );

  describe.each([
    {
      name: 'emitSingle',
      options: { generatorOptions: '  emitSingle = true', imports: 'root' },
    },
    {
      name: 'emitSingle with {model}/{name}.ts',
      options: {
        generatorOptions:
          '  emitSingle = true\n  outputFilePattern = "{model}/{name}.ts"',
        imports: 'root',
      },
    },
    {
      name: 'multiple files with {model}/{name}.ts',
      options: { generatorOptions: '  outputFilePattern = "{model}/{name}.ts"' },
    },
    {
      name: 'reExport = Single',
      options: { generatorOptions: '  reExport = Single', imports: 'root' },
    },
    {
      name: 'reExport = Directories',
      options: { generatorOptions: '  reExport = Directories' },
    },
    {
      name: 'reExport = All',
      options: { generatorOptions: '  reExport = All', imports: 'root' },
    },
    {
      // Model directories that only contain sub-directories get namespace barrels
      name: 'reExport = Directories with nested {plural.type} directories',
      options: {
        generatorOptions:
          '  reExport = Directories\n  outputFilePattern = "{model}/{plural.type}/{name}.{type}.ts"',
      },
    },
  ] as Array<{ name: string; options: ProjectOptions }>)(
    'layout: $name',
    ({ name, options }) => {
      let layout: BuiltProject;

      beforeAll(() => {
        layout = project(name, { ...options, withDecimal: true });
      }, 240_000);

      it('compiles, has no registry, and builds the same schema as the default layout', () => {
        const offenders = listFiles(
          path.join(layout.directory, 'generated'),
          '.ts',
        ).filter(
          file =>
            REGISTRY_TRACES.test(file) ||
            REGISTRY_TRACES.test(readFileSync(file, 'utf8')),
        );

        expect(layout.compileError).toBeUndefined();
        expect(offenders).toEqual([]);
        expect(buildSdl(layout.directory)).toBe(sdl);
      }, 120_000);
    },
  );
});

describe('esmCompatible with combineScalarFilters and noAtomicOperations', () => {
  let built: BuiltProject;

  beforeAll(() => {
    // The schema has Int but no Float fields: FloatFilter only exists as NestedFloatFilter
    built = project('combine', {
      generatorOptions: '  combineScalarFilters = true\n  noAtomicOperations = true',
    });
  }, 240_000);

  it('compiles and builds a schema', () => {
    expect(built.compileError).toBeUndefined();
    expect(buildSdl(built.directory)).toMatch(/type Post \{[^}]*author: User!/);
  }, 120_000);
});

describe('upgrading a 1.x output directory without purgeOutput', () => {
  let built: BuiltProject;

  beforeAll(() => {
    built = project('upgrade', {
      seedFiles: {
        // A model that no longer exists in the schema
        'gone/gone.model.ts': `import { Field, ObjectType } from '@nestjs/graphql';
import { registerType } from '../type-registry.js';
import { getType } from '../type-registry.js';

@ObjectType()
export class Gone {
  @Field(() => getType('User'))
  user?: unknown;
}

registerType('Gone', Gone);
`,
        'register-all-types.ts': `import { markRegistrationComplete } from './type-registry.js';
import './gone/gone.model.js';
markRegistrationComplete();
`,
        'type-registry.ts': `const registry = new Map<string, unknown>();
export function registerType(name: string, type: unknown): void { registry.set(name, type); }
export function getType<T = any>(name: string): T { return registry.get(name) as T; }
export function markRegistrationComplete(): void {}
`,
      },
    });
  }, 240_000);

  it('removes the registry and the orphaned 1.x file, then compiles and loads', () => {
    const files = listFiles(path.join(built.directory, 'generated'), '.ts');

    expect(
      files.filter(file => /gone|type-registry|register-all-types/.test(file)),
    ).toEqual([]);
    expect(built.compileError).toBeUndefined();
    expect(buildSdl(built.directory)).toMatch(/type Post \{[^}]*author: User!/);
  }, 120_000);
});

describe('emitSingle with only non-list relations', () => {
  it('does not declare an unused __Lazy alias', () => {
    // emitSingle rewrites non-list object types to InstanceType<typeof X>
    const built = project('single one-to-one', {
      generatorOptions: '  emitSingle = true\n  emitBlocks = ["models"]',
      imports: 'root',
      models: `model User {
  id      Int      @id
  profile Profile?
}

model Profile {
  id     Int  @id
  userId Int  @unique
  user   User @relation(fields: [userId], references: [id])
}
`,
    });
    const index = readFileSync(path.join(built.directory, 'generated/index.ts'), 'utf8');

    expect(index).not.toContain('__Lazy');
    expect(index).toContain('class Profile');
  }, 240_000);
});

describe('esmSuppressTypeErrors', () => {
  it.each([
    { name: 'multiple files', options: '' },
    { name: 'emitSingle', options: '\n  emitSingle = true' },
  ])(
    'adds // @ts-nocheck to every generated file with $name',
    ({ name, options }) => {
      const built = project(`nocheck ${name}`, {
        generatorOptions: `  esmSuppressTypeErrors = true${options}`,
        imports: options === '' ? 'directories' : 'root',
      });
      const files = listFiles(path.join(built.directory, 'generated'), '.ts');
      const unchecked = files.filter(
        file => !readFileSync(file, 'utf8').startsWith('// @ts-nocheck'),
      );

      expect(files.length).toBeGreaterThan(0);
      expect(unchecked).toEqual([]);
    },
    240_000,
  );
});

describe('non-ESM output compiled as CommonJS', () => {
  let built: BuiltProject;

  beforeAll(() => {
    built = project('commonjs', {
      esmCompatible: false,
      generatorOptions: '  reExport = Directories',
      moduleType: 'commonjs',
    });
  }, 240_000);

  it('compiles, loads and builds a schema with the cyclic relations resolved', () => {
    const sdl = buildSdl(built.directory);

    expect(built.compileError).toBeUndefined();
    expect(sdl).toMatch(/type Post \{[^}]*author: User!/);
    expect(sdl).toMatch(/type User \{[^}]*posts: \[Post!\]/);
  }, 120_000);

  it('matches the schema of the same models generated in ESM mode', () => {
    const esm = project('esm-twin', {});

    expect(esm.compileError).toBeUndefined();
    expect(buildSdl(built.directory)).toBe(buildSdl(esm.directory));
  }, 240_000);
});
