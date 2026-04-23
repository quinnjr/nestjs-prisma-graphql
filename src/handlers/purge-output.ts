import type { EventArguments, EventEmitter } from '../types.js';

import { rmdirSync as rmdirSyncOriginal } from 'node:fs';

// Type-safe wrapper for rmdirSync
type RmdirFunction = (path: string) => void;
const rmdirTyped: RmdirFunction = rmdirSyncOriginal as RmdirFunction;
const rmdirSync: RmdirFunction = (path: string): void => {
  rmdirTyped(path);
};

export function purgeOutput(emitter: EventEmitter): void {
  emitter.on('Begin', begin);
  emitter.on('End', end);
}

function begin({ output, project }: EventArguments): void {
  const sourceFiles = project.getDirectory(output)?.getDescendantSourceFiles();

  if (sourceFiles) {
    for (const sourceFile of sourceFiles) {
      sourceFile.delete();
    }
  }
}

function end({ output, project }: EventArguments): void {
  const directories = project
    .getDirectory(output)
    ?.getDescendantDirectories()
    .filter(directory => directory.getSourceFiles().length === 0)
    .map(directory => directory.getPath());

  const directoryList: string[] = directories ?? [];
  for (const directory of directoryList) {
    try {
      rmdirSync(directory);
    } catch {
      // Ignore errors
    }
  }
}
