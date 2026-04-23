import type { EventArguments } from '../types.js';

import { Project } from 'ts-morph';
import { beforeEach, describe, expect, it } from 'vitest';

import { generateTypeRegistry } from './type-registry.js';

describe('generateTypeRegistry', () => {
  let project: Project;
  let mockArgs: Partial<EventArguments>;

  beforeEach(() => {
    project = new Project({
      useInMemoryFileSystem: true,
    });
    project.createDirectory('/output');

    const config = {
      esmCompatible: true,
    } satisfies Partial<EventArguments['config']> as EventArguments['config'];

    mockArgs = {
      config,
      output: '/output',
      project,
    };
  });

  it('should generate type-registry.ts when esmCompatible is true', () => {
    generateTypeRegistry(mockArgs as EventArguments);

    const sourceFile = project.getSourceFile('/output/type-registry.ts');
    expect(sourceFile).toBeDefined();
  });

  it('should not generate type-registry.ts when esmCompatible is false', () => {
    const config = {
      esmCompatible: false,
    } satisfies Partial<EventArguments['config']> as EventArguments['config'];
    mockArgs.config = config;

    generateTypeRegistry(mockArgs as EventArguments);

    const sourceFile = project.getSourceFile('/output/type-registry.ts');
    expect(sourceFile).toBeUndefined();
  });

  it('should export registerType function', () => {
    generateTypeRegistry(mockArgs as EventArguments);

    const sourceFile = project.getSourceFile('/output/type-registry.ts');
    const content = sourceFile?.getText() ?? '';

    expect(content).toContain('export function registerType');
  });

  it('should export getType function', () => {
    generateTypeRegistry(mockArgs as EventArguments);

    const sourceFile = project.getSourceFile('/output/type-registry.ts');
    const content = sourceFile?.getText() ?? '';

    expect(content).toContain('export function getType');
  });

  it('should export forwardRef function for ESM circular deps', () => {
    generateTypeRegistry(mockArgs as EventArguments);

    const sourceFile = project.getSourceFile('/output/type-registry.ts');
    const content = sourceFile?.getText() ?? '';

    expect(content).toContain('export function forwardRef');
  });

  it('should export lazyType function', () => {
    generateTypeRegistry(mockArgs as EventArguments);

    const sourceFile = project.getSourceFile('/output/type-registry.ts');
    const content = sourceFile?.getText() ?? '';

    expect(content).toContain('export function lazyType');
  });

  it('should export markRegistrationComplete function', () => {
    generateTypeRegistry(mockArgs as EventArguments);

    const sourceFile = project.getSourceFile('/output/type-registry.ts');
    const content = sourceFile?.getText() ?? '';

    expect(content).toContain('export function markRegistrationComplete');
  });

  it('should export isTypeRegistered function', () => {
    generateTypeRegistry(mockArgs as EventArguments);

    const sourceFile = project.getSourceFile('/output/type-registry.ts');
    const content = sourceFile?.getText() ?? '';

    expect(content).toContain('export function isTypeRegistered');
  });

  it('should export validateRegistry function', () => {
    generateTypeRegistry(mockArgs as EventArguments);

    const sourceFile = project.getSourceFile('/output/type-registry.ts');
    const content = sourceFile?.getText() ?? '';

    expect(content).toContain('export function validateRegistry');
  });

  it('should export getRegisteredTypes function', () => {
    generateTypeRegistry(mockArgs as EventArguments);

    const sourceFile = project.getSourceFile('/output/type-registry.ts');
    const content = sourceFile?.getText() ?? '';

    expect(content).toContain('export function getRegisteredTypes');
  });

  it('should include documentation about ESM circular dependency handling', () => {
    generateTypeRegistry(mockArgs as EventArguments);

    const sourceFile = project.getSourceFile('/output/type-registry.ts');
    const content = sourceFile?.getText() ?? '';

    expect(content).toContain('ESM');
    expect(content).toContain('circular');
  });

  it('should include error handling in forwardRef', () => {
    generateTypeRegistry(mockArgs as EventArguments);

    const sourceFile = project.getSourceFile('/output/type-registry.ts');
    const content = sourceFile?.getText() ?? '';

    expect(content).toContain('throw new Error');
    expect(content).toContain('not registered');
  });
});
