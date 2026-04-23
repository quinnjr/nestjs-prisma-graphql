import { Project, QuoteKind, type SourceFile } from 'ts-morph';

export function createTestProject(): Project {
  return new Project({
    manipulationSettings: {
      quoteKind: QuoteKind.Single,
    },
    skipAddingFilesFromTsConfig: true,
    skipLoadingLibFiles: true,
  });
}

export function createTestSourceFile(
  project: Project,
  content: string,
  fileName = 'test.ts',
): SourceFile {
  return project.createSourceFile(fileName, content, { overwrite: true });
}
