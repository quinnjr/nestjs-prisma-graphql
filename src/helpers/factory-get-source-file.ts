import type { EventEmitter, GeneratorConfiguration } from '../types.js';
import type { Project, SourceFile } from 'ts-morph';

import { ReExport } from '../handlers/re-export.js';
import { generateFileName } from './generate-file-name.js';

/**
 * Root-level files the generator itself writes for the given options; a
 * generated type must not overwrite them.
 */
export function getReservedRootFiles(
  config: Pick<GeneratorConfiguration, 'emitSingle' | 'esmCompatible' | 'reExport'>,
): ReadonlySet<string> {
  const reserved = new Set(['decimal-helpers.ts']);
  if (config.esmCompatible) {
    reserved.add('type-registry.ts');
    reserved.add('register-all-types.ts');
  }
  if (
    config.emitSingle ||
    config.reExport === ReExport.Single ||
    config.reExport === ReExport.All ||
    (config.esmCompatible && config.reExport === ReExport.None)
  ) {
    reserved.add('index.ts');
  }

  return reserved;
}

export function factoryGetSourceFile(args: {
  output: string;
  outputFilePattern: string;
  project: Project;
  getModelName: (name: string) => string | undefined;
  eventEmitter: EventEmitter;
  reservedRootFiles?: ReadonlySet<string>;
}) {
  const { getModelName, output, outputFilePattern, project, reservedRootFiles } = args;

  return function getSourceFile(getSourceFileArgs: {
    type: string;
    name: string;
  }): SourceFile {
    const { name, type } = getSourceFileArgs;
    let filePath = generateFileName({
      getModelName,
      name,
      template: outputFilePattern,
      type,
    });
    if (reservedRootFiles?.has(filePath.replace(/\.js$/, '.ts')) === true) {
      throw new Error(
        `nestjs-prisma-graphql: outputFilePattern places "${name}" at "${filePath}", which is reserved for a generated helper file. Add {type} or {model} to outputFilePattern.`,
      );
    }
    filePath = `${output}/${filePath}`;

    return (
      project.getSourceFile(filePath) ??
      project.createSourceFile(filePath, undefined, { overwrite: true })
    );
  };
}
