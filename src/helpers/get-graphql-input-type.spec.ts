import type { DMMF } from '../types.js';

import { describe, expect, it } from 'vitest';

import { getGraphqlInputType } from './get-graphql-input-type.js';

describe('getGraphqlInputType', () => {
  describe('single input type', () => {
    it('should return the only input type', () => {
      const inputTypes: DMMF.InputTypeRef[] = [
        { isList: false, location: 'scalar', type: 'String' },
      ];

      const result = getGraphqlInputType(inputTypes);

      expect(result?.type).toBe('String');
    });
  });

  describe('filtering null types', () => {
    it('should filter out null type', () => {
      const inputTypes: DMMF.InputTypeRef[] = [
        { isList: false, location: 'scalar', type: 'null' },
        { isList: false, location: 'scalar', type: 'String' },
      ];

      const result = getGraphqlInputType(inputTypes);

      expect(result?.type).toBe('String');
    });

    it('should filter out Null type', () => {
      const inputTypes: DMMF.InputTypeRef[] = [
        { isList: false, location: 'scalar', type: 'Null' },
        { isList: false, location: 'scalar', type: 'Int' },
      ];

      const result = getGraphqlInputType(inputTypes);

      expect(result?.type).toBe('Int');
    });
  });

  describe('preferring list types', () => {
    it('should prefer list type when all same location', () => {
      const inputTypes: DMMF.InputTypeRef[] = [
        { isList: false, location: 'scalar', type: 'String' },
        { isList: true, location: 'scalar', type: 'String' },
      ];

      const result = getGraphqlInputType(inputTypes);

      expect(result?.isList).toBe(true);
    });
  });

  describe('pattern matching', () => {
    it('should find type by simple pattern', () => {
      const inputTypes: DMMF.InputTypeRef[] = [
        { isList: false, location: 'inputObjectTypes', type: 'UserWhereInput' },
        { isList: false, location: 'inputObjectTypes', type: 'UserCreateInput' },
      ];

      const result = getGraphqlInputType(inputTypes, 'Where');

      expect(result?.type).toBe('UserWhereInput');
    });

    it('should find type by matcher pattern', () => {
      const inputTypes: DMMF.InputTypeRef[] = [
        { isList: false, location: 'inputObjectTypes', type: 'UserWhereInput' },
        { isList: false, location: 'inputObjectTypes', type: 'PostWhereInput' },
      ];

      const result = getGraphqlInputType(inputTypes, 'matcher:User*');

      expect(result?.type).toBe('UserWhereInput');
    });

    it('should find type by match: prefix pattern', () => {
      const inputTypes: DMMF.InputTypeRef[] = [
        { isList: false, location: 'inputObjectTypes', type: 'UserCreateInput' },
        { isList: false, location: 'inputObjectTypes', type: 'PostCreateInput' },
      ];

      const result = getGraphqlInputType(inputTypes, 'match:*Create*');

      expect(result?.type).toBe('UserCreateInput');
    });
  });

  describe('preferring inputObjectTypes', () => {
    it('should prefer inputObjectTypes location', () => {
      const inputTypes: DMMF.InputTypeRef[] = [
        { isList: false, location: 'scalar', type: 'String' },
        { isList: false, location: 'inputObjectTypes', type: 'UserInput' },
      ];

      const result = getGraphqlInputType(inputTypes);

      expect(result?.type).toBe('UserInput');
      expect(result?.location).toBe('inputObjectTypes');
    });
  });

  describe('enum and scalar with Json', () => {
    it('should prefer Json scalar when both enum and scalar present', () => {
      const inputTypes: DMMF.InputTypeRef[] = [
        { isList: false, location: 'enumTypes', type: 'SomeEnum' },
        { isList: false, location: 'scalar', type: 'Json' },
      ];

      const result = getGraphqlInputType(inputTypes);

      expect(result?.type).toBe('Json');
    });
  });

  describe('fieldRefTypes handling', () => {
    it('should prefer scalar or enum over fieldRefTypes', () => {
      const inputTypes: DMMF.InputTypeRef[] = [
        { isList: false, location: 'fieldRefTypes', type: 'StringFieldRef' },
        { isList: false, location: 'scalar', type: 'String' },
      ];

      const result = getGraphqlInputType(inputTypes);

      expect(result?.type).toBe('String');
    });

    it('should prefer list scalar over fieldRefTypes', () => {
      const inputTypes: DMMF.InputTypeRef[] = [
        { isList: false, location: 'fieldRefTypes', type: 'StringFieldRef' },
        { isList: true, location: 'scalar', type: 'String' },
      ];

      const result = getGraphqlInputType(inputTypes);

      expect(result?.isList).toBe(true);
    });

    it('should prefer enum over fieldRefTypes', () => {
      const inputTypes: DMMF.InputTypeRef[] = [
        { isList: false, location: 'fieldRefTypes', type: 'EnumFieldRef' },
        { isList: false, location: 'enumTypes', type: 'Role' },
      ];

      const result = getGraphqlInputType(inputTypes);

      expect(result?.type).toBe('Role');
    });
  });

  describe('error handling', () => {
    it('should throw when no matching type found', () => {
      const inputTypes: DMMF.InputTypeRef[] = [
        { isList: false, location: 'fieldRefTypes', type: 'StringFieldRef' },
        { isList: false, location: 'fieldRefTypes', type: 'IntFieldRef' },
      ];

      expect(() => getGraphqlInputType(inputTypes)).toThrow(TypeError);
    });

    it('should throw with empty array', () => {
      expect(() => getGraphqlInputType([])).toThrow(
        'Cannot get matching input type from zero length inputTypes',
      );
    });
  });

  describe('deduplication', () => {
    it('should deduplicate identical input types', () => {
      const inputTypes: DMMF.InputTypeRef[] = [
        { isList: false, location: 'scalar', type: 'String' },
        { isList: false, location: 'scalar', type: 'String' },
      ];

      const result = getGraphqlInputType(inputTypes);

      expect(result?.type).toBe('String');
    });
  });
});
