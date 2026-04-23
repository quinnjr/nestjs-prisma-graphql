/* eslint-disable no-console */
import type { GeneratorOptions } from '@prisma/generator-helper';
import type * as NodeFs from 'node:fs';

import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arch, platform } from 'node:os';

// Type-safe require wrapper
type RequireFunction = (id: string) => unknown;
type CreateRequireFunction = (filename: string) => RequireFunction;
const createRequireTyped: CreateRequireFunction = createRequire as CreateRequireFunction;
const requireCjs = createRequireTyped(import.meta.url);

// Patch fs with graceful-fs to handle EMFILE errors during mass file generation.
// This generator can produce 17k+ files; without this patch, constrained environments
// (Docker, CI) hit file descriptor limits and fail silently.
interface GracefulFs {
  gracefulify: (fs: typeof NodeFs) => void;
}
const gracefulFs: GracefulFs = requireCjs('graceful-fs') as GracefulFs;
const nodeFs: typeof NodeFs = requireCjs('fs') as typeof NodeFs;
gracefulFs.gracefulify(nodeFs);

// Catch process-level errors that would otherwise cause silent failures.
// The Prisma generator-helper communicates via JSON-RPC over stderr; if the
// process crashes before sending a response, Prisma may report success.
type LogFunction = (msg: string) => void;
type ConsoleLogFunction = (message?: unknown, ...optionalParams: unknown[]) => void;
const consoleLog: ConsoleLogFunction = console.log as ConsoleLogFunction;
const logError: LogFunction = (msg: string): void => {
   
  consoleLog(msg);
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
export function isGeneratorDisabled(
  options: GeneratorOptions | { generator: GeneratorDisableConfig },
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
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
  const entries = readdirSync(dir, { withFileTypes: true }) as unknown as DirEntry[];
  for (const entry of entries) {
    const isDir: boolean = typeof entry.isDirectory === 'function' ? entry.isDirectory() : false;
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
const consoleLogFunc: ConsoleLogFunc = console.log as ConsoleLogFunc;
const log: LogFunc = (msg: string): void => {
   
  consoleLogFunc(msg);
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

    const archValue = String(arch());
    const platformValue = String(platform());
    const nodeVersion = String(process.version);
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

      log(`nestjs-prisma-graphql: generation FAILED after ${String(elapsed)}ms: ${message}`);
      if (typeof stack === 'string') {
        log(stack);
      }

      throw error;
    }

    const elapsed = Date.now() - startTime;

    if (
      typeof outputPath === 'string' &&
      outputPath !== '<unknown>' &&
      existsSync(outputPath)
    ) {
      const fileCount = countFilesRecursive(outputPath);
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
