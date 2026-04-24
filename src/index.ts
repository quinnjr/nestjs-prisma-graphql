import type { GeneratorOptions } from '@prisma/generator-helper';

import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arch, platform } from 'node:os';

// Type-safe require wrapper
type RequireFunction = (id: string) => unknown;
type CreateRequireFunction = (filename: string) => RequireFunction;
const createRequireTyped: CreateRequireFunction = createRequire as CreateRequireFunction;
// ESLint doesn't understand import.meta.url type - cast to string explicitly
const requireCjs: RequireFunction = createRequireTyped(String(import.meta.url));

// Patch fs with graceful-fs to handle EMFILE errors during mass file generation.
// This generator can produce 17k+ files; without this patch, constrained environments
// (Docker, CI) hit file descriptor limits and fail silently.
// Use Record<string, unknown> to avoid typeof issues with namespace imports
interface GracefulFs {
  gracefulify: (fs: Record<string, unknown>) => void;
}
const gracefulFsRaw: unknown = requireCjs('graceful-fs');
const gracefulFs: GracefulFs = gracefulFsRaw as GracefulFs;
const nodeFsRaw: unknown = requireCjs('fs');
const nodeFs: Record<string, unknown> = nodeFsRaw as Record<string, unknown>;
gracefulFs.gracefulify(nodeFs);

// Catch process-level errors that would otherwise cause silent failures.
// The Prisma generator-helper communicates via JSON-RPC over stderr; if the
// process crashes before sending a response, Prisma may report success.
type LogFunction = (msg: string) => void;
type ConsoleLogFunction = (message?: unknown, ...optionalParams: unknown[]) => void;
const globalConsole: { log: ConsoleLogFunction } = globalThis.console;
const logError: LogFunction = (msg: string): void => {
  globalConsole.log(msg);
};

// Type-safe process event handlers
type ProcessEventListener = (error: unknown) => void;
interface ProcessWithEvents {
  on: (
    event: 'unhandledRejection' | 'uncaughtException',
    listener: ProcessEventListener,
  ) => unknown;
}
const processTyped = process as ProcessWithEvents;

processTyped.on('unhandledRejection', (reason: unknown) => {
  logError(`nestjs-prisma-graphql: unhandled rejection: ${String(reason)}`);
  if (reason instanceof Error && typeof reason.stack === 'string') {
    logError(reason.stack);
  }
});

processTyped.on('uncaughtException', (error: unknown) => {
  const err = error as Error;
  logError(`nestjs-prisma-graphql: uncaught exception: ${err.message}`);
  if (typeof err.stack === 'string') {
    logError(err.stack);
  }
});

import generatorHelper from '@prisma/generator-helper';

interface GeneratorHelperModule {
  generatorHandler: (config: {
    onGenerate: (options: GeneratorOptions) => Promise<void>;
    onManifest: () => { defaultOutput: string; prettyName: string };
  }) => void;
}
const { generatorHandler } = generatorHelper as GeneratorHelperModule;

import { generate } from './generate.js';

/**
 * Configuration for disabling the generator
 */
export interface GeneratorDisableConfig {
  /** Config options from the generator block in schema.prisma */
  config: Record<string, string | undefined>;
}

/**
 * Environment variables that can disable the generator:
 * - DISABLE_NESTJS_PRISMA_GRAPHQL=true - Disable this specific generator
 * - PRISMA_GENERATOR_SKIP=true - Skip all Prisma generators (common convention)
 * - SKIP_PRISMA_GENERATE=true - Alternative skip flag
 * - CI_SKIP_PRISMA_GRAPHQL=true - CI-specific skip flag
 *
 * Config options (in schema.prisma):
 * - disabled = true - Disable generation
 * - disabled = "true" - Disable generation (string)
 * - disabled = 1 - Disable generation (number as string)
 *
 * @param options - Generator options or minimal config object
 * @param env - Environment variables (defaults to process.env)
 * @returns true if the generator should be disabled
 */
// Helper to get process.env in a type-safe way
// Using Record<string, unknown> to avoid NodeJS.Process type resolution issues
const getProcessEnv = (): Record<string, string | undefined> => {
  const globalProcess: unknown = process;
  interface ProcessLike {
    env: Record<string, string | undefined>;
  }
  const processLike: ProcessLike = globalProcess as ProcessLike;
  return processLike.env;
};

export function isGeneratorDisabled(
  options: GeneratorOptions | { generator: GeneratorDisableConfig },
  env: Record<string, string | undefined> = getProcessEnv(),
): boolean {
  const envVarsToCheck = [
    'DISABLE_NESTJS_PRISMA_GRAPHQL',
    'CI_SKIP_PRISMA_GRAPHQL',
    'PRISMA_GENERATOR_SKIP',
    'SKIP_PRISMA_GENERATE',
  ] as const;

  for (const envVar of envVarsToCheck) {
    const value = env[envVar];
    if (value === 'true' || value === '1') {
      return true;
    }
  }

  const configDisabled = options.generator.config.disabled;
  if (configDisabled === 'true' || configDisabled === '1' || configDisabled === 'yes') {
    return true;
  }

  return false;
}

interface DirEntry {
  name: string;
  isDirectory: () => boolean;
}

function countFilesRecursive(dir: string): number {
  let count = 0;
  // Type-safe wrapper for readdirSync which doesn't have proper types in this context
  type ReadDirSyncFunction = (
    path: string,
    options: { withFileTypes: boolean },
  ) => unknown;
  const readDirSyncTyped: ReadDirSyncFunction = readdirSync as ReadDirSyncFunction;
  const rawEntries: unknown = readDirSyncTyped(dir, { withFileTypes: true });
  const entries: DirEntry[] = rawEntries as DirEntry[];
  for (const entry of entries) {
    const isDir: boolean =
      typeof entry.isDirectory === 'function' ? entry.isDirectory() : false;
    if (isDir) {
      count += countFilesRecursive(`${dir}/${entry.name}`);
    } else {
      count++;
    }
  }
  return count;
}

type LogFunc = (msg: string) => void;
type ConsoleLogFunc = (message?: unknown, ...optionalParams: unknown[]) => void;
const globalConsole2: { log: ConsoleLogFunc } = globalThis.console;
const log: LogFunc = (msg: string): void => {
  globalConsole2.log(msg);
};

generatorHandler({
  async onGenerate(options: GeneratorOptions) {
    if (isGeneratorDisabled(options)) {
      log(
        'nestjs-prisma-graphql: generation skipped (disabled via environment variable or config)',
      );
      return;
    }

    const outputPath = options.generator.output?.value ?? '<unknown>';
    const startTime = Date.now();

    // Type-safe wrappers for node:os functions
    type ArchFunction = () => unknown;
    type PlatformFunction = () => unknown;
    const archTyped: ArchFunction = arch;
    const platformTyped: PlatformFunction = platform;

    const archValue = String(archTyped());
    const platformValue = String(platformTyped());
    const globalProcess2Raw: unknown = process;
    // Use interface to avoid NodeJS.Process type resolution issues
    interface ProcessLikeWithVersion {
      version: string;
    }
    const processWithVersion: ProcessLikeWithVersion =
      globalProcess2Raw as ProcessLikeWithVersion;
    const nodeVersion: string = processWithVersion.version;
    log(
      [
        'nestjs-prisma-graphql: starting generation',
        `(arch=${archValue}, platform=${platformValue}, node=${nodeVersion}, output=${outputPath})`,
      ].join(' '),
    );

    try {
      await generate(options);
    } catch (error: unknown) {
      const elapsed = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      log(
        `nestjs-prisma-graphql: generation FAILED after ${String(elapsed)}ms: ${message}`,
      );
      if (typeof stack === 'string') {
        log(stack);
      }

      throw error;
    }

    const elapsed = Date.now() - startTime;

    // Type-safe wrapper for existsSync
    type ExistsSyncFunc = (path: string) => boolean;
    const existsSyncTyped: ExistsSyncFunc = existsSync;
    const pathExists: boolean =
      typeof outputPath === 'string' &&
      outputPath !== '<unknown>' &&
      existsSyncTyped(outputPath);
    if (pathExists) {
      const fileCount: number = countFilesRecursive(outputPath);
      log(
        `nestjs-prisma-graphql: generated ${String(fileCount)} files in ${String(elapsed)}ms`,
      );

      if (fileCount === 0) {
        const msg =
          'nestjs-prisma-graphql: generation produced 0 files — this likely indicates a silent failure';
        log(msg);
        throw new Error(msg);
      }
    } else {
      const msg = `nestjs-prisma-graphql: output directory not found after generation: ${outputPath}`;
      log(msg);
      throw new Error(msg);
    }
  },
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'NestJS Prisma GraphQL (ESM)',
    };
  },
});
