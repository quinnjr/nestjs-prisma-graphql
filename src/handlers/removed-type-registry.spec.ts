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
    // Exactly what the 1.x generator wrote
    const ORPHAN = `import { Field } from '@nestjs/graphql';
import { ObjectType } from '@nestjs/graphql';
import { registerType } from '../type-registry.js';
import { getType } from '../type-registry.js';
import { User } from '../user/user.model.js';

@ObjectType()
export class Gone {

    @Field(() => getType('User'), {nullable:false})
    user?: User;
}


registerType('Gone', Gone);
`;
    // A hand-written class that used the documented 1.x registry API
    const HAND_WRITTEN = `import { Field, ObjectType } from '@nestjs/graphql';
import { getType, registerType } from '../type-registry.js';
import { helper } from '../../helper.js';

@ObjectType()
export class UserExtra {
  @Field(() => getType('User'))
  user?: unknown;

  describe(): string {
    return helper(this);
  }
}

registerType('UserExtra', UserExtra);
`;
    const REGENERATED = `import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('User')
export class User {
  @Field(() => String)
  id!: string;
}
`;
    const run = (project: ReturnType<typeof createTestProject>, esm = true) =>
      removeOrphanedRegistryConsumers({ config: esmConfig(esm), output, project }, log);
    const onDisk = (
      project: ReturnType<typeof createTestProject>,
      name: string,
      text: string,
    ) => {
      mkdirSync(path.dirname(file(name)), { recursive: true });
      writeFileSync(file(name), text);
      project.addSourceFileAtPath(file(name));
    };

    it('deletes 1.x generated files that were not regenerated, with compiled forms', () => {
      const project = createTestProject();
      onDisk(project, 'gone/gone.model.ts', ORPHAN);
      writeFileSync(file('gone/gone.model.js'), ORPHAN);
      writeFileSync(file('gone/gone.model.d.ts'), ORPHAN);
      project.createSourceFile(file('user/user.model.ts'), REGENERATED);

      const result = run(project);

      expect(result).toEqual({ removed: [file('gone/gone.model.ts')], skipped: [] });
      expect(project.getSourceFiles().map(f => f.getBaseName())).toEqual([
        'user.model.ts',
      ]);
      expect(existsSync(file('gone/gone.model.ts'))).toBe(false);
      expect(existsSync(file('gone/gone.model.js'))).toBe(false);
      expect(existsSync(file('gone/gone.model.d.ts'))).toBe(false);
      expect(logs.at(-1)).toContain('purgeOutput');
    });

    it('recognises a 1.x generated file that starts with // @ts-nocheck', () => {
      const project = createTestProject();
      onDisk(project, 'gone/gone.model.ts', `// @ts-nocheck\n${ORPHAN}`);

      expect(run(project).removed).toEqual([file('gone/gone.model.ts')]);
    });

    it('never deletes a hand-written file that uses the registry', () => {
      const project = createTestProject();
      onDisk(project, 'user/user-extra.model.ts', HAND_WRITTEN);

      const result = run(project);

      expect(result).toEqual({
        removed: [],
        skipped: [file('user/user-extra.model.ts')],
      });
      expect(existsSync(file('user/user-extra.model.ts'))).toBe(true);
      // Left out of the project so this run's barrels do not re-export a broken file
      expect(project.getSourceFiles()).toEqual([]);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain('WARNING');
      expect(logs[0]).toContain('user-extra.model.ts');
    });

    it.each([
      [
        'an extra statement',
        ORPHAN.replace('registerType(', 'console.log(1);\nregisterType('),
      ],
      [
        'a combined registry import',
        ORPHAN.replace(
          "import { registerType } from '../type-registry.js';\nimport { getType } from '../type-registry.js';",
          "import { getType, registerType } from '../type-registry.js';",
        ),
      ],
      ['a second class', `${ORPHAN}\nexport class Other {}\n`],
    ])('keeps a file that differs from the generated shape by %s', (_reason, text) => {
      const project = createTestProject();
      onDisk(project, 'gone/gone.model.ts', text);

      expect(run(project).removed).toEqual([]);
      expect(existsSync(file('gone/gone.model.ts'))).toBe(true);
    });

    it('ignores files that do not use the registry', () => {
      const project = createTestProject();
      project.createSourceFile(file('user/user.model.ts'), REGENERATED);

      expect(run(project)).toEqual({ removed: [], skipped: [] });
      expect(project.getSourceFiles()).toHaveLength(1);
      expect(logs).toEqual([]);
    });

    it('does nothing without esmCompatible', () => {
      const project = createTestProject();
      onDisk(project, 'gone/gone.model.ts', ORPHAN);

      expect(run(project, false)).toEqual({ removed: [], skipped: [] });
      expect(existsSync(file('gone/gone.model.ts'))).toBe(true);
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
