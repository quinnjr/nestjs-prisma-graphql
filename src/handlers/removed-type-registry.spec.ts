import type { GeneratorConfiguration } from '../types.js';

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestProject } from '../test/test-utils.js';
import {
  announceTypeRegistryRemoval,
  removeOrphanedRegistryConsumers,
  removeStaleTypeRegistryFiles,
  TYPE_REGISTRY_REMOVED_NOTICE,
} from './removed-type-registry.js';

const REGISTRY_SOURCE = `const registry = new Map();
export function registerType(name: string, type: unknown): void { registry.set(name, type); }
export function getType<T = any>(name: string): T { return registry.get(name) as T; }
`;
const REGISTRY_DECLARATION = `export declare function registerType(name: string, type: unknown): void;
export declare function getType<T = any>(name: string): T;
`;
// Declaration emit drops the markRegistrationComplete import
const REGISTER_ALL_DECLARATION = `/**
 * ESM Type Registration Module
 */
export declare const registeredTypes: readonly ["Post", "User"];
export type RegisteredTypeName = typeof registeredTypes[number];
`;
const REGISTER_ALL_SOURCE = `import { markRegistrationComplete } from './type-registry.js';
markRegistrationComplete();
`;

function esmConfig(esmCompatible: boolean): GeneratorConfiguration {
  const config: Partial<GeneratorConfiguration> = { esmCompatible };

  return config as GeneratorConfiguration;
}

describe('removed type registry', () => {
  let output: string;
  const logs: string[] = [];
  const log = (message: string): void => {
    logs.push(message);
  };
  const file = (name: string): string => path.join(output, name);

  beforeEach(() => {
    output = mkdtempSync(path.join(tmpdir(), 'npg-stale-'));
    logs.length = 0;
  });

  afterEach(() => {
    rmSync(output, { force: true, recursive: true });
  });

  describe('removeStaleTypeRegistryFiles', () => {
    it('deletes 1.x registry files in every emitted form', () => {
      writeFileSync(file('type-registry.ts'), REGISTRY_SOURCE);
      writeFileSync(file('type-registry.js'), REGISTRY_SOURCE);
      writeFileSync(file('type-registry.d.ts'), REGISTRY_DECLARATION);
      writeFileSync(file('register-all-types.ts'), REGISTER_ALL_SOURCE);
      writeFileSync(file('register-all-types.js'), REGISTER_ALL_SOURCE);
      writeFileSync(file('register-all-types.d.ts'), REGISTER_ALL_DECLARATION);

      const removed = removeStaleTypeRegistryFiles(
        { output, project: createTestProject() },
        log,
      );

      expect(removed.map(removedFile => path.basename(removedFile)).sort()).toEqual([
        'register-all-types.d.ts',
        'register-all-types.js',
        'register-all-types.ts',
        'type-registry.d.ts',
        'type-registry.js',
        'type-registry.ts',
      ]);
      for (const removedFile of removed) {
        expect(existsSync(removedFile)).toBe(false);
      }
      expect(logs).toHaveLength(6);
    });

    it('recognises files that start with // @ts-nocheck', () => {
      writeFileSync(file('type-registry.ts'), `// @ts-nocheck\n${REGISTRY_SOURCE}`);

      expect(
        removeStaleTypeRegistryFiles({ output, project: createTestProject() }, log),
      ).toHaveLength(1);
    });

    it('also drops a stale file already loaded into the project', () => {
      const project = createTestProject();
      writeFileSync(file('register-all-types.ts'), REGISTER_ALL_SOURCE);
      project.addSourceFileAtPath(file('register-all-types.ts'));

      removeStaleTypeRegistryFiles({ output, project }, log);

      expect(project.getSourceFile(file('register-all-types.ts'))).toBeUndefined();
      expect(existsSync(file('register-all-types.ts'))).toBe(false);
    });

    it('never deletes an unrelated user file with the same name', () => {
      writeFileSync(
        file('type-registry.ts'),
        'export const myOwnRegistry = new Map();\n',
      );
      writeFileSync(file('register-all-types.ts'), 'export const mine = true;\n');

      expect(
        removeStaleTypeRegistryFiles({ output, project: createTestProject() }, log),
      ).toEqual([]);
      expect(existsSync(file('type-registry.ts'))).toBe(true);
      expect(existsSync(file('register-all-types.ts'))).toBe(true);
    });

    it('leaves a model directory named type-registry alone', () => {
      const project = createTestProject();
      project.createSourceFile(
        file('type-registry/type-registry.model.ts'),
        'export class TypeRegistry {}',
      );

      expect(removeStaleTypeRegistryFiles({ output, project }, log)).toEqual([]);
      expect(project.getSourceFiles()).toHaveLength(1);
    });
  });

  describe('removeOrphanedRegistryConsumers', () => {
    const ORPHAN = `import { Field, ObjectType } from '@nestjs/graphql';
import { registerType } from '../type-registry.js';
import { getType } from '../type-registry.js';

@ObjectType()
export class Gone {
  @Field(() => getType('User'))
  user?: unknown;
}

registerType('Gone', Gone);
`;
    const REGENERATED = `import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('User')
export class User {
  @Field(() => String)
  id!: string;
}
`;

    it('deletes 1.x class files that were not regenerated, with compiled forms', () => {
      const project = createTestProject();
      mkdirSync(file('gone'));
      for (const name of [
        'gone/gone.model.ts',
        'gone/gone.model.js',
        'gone/gone.model.d.ts',
      ]) {
        writeFileSync(file(name), ORPHAN);
      }
      project.addSourceFileAtPath(file('gone/gone.model.ts'));
      project.createSourceFile(file('user/user.model.ts'), REGENERATED);

      const removed = removeOrphanedRegistryConsumers(
        { config: esmConfig(true), output, project },
        log,
      );

      expect(removed).toEqual([file('gone/gone.model.ts')]);
      expect(project.getSourceFiles().map(f => f.getBaseName())).toEqual([
        'user.model.ts',
      ]);
      expect(existsSync(file('gone/gone.model.ts'))).toBe(false);
      expect(existsSync(file('gone/gone.model.js'))).toBe(false);
      expect(existsSync(file('gone/gone.model.d.ts'))).toBe(false);
      expect(logs.at(-1)).toContain('purgeOutput');
    });

    it('keeps files that only look partly like 1.x output', () => {
      const project = createTestProject();
      // A hand-written file that mentions registerType but is not a generated class file
      project.createSourceFile(
        file('custom.ts'),
        "import { registerType } from './type-registry.js';\nexport const x = registerType;\n",
      );
      // A decorated class that does not import the registry
      project.createSourceFile(file('user/user.model.ts'), REGENERATED);

      expect(
        removeOrphanedRegistryConsumers(
          { config: esmConfig(true), output, project },
          log,
        ),
      ).toEqual([]);
      expect(project.getSourceFiles()).toHaveLength(2);
      expect(logs).toEqual([]);
    });

    it('does nothing without esmCompatible', () => {
      const project = createTestProject();
      project.createSourceFile(file('gone/gone.model.ts'), ORPHAN);

      expect(
        removeOrphanedRegistryConsumers(
          { config: esmConfig(false), output, project },
          log,
        ),
      ).toEqual([]);
      expect(project.getSourceFiles()).toHaveLength(1);
    });
  });

  describe('announceTypeRegistryRemoval', () => {
    it('prints the removal notice and cleans up in esmCompatible mode', () => {
      writeFileSync(file('register-all-types.ts'), REGISTER_ALL_SOURCE);

      announceTypeRegistryRemoval(
        {
          config: esmConfig(true),
          output,
          project: createTestProject(),
        },
        log,
      );

      expect(logs.at(-1)).toBe(TYPE_REGISTRY_REMOVED_NOTICE);
      expect(logs.at(-1)).toContain('REMOVED');
      expect(logs.at(-1)).toContain('register-all-types.js');
      expect(existsSync(file('register-all-types.ts'))).toBe(false);
    });

    it('stays silent and touches nothing without esmCompatible', () => {
      writeFileSync(file('register-all-types.ts'), REGISTER_ALL_SOURCE);

      announceTypeRegistryRemoval(
        {
          config: esmConfig(false),
          output,
          project: createTestProject(),
        },
        log,
      );

      expect(logs).toEqual([]);
      expect(existsSync(file('register-all-types.ts'))).toBe(true);
    });
  });
});
