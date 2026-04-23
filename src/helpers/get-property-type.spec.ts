import type { FieldLocation } from '../types.js';

import { describe, expect, it } from 'vitest';

import { getPropertyType } from './get-property-type.js';

describe('getPropertyType', () => {
  describe('scalar types', () => {
    it('should return number for Float', () => {
      expect(getPropertyType({ location: 'scalar', type: 'Float' })).toEqual(['number']);
    });

    it('should return number for Int', () => {
      expect(getPropertyType({ location: 'scalar', type: 'Int' })).toEqual(['number']);
    });

    it('should return string for String', () => {
      expect(getPropertyType({ location: 'scalar', type: 'String' })).toEqual(['string']);
    });

    it('should return boolean for Boolean', () => {
      expect(getPropertyType({ location: 'scalar', type: 'Boolean' })).toEqual([
        'boolean',
      ]);
    });

    it('should return Date and string for DateTime', () => {
      expect(getPropertyType({ location: 'scalar', type: 'DateTime' })).toEqual([
        'Date',
        'string',
      ]);
    });

    it('should return Prisma.Decimal for Decimal', () => {
      expect(getPropertyType({ location: 'scalar', type: 'Decimal' })).toEqual([
        'Prisma.Decimal',
      ]);
    });

    it('should return any for Json', () => {
      expect(getPropertyType({ location: 'scalar', type: 'Json' })).toEqual(['any']);
    });

    it('should return null for Null', () => {
      expect(getPropertyType({ location: 'scalar', type: 'Null' })).toEqual(['null']);
    });

    it('should return Uint8Array for Bytes', () => {
      expect(getPropertyType({ location: 'scalar', type: 'Bytes' })).toEqual([
        'Uint8Array',
      ]);
    });

    it('should return bigint and number for BigInt', () => {
      expect(getPropertyType({ location: 'scalar', type: 'BigInt' })).toEqual([
        'bigint',
        'number',
      ]);
    });
  });

  describe('inputObjectTypes location', () => {
    it('should return the type name directly', () => {
      expect(
        getPropertyType({ location: 'inputObjectTypes', type: 'UserCreateInput' }),
      ).toEqual(['UserCreateInput']);
    });

    it('should return custom type name', () => {
      expect(
        getPropertyType({ location: 'inputObjectTypes', type: 'PostWhereInput' }),
      ).toEqual(['PostWhereInput']);
    });
  });

  describe('outputObjectTypes location', () => {
    it('should return the type name directly', () => {
      expect(getPropertyType({ location: 'outputObjectTypes', type: 'User' })).toEqual([
        'User',
      ]);
    });

    it('should return custom output type name', () => {
      expect(
        getPropertyType({
          location: 'outputObjectTypes',
          type: 'AggregateUser',
        }),
      ).toEqual(['AggregateUser']);
    });
  });

  describe('enumTypes location', () => {
    it('should return template literal type for enum', () => {
      expect(getPropertyType({ location: 'enumTypes', type: 'Role' })).toEqual([
        // eslint-disable-next-line no-template-curly-in-string
        '`${Role}`',
      ]);
    });

    it('should return template literal type for custom enum', () => {
      expect(
        getPropertyType({ location: 'enumTypes', type: 'UserStatus' }),
        // eslint-disable-next-line no-template-curly-in-string
      ).toEqual(['`${UserStatus}`']);
    });
  });

  describe('scalar location with custom types', () => {
    it('should return the type as-is for unknown scalar types', () => {
      expect(getPropertyType({ location: 'scalar', type: 'CustomScalar' })).toEqual([
        'CustomScalar',
      ]);
    });
  });

  describe('unknown location', () => {
    it('should return unknown for unhandled locations', () => {
      expect(
        getPropertyType({
          location: 'unknown' as FieldLocation,
          type: 'Something',
        }),
      ).toEqual(['unknown']);
    });
  });

  describe('fieldRefTypes location', () => {
    it('should return unknown for fieldRefTypes', () => {
      expect(
        getPropertyType({
          location: 'fieldRefTypes',
          type: 'StringFieldRefInput',
        }),
      ).toEqual(['unknown']);
    });
  });
});
