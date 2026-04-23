import type { EventEmitter } from '../types.js';
import type { Project, SourceFile } from 'ts-morph';

import { generateFileName } from './generate-file-name.js';

export function factoryGetSourceFile(args: {
  output: string;
  outputFilePattern: string;
  project: Project;
  getModelName: (name: string) => string | undefined;
  eventEmitter: EventEmitter;
}) {
  const { getModelName, output, outputFilePattern, project } = args;

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
    filePath = `${output}/${filePath}`;

    return (
      project.getSourceFile(filePath) ??
      project.createSourceFile(filePath, undefined, { overwrite: true })
    );
  };
}
