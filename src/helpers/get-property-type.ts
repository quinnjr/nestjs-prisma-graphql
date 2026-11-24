import type { FieldLocation } from '../types.js';

/**
 * Returns typescript property type.
 */
export function getPropertyType(args: {
  type: string;
  location: FieldLocation;
  /**
   * Names of enums whose members have custom `@EnumValue(...)` values.
   * These are typed as the enum itself: the `${Enum}` template literal type
   * would turn numeric member values into strings.
   */
  customValueEnums?: ReadonlySet<string>;
}): string[] {
  const { customValueEnums, location, type } = args;
  switch (type) {
    case 'Float':
    case 'Int': {
      return ['number'];
    }
    case 'String': {
      return ['string'];
    }
    case 'Boolean': {
      return ['boolean'];
    }
    case 'DateTime': {
      return ['Date', 'string'];
    }
    case 'Decimal': {
      return ['Prisma.Decimal'];
    }
    case 'Json': {
      return ['any'];
    }
    case 'Null': {
      return ['null'];
    }
    case 'Bytes': {
      return ['Uint8Array'];
    }
    case 'BigInt': {
      return ['bigint', 'number'];
    }
  }
  if (['inputObjectTypes', 'outputObjectTypes'].includes(location)) {
    return [type];
  }
  if (location === 'enumTypes') {
    if (customValueEnums?.has(type) === true) {
      return [type];
    }
    const enumType = `\`\${${type}}\``;

    return [enumType];
  }
  if (location === 'scalar') {
    return [type];
  }

  return ['unknown'];
}
