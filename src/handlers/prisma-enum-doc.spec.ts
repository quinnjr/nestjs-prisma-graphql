import { describe, expect, it } from 'vitest';

import { extractEnumValueDocs } from './prisma-enum-doc.js';

describe('extractEnumValueDocs', () => {
  describe('description extraction', () => {
    it('should extract description from documentation', () => {
      const values = [
        { documentation: 'Administrator role', name: 'ADMIN' },
        { documentation: 'Regular user role', name: 'USER' },
      ];

      const result = extractEnumValueDocs(values);

      expect(result).toEqual({
        ADMIN: { description: 'Administrator role' },
        USER: { description: 'Regular user role' },
      });
    });

    it('should handle single value', () => {
      const values = [{ documentation: 'Active status', name: 'ACTIVE' }];

      const result = extractEnumValueDocs(values);

      expect(result).toEqual({
        ACTIVE: { description: 'Active status' },
      });
    });
  });

  describe('deprecation extraction', () => {
    it('should extract deprecation reason from @deprecated', () => {
      const values = [
        { documentation: '@deprecated Use NEW_VALUE instead', name: 'OLD_VALUE' },
      ];

      const result = extractEnumValueDocs(values);

      expect(result).toEqual({
        OLD_VALUE: { deprecationReason: 'Use NEW_VALUE instead' },
      });
    });

    it('should trim deprecation reason', () => {
      const values = [
        { documentation: '@deprecated   Will be removed   ', name: 'DEPRECATED' },
      ];

      const result = extractEnumValueDocs(values);

      expect(result.DEPRECATED).toEqual({
        deprecationReason: 'Will be removed',
      });
    });

    it('should handle @deprecated with no reason', () => {
      const values = [{ documentation: '@deprecated', name: 'OLD' }];

      const result = extractEnumValueDocs(values);

      expect(result.OLD).toEqual({ deprecationReason: '' });
    });
  });

  describe('mixed values', () => {
    it('should handle mix of documented and deprecated values', () => {
      const values = [
        { documentation: 'Active status', name: 'ACTIVE' },
        { documentation: '@deprecated Use ARCHIVED instead', name: 'INACTIVE' },
        { documentation: 'Archived status', name: 'ARCHIVED' },
      ];

      const result = extractEnumValueDocs(values);

      expect(result).toEqual({
        ACTIVE: { description: 'Active status' },
        ARCHIVED: { description: 'Archived status' },
        INACTIVE: { deprecationReason: 'Use ARCHIVED instead' },
      });
    });
  });

  describe('values without documentation', () => {
    it('should skip values without documentation', () => {
      const values = [
        { documentation: 'Has docs', name: 'DOCUMENTED' },
        { name: 'UNDOCUMENTED' },
      ];

      const result = extractEnumValueDocs(values);

      expect(result).toEqual({
        DOCUMENTED: { description: 'Has docs' },
      });
      expect(result.UNDOCUMENTED).toBeUndefined();
    });

    it('should skip values with non-string documentation', () => {
      const values = [
        { documentation: 'String documentation', name: 'STRING_DOC' },
        { documentation: 123, name: 'NUMBER_DOC' },
        { documentation: null, name: 'NULL_DOC' },
        { documentation: undefined, name: 'UNDEFINED_DOC' },
      ];

      const result = extractEnumValueDocs(values);

      expect(Object.keys(result)).toHaveLength(1);
      expect(result.STRING_DOC).toEqual({ description: 'String documentation' });
    });
  });

  describe('empty input', () => {
    it('should return empty object for empty array', () => {
      const result = extractEnumValueDocs([]);

      expect(result).toEqual({});
    });
  });

  describe('edge cases', () => {
    it('should handle empty documentation string', () => {
      const values = [{ documentation: '', name: 'EMPTY' }];

      const result = extractEnumValueDocs(values);

      // Empty string becomes description
      expect(result.EMPTY).toEqual({ description: '' });
    });

    it('should handle documentation with only @deprecated', () => {
      const values = [{ documentation: '@deprecated', name: 'DEP' }];

      const result = extractEnumValueDocs(values);

      expect(result.DEP).toEqual({ deprecationReason: '' });
    });

    it('should handle @deprecated case sensitivity', () => {
      const values = [
        { documentation: '@deprecated reason', name: 'CASE1' },
        { documentation: '@DEPRECATED reason', name: 'CASE2' },
      ];

      const result = extractEnumValueDocs(values);

      // Only lowercase @deprecated is recognized
      expect(result.CASE1).toEqual({ deprecationReason: 'reason' });
      expect(result.CASE2).toEqual({ description: '@DEPRECATED reason' });
    });

    it('should handle multiline documentation', () => {
      const values = [{ documentation: 'Line 1\nLine 2\nLine 3', name: 'MULTI' }];

      const result = extractEnumValueDocs(values);

      expect(result.MULTI).toEqual({ description: 'Line 1\nLine 2\nLine 3' });
    });
  });
});
