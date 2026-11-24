import type { GeneratorConfiguration } from '../types.js';

import { describe, expect, it } from 'vitest';

import { createTestProject } from '../test/test-utils.js';
import { suppressTypeErrors } from './suppress-type-errors.js';

function setup(esmSuppressTypeErrors: boolean) {
  const project = createTestProject();
  project.createSourceFile('/out/user/user.model.ts', 'export class User {}\n');
  project.createSourceFile('/out/index.ts', '// @ts-nocheck\nexport {};\n');
  const logs: string[] = [];
  const config: Partial<GeneratorConfiguration> = { esmSuppressTypeErrors };
  suppressTypeErrors(
    { config: config as GeneratorConfiguration, output: '/out', project },
    message => {
      logs.push(message);
    },
  );

  return { logs, project };
}

describe('suppressTypeErrors', () => {
  it('prepends // @ts-nocheck to generated files when enabled', () => {
    const { logs, project } = setup(true);

    expect(project.getSourceFileOrThrow('/out/user/user.model.ts').getFullText()).toBe(
      '// @ts-nocheck\nexport class User {}\n',
    );
    expect(logs).toEqual(['nestjs-prisma-graphql: added // @ts-nocheck to 1 files']);
  });

  it('does not add the directive twice', () => {
    const { project } = setup(true);

    expect(project.getSourceFileOrThrow('/out/index.ts').getFullText()).toBe(
      '// @ts-nocheck\nexport {};\n',
    );
  });

  it('does nothing when disabled', () => {
    const { logs, project } = setup(false);

    expect(project.getSourceFileOrThrow('/out/user/user.model.ts').getFullText()).toBe(
      'export class User {}\n',
    );
    expect(logs).toEqual([]);
  });
});
