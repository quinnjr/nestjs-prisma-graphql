import type { Model } from '../types.js';

import { describe, expect, it } from 'vitest';

import {
  buildDependencyGraph,
  detectCircularDependencies,
  hasCircularDependency,
} from './detect-circular-deps.js';

describe('detect-circular-deps', () => {
  describe('buildDependencyGraph', () => {
    it('should build empty graph for no models', () => {
      const graph = buildDependencyGraph([]);
      expect(graph.size).toBe(0);
    });

    it('should build graph with model dependencies', () => {
      const models: Model[] = [
        {
          fields: [
            {
              hasDefaultValue: false,
              isId: true,
              isList: false,
              isReadOnly: false,
              isRequired: true,
              isUnique: false,
              kind: 'scalar',
              name: 'id',
              type: 'String',
            },
            {
              hasDefaultValue: false,
              isId: false,
              isList: true,
              isReadOnly: false,
              isRequired: true,
              isUnique: false,
              kind: 'object',
              name: 'posts',
              type: 'Post',
            },
          ],
          name: 'User',
        },
        {
          fields: [
            {
              hasDefaultValue: false,
              isId: true,
              isList: false,
              isReadOnly: false,
              isRequired: true,
              isUnique: false,
              kind: 'scalar',
              name: 'id',
              type: 'String',
            },
            {
              hasDefaultValue: false,
              isId: false,
              isList: false,
              isReadOnly: false,
              isRequired: true,
              isUnique: false,
              kind: 'object',
              name: 'author',
              type: 'User',
            },
          ],
          name: 'Post',
        },
      ] as unknown as Model[];

      const graph = buildDependencyGraph(models);

      expect(graph.get('User')?.has('Post')).toBe(true);
      expect(graph.get('Post')?.has('User')).toBe(true);
    });
  });

  describe('detectCircularDependencies', () => {
    it('should detect circular dependency between two models', () => {
      const models: Model[] = [
        {
          fields: [
            {
              hasDefaultValue: false,
              isId: false,
              isList: true,
              isReadOnly: false,
              isRequired: true,
              isUnique: false,
              kind: 'object',
              name: 'posts',
              type: 'Post',
            },
          ],
          name: 'User',
        },
        {
          fields: [
            {
              hasDefaultValue: false,
              isId: false,
              isList: false,
              isReadOnly: false,
              isRequired: true,
              isUnique: false,
              kind: 'object',
              name: 'author',
              type: 'User',
            },
          ],
          name: 'Post',
        },
      ] as unknown as Model[];

      const graph = buildDependencyGraph(models);
      const circular = detectCircularDependencies(graph);

      expect(circular.size).toBeGreaterThan(0);
      expect(circular.has('Post:User')).toBe(true);
    });

    it('should not detect circular dependency for non-circular models', () => {
      const models: Model[] = [
        {
          fields: [
            {
              hasDefaultValue: false,
              isId: true,
              isList: false,
              isReadOnly: false,
              isRequired: true,
              isUnique: false,
              kind: 'scalar',
              name: 'id',
              type: 'String',
            },
          ],
          name: 'User',
        },
        {
          fields: [
            {
              hasDefaultValue: false,
              isId: false,
              isList: false,
              isReadOnly: false,
              isRequired: true,
              isUnique: false,
              kind: 'object',
              name: 'author',
              type: 'User',
            },
          ],
          name: 'Post',
        },
      ] as unknown as Model[];

      const graph = buildDependencyGraph(models);
      const circular = detectCircularDependencies(graph);

      expect(circular.size).toBe(0);
    });
  });

  describe('hasCircularDependency', () => {
    it('should return true for circular pair', () => {
      const circular = new Set(['Post:User']);

      expect(hasCircularDependency(circular, 'User', 'Post')).toBe(true);
      expect(hasCircularDependency(circular, 'Post', 'User')).toBe(true);
    });

    it('should return false for non-circular pair', () => {
      const circular = new Set(['Post:User']);

      expect(hasCircularDependency(circular, 'User', 'Comment')).toBe(false);
    });
  });
});
