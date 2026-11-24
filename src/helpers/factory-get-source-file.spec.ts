import { describe, expect, it } from 'vitest';

import { ReExport } from '../handlers/re-export.js';
import { createTestProject } from '../test/test-utils.js';
import { factoryGetSourceFile, getReservedRootFiles } from './factory-get-source-file.js';

const esmConfig = { emitSingle: false, esmCompatible: true, reExport: ReExport.None };
const cjsConfig = { emitSingle: false, esmCompatible: false, reExport: ReExport.None };

function createGetSourceFile(
  outputFilePattern: string,
  reservedRootFiles = getReservedRootFiles(esmConfig),
) {
  return factoryGetSourceFile({
    eventEmitter: undefined as never,
    getModelName: () => undefined,
    output: '/out',
    outputFilePattern,
    project: createTestProject(),
    reservedRootFiles,
  });
}

describe('getReservedRootFiles', () => {
  it('reserves the ESM helpers and root barrel in esmCompatible mode', () => {
    expect([...getReservedRootFiles(esmConfig)].sort()).toEqual([
      'decimal-helpers.ts',
      'index.ts',
      'register-all-types.ts',
      'type-registry.ts',
    ]);
  });

  it('reserves only files that are generated without esmCompatible', () => {
    expect([...getReservedRootFiles(cjsConfig)]).toEqual(['decimal-helpers.ts']);
    expect(
      [...getReservedRootFiles({ ...cjsConfig, reExport: ReExport.Single })].sort(),
    ).toEqual(['decimal-helpers.ts', 'index.ts']);
    expect([...getReservedRootFiles({ ...cjsConfig, emitSingle: true })].sort()).toEqual([
      'decimal-helpers.ts',
      'index.ts',
    ]);
  });
});

describe('factoryGetSourceFile', () => {
  it('creates files at the pattern path', () => {
    const getSourceFile = createGetSourceFile('{model}/{name}.{type}.ts');

    expect(getSourceFile({ name: 'UserCreateInput', type: 'input' }).getFilePath()).toBe(
      '/out/prisma/user-create.input.ts',
    );
  });

  it('allows helper names outside the output root', () => {
    const getSourceFile = createGetSourceFile('{model}/{name}.ts');

    expect(getSourceFile({ name: 'TypeRegistry', type: 'model' }).getFilePath()).toBe(
      '/out/prisma/type-registry.ts',
    );
  });

  it.each(['TypeRegistry', 'RegisterAllTypes', 'DecimalHelpers', 'Index'])(
    'rejects %s overwriting a generated root helper file',
    name => {
      const getSourceFile = createGetSourceFile('{name}.ts');

      expect(() => getSourceFile({ name, type: 'model' })).toThrow(/reserved/);
    },
  );

  it('rejects reserved paths behind a leading ./', () => {
    const getSourceFile = createGetSourceFile('./{name}.ts');

    expect(() => getSourceFile({ name: 'TypeRegistry', type: 'model' })).toThrow(
      /reserved/,
    );
  });

  it('allows names whose helper file is not generated with the current options', () => {
    const getSourceFile = createGetSourceFile(
      '{name}.ts',
      getReservedRootFiles(cjsConfig),
    );

    expect(getSourceFile({ name: 'TypeRegistry', type: 'model' }).getFilePath()).toBe(
      '/out/type-registry.ts',
    );
    expect(getSourceFile({ name: 'Index', type: 'model' }).getFilePath()).toBe(
      '/out/index.ts',
    );
  });
});
