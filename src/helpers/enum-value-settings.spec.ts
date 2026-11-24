import { describe, expect, it } from 'vitest';

import {
  assertNoEnumLevelEnumValue,
  getEnumMembers,
  hasCustomEnumValues,
  parseEnumValueDocumentation,
} from './enum-value-settings.js';

describe('parseEnumValueDocumentation', () => {
  it('returns empty result for undefined documentation', () => {
    expect(parseEnumValueDocumentation(undefined)).toEqual({
      documentation: undefined,
      value: undefined,
    });
  });

  it('keeps plain documentation untouched', () => {
    expect(parseEnumValueDocumentation('Admin user')).toEqual({
      documentation: 'Admin user',
      value: undefined,
    });
  });

  it('parses a double-quoted string value', () => {
    expect(parseEnumValueDocumentation('@EnumValue("admin")')).toEqual({
      documentation: undefined,
      value: 'admin',
    });
  });

  it('parses a single-quoted string value', () => {
    expect(parseEnumValueDocumentation("@EnumValue('admin')").value).toBe('admin');
  });

  it('parses integer and decimal number values', () => {
    expect(parseEnumValueDocumentation('@EnumValue(2)').value).toBe(2);
    expect(parseEnumValueDocumentation('@EnumValue(-1.5)').value).toBe(-1.5);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseEnumValueDocumentation('  @EnumValue( 3 )  ').value).toBe(3);
  });

  it('strips the directive and keeps remaining documentation lines', () => {
    expect(parseEnumValueDocumentation('Admin user\n@EnumValue(1)\nFull access')).toEqual(
      {
        documentation: 'Admin user\nFull access',
        value: 1,
      },
    );
  });

  it('keeps @deprecated lines in documentation', () => {
    expect(parseEnumValueDocumentation('@EnumValue("old")\n@deprecated Use NEW')).toEqual(
      {
        documentation: '@deprecated Use NEW',
        value: 'old',
      },
    );
  });

  it('rejects non string/number arguments', () => {
    expect(() => parseEnumValueDocumentation('@EnumValue(true)')).toThrow(
      /string or number/,
    );
    expect(() => parseEnumValueDocumentation('@EnumValue({ a: 1 })')).toThrow(
      /string or number/,
    );
  });

  it('rejects unparsable arguments', () => {
    expect(() => parseEnumValueDocumentation('@EnumValue(admin)')).toThrow(
      /Invalid @EnumValue/,
    );
    expect(() => parseEnumValueDocumentation('@EnumValue()')).toThrow(
      /Invalid @EnumValue/,
    );
  });

  it('rejects non-finite numbers', () => {
    expect(() => parseEnumValueDocumentation('@EnumValue(Infinity)')).toThrow(/finite/);
    expect(() => parseEnumValueDocumentation('@EnumValue(NaN)')).toThrow(/finite/);
  });

  it('rejects @EnumValue that is not alone on its line', () => {
    expect(() => parseEnumValueDocumentation('@EnumValue(1) legacy code')).toThrow(
      /own line/,
    );
    expect(() => parseEnumValueDocumentation('Admin @EnumValue("admin")')).toThrow(
      /own line/,
    );
    expect(() => parseEnumValueDocumentation('@EnumValue "admin"')).toThrow(/own line/);
  });

  it('keeps blank lines between documentation paragraphs', () => {
    expect(
      parseEnumValueDocumentation('Para 1\n\nPara 2\n@EnumValue(1)').documentation,
    ).toBe('Para 1\n\nPara 2');
  });

  it('rejects integers outside the safe range', () => {
    expect(() => parseEnumValueDocumentation('@EnumValue(9007199254740993)')).toThrow(
      /safe range/,
    );
    expect(parseEnumValueDocumentation('@EnumValue(9007199254740991)').value).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it('rejects multiple directives on one value', () => {
    expect(() => parseEnumValueDocumentation('@EnumValue(1)\n@EnumValue(2)')).toThrow(
      /more than once/,
    );
  });
});

describe('getEnumMembers', () => {
  it('defaults each member value to its name', () => {
    const members = getEnumMembers('Role', ['ADMIN', 'USER'], {
      name: 'Role',
      values: [
        { dbName: null, name: 'ADMIN' },
        { dbName: null, name: 'USER' },
      ],
    });

    expect(members).toEqual([
      { documentation: undefined, name: 'ADMIN', value: 'ADMIN' },
      { documentation: undefined, name: 'USER', value: 'USER' },
    ]);
  });

  it('applies @EnumValue directives and keeps other docs', () => {
    const members = getEnumMembers('Role', ['ADMIN', 'USER', 'GUEST'], {
      name: 'Role',
      values: [
        { dbName: null, documentation: 'Admin\n@EnumValue("admin")', name: 'ADMIN' },
        { dbName: null, documentation: '@EnumValue(2)', name: 'USER' },
        { dbName: null, documentation: '@deprecated Gone', name: 'GUEST' },
      ] as never,
    });

    expect(members).toEqual([
      { documentation: 'Admin', name: 'ADMIN', value: 'admin' },
      { documentation: undefined, name: 'USER', value: 2 },
      { documentation: '@deprecated Gone', name: 'GUEST', value: 'GUEST' },
    ]);
  });

  it('works without a datamodel enum (prisma internal enums)', () => {
    expect(getEnumMembers('SortOrder', ['asc'], undefined)).toEqual([
      { documentation: undefined, name: 'asc', value: 'asc' },
    ]);
  });

  it('throws on duplicate values, naming the enum and members', () => {
    expect(() =>
      getEnumMembers('Role', ['ADMIN', 'USER'], {
        name: 'Role',
        values: [
          { dbName: null, documentation: '@EnumValue("USER")', name: 'ADMIN' },
          { dbName: null, name: 'USER' },
        ] as never,
      }),
    ).toThrow(/Role\.USER.*Role\.ADMIN|Role\.ADMIN.*Role\.USER/);
  });

  it('treats string "1" and number 1 as distinct values', () => {
    expect(() =>
      getEnumMembers('Level', ['A', 'B'], {
        name: 'Level',
        values: [
          { dbName: null, documentation: '@EnumValue(1)', name: 'A' },
          { dbName: null, documentation: '@EnumValue("1")', name: 'B' },
        ] as never,
      }),
    ).not.toThrow();
  });

  it('prefixes parse errors with the enum member', () => {
    expect(() =>
      getEnumMembers('Role', ['ADMIN'], {
        name: 'Role',
        values: [
          { dbName: null, documentation: '@EnumValue(nope)', name: 'ADMIN' },
        ] as never,
      }),
    ).toThrow(/Role\.ADMIN/);
  });
});

describe('hasCustomEnumValues', () => {
  it('is false for undefined or plain enums', () => {
    expect(hasCustomEnumValues(undefined)).toBe(false);
    expect(
      hasCustomEnumValues({
        name: 'Role',
        values: [{ dbName: null, documentation: 'Just docs', name: 'ADMIN' }] as never,
      }),
    ).toBe(false);
  });

  it('is true when any value has an @EnumValue directive', () => {
    expect(
      hasCustomEnumValues({
        name: 'Role',
        values: [
          { dbName: null, name: 'ADMIN' },
          { dbName: null, documentation: '@EnumValue(1)', name: 'USER' },
        ] as never,
      }),
    ).toBe(true);
  });
});

describe('assertNoEnumLevelEnumValue', () => {
  it('accepts enums without the directive', () => {
    expect(() => assertNoEnumLevelEnumValue('Role', undefined)).not.toThrow();
    expect(() => assertNoEnumLevelEnumValue('Role', 'User roles')).not.toThrow();
  });

  it('rejects @EnumValue on the enum itself', () => {
    expect(() => assertNoEnumLevelEnumValue('Role', 'Roles\n@EnumValue(1)')).toThrow(
      /Role: @EnumValue must be placed on an enum value/,
    );
  });
});
