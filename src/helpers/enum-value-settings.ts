import type { DMMF } from '@prisma/generator-helper';

import JSON5 from 'json5';

export type EnumMemberValue = string | number;

export interface EnumMember {
  name: string;
  value: EnumMemberValue;
  /** Member documentation with `@EnumValue(...)` directives removed. */
  documentation: string | undefined;
}

const ENUM_VALUE_DIRECTIVE = /^\s*@EnumValue\((?<args>.*)\)\s*$/;
const ENUM_VALUE_MENTION = /@EnumValue\b/;

/**
 * Prisma's DMMF types omit it, but enum values carry their `///` comments in
 * a `documentation` property at runtime.
 */
function getValueDocumentation(value: DMMF.EnumValue): string | undefined {
  const { documentation } = value as { documentation?: unknown };

  return typeof documentation === 'string' ? documentation : undefined;
}

/**
 * Extracts an `@EnumValue(...)` directive from an enum value's documentation.
 *
 * ```prisma
 * enum Role {
 *   /// @EnumValue("admin")
 *   ADMIN
 *   /// @EnumValue(2)
 *   USER
 * }
 * ```
 */
export function parseEnumValueDocumentation(documentation: string | undefined): {
  documentation: string | undefined;
  value: EnumMemberValue | undefined;
} {
  if (documentation === undefined) {
    return { documentation: undefined, value: undefined };
  }

  const documentationLines: string[] = [];
  let value: EnumMemberValue | undefined;

  for (const line of documentation.split('\n')) {
    const match = ENUM_VALUE_DIRECTIVE.exec(line);
    if (!match) {
      if (ENUM_VALUE_MENTION.test(line)) {
        throw new Error(
          `Invalid @EnumValue line "${line.trim()}": the directive must be on its own line, e.g. /// @EnumValue("admin")`,
        );
      }
      documentationLines.push(line);
      continue;
    }

    if (value !== undefined) {
      throw new Error('@EnumValue is used more than once');
    }

    value = parseEnumValueArgument(match.groups?.args ?? '');
  }

  // Drop only the blank lines around the remaining text, keep paragraph breaks
  const remaining = documentationLines.join('\n').replace(/^\n+|\n+$/g, '');

  return {
    documentation: remaining === '' ? undefined : remaining,
    value,
  };
}

function parseEnumValueArgument(rawArgument: string): EnumMemberValue {
  let parsed: unknown;
  try {
    parsed = JSON5.parse(rawArgument);
  } catch {
    throw new Error(
      `Invalid @EnumValue(${rawArgument}): expected a quoted string or a number, e.g. @EnumValue("admin") or @EnumValue(1)`,
    );
  }

  if (typeof parsed === 'number') {
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid @EnumValue(${rawArgument}): number must be finite`);
    }

    if (Number.isInteger(parsed) && !Number.isSafeInteger(parsed)) {
      throw new Error(
        `Invalid @EnumValue(${rawArgument}): integer is outside the safe range (±${String(Number.MAX_SAFE_INTEGER)}); use a string instead`,
      );
    }

    return parsed;
  }

  if (typeof parsed === 'string') {
    return parsed;
  }

  throw new Error(`Invalid @EnumValue(${rawArgument}): value must be a string or number`);
}

/**
 * Resolves the TypeScript members of an enum. Each member defaults to its own
 * name as a string value unless an `@EnumValue(...)` directive overrides it.
 */
export function getEnumMembers(
  enumName: string,
  valueNames: readonly string[],
  datamodelEnum: DMMF.DatamodelEnum | undefined,
): EnumMember[] {
  const datamodelValues = new Map(datamodelEnum?.values.map(v => [v.name, v]));
  const seenValues = new Map<EnumMemberValue, string>();

  return valueNames.map(name => {
    const datamodelValue = datamodelValues.get(name);
    let parsed: ReturnType<typeof parseEnumValueDocumentation>;
    try {
      parsed = parseEnumValueDocumentation(
        datamodelValue ? getValueDocumentation(datamodelValue) : undefined,
      );
    } catch (error) {
      throw new Error(`${enumName}.${name}: ${(error as Error).message}`, {
        cause: error,
      });
    }

    const value = parsed.value ?? name;
    const duplicateOf = seenValues.get(value);
    if (duplicateOf !== undefined) {
      throw new Error(
        `${enumName}.${name}: value ${JSON.stringify(value)} is already used by ${enumName}.${duplicateOf}; enum values must be unique`,
      );
    }
    seenValues.set(value, name);

    return { documentation: parsed.documentation, name, value };
  });
}

/**
 * Rejects `@EnumValue` in an enum's own documentation, where it would otherwise
 * silently end up in the GraphQL description.
 */
export function assertNoEnumLevelEnumValue(
  enumName: string,
  documentation: string | undefined,
): void {
  if (documentation !== undefined && ENUM_VALUE_MENTION.test(documentation)) {
    throw new Error(
      `${enumName}: @EnumValue must be placed on an enum value, not on the enum itself`,
    );
  }
}

/**
 * Whether any value of the enum has an `@EnumValue(...)` directive.
 */
export function hasCustomEnumValues(
  datamodelEnum: DMMF.DatamodelEnum | undefined,
): boolean {
  return (
    datamodelEnum?.values.some(v =>
      (getValueDocumentation(v) ?? '')
        .split('\n')
        .some(line => ENUM_VALUE_DIRECTIVE.test(line)),
    ) ?? false
  );
}
