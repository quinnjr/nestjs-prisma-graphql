import type { EventArguments, SchemaEnum } from '../types.js';

import JSON5 from 'json5';
import { type EnumDeclarationStructure, StructureKind } from 'ts-morph';

import {
  assertNoEnumLevelEnumValue,
  getEnumMembers,
} from '../helpers/enum-value-settings.js';
import { ImportDeclarationMap } from '../helpers/import-declaration-map.js';
import { extractEnumValueDocs } from './prisma-enum-doc.js';

export function registerEnum(enumType: SchemaEnum, args: EventArguments): void {
  const { config, enums, getSourceFile } = args;

  // Type-safe extraction of enum name from SchemaEnum
  // Access the name property through unknown to avoid unsafe member access
  const enumTypeAsRecord = enumType as Record<string, unknown>;
  const rawName: unknown = enumTypeAsRecord.name;
  const enumName: string = typeof rawName === 'string' ? rawName : String(rawName);
  const enumValue = enums[enumName];
  if (!config.emitBlocks.prismaEnums && enumValue === undefined) {
    return;
  }

  const dataModelEnum = enumValue;

  // Type-safe extraction of enum values
  // Access the values property through unknown to avoid unsafe member access
  const enumTypeRecord = enumType as Record<string, unknown>;
  const rawValues: unknown = enumTypeRecord.values;
  const enumValues: string[] = Array.isArray(rawValues)
    ? (rawValues as unknown[]).map((v: unknown) => String(v))
    : [];

  // Resolve member values (honouring `/// @EnumValue(...)` directives)
  assertNoEnumLevelEnumValue(enumName, dataModelEnum?.documentation);
  const enumMembers = getEnumMembers(enumName, enumValues, dataModelEnum);

  const sourceFile = getSourceFile({
    name: enumName,
    type: 'enum',
  });

  const importDeclarations = new ImportDeclarationMap();

  importDeclarations.set('registerEnumType', {
    moduleSpecifier: '@nestjs/graphql',
    namedImports: [{ name: 'registerEnumType' }],
  });

  // Extract valuesMap from enum documentation
  const valuesMap = extractEnumValueDocs(enumMembers);

  // Remove entries with no description or deprecationReason
  const filteredValuesMap = Object.fromEntries(
    Object.entries(valuesMap).filter(([, v]) => Object.keys(v).length > 0),
  );

  // Format only if needed
  const hasValuesMap = Object.keys(filteredValuesMap).length > 0;
  const formattedValuesMap = hasValuesMap
    ? JSON5.stringify(filteredValuesMap, null, 2)
    : '';
  const valuesMapEntry = hasValuesMap ? `, valuesMap: ${formattedValuesMap}` : '';

  const enumStructure: EnumDeclarationStructure = {
    isExported: true,
    kind: StructureKind.Enum,
    members: enumMembers.map(({ name, value }) => ({
      initializer: JSON.stringify(value),
      name,
    })),
    name: enumName,
  };

  const enumTypeName = enumName;
  sourceFile.set({
    statements: [
      ...importDeclarations.toStatements(),
      enumStructure,
      '\n',
      `registerEnumType(${enumTypeName}, { name: '${enumTypeName}', description: ${JSON.stringify(
        dataModelEnum?.documentation,
      )}${valuesMapEntry} })`,
    ],
  });
}
