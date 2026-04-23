import { unflatten } from 'flat';
import JSON5 from 'json5';
import { memoize, merge, trim } from 'lodash-es';
import { existsSync } from 'node:fs';
import outmatch from 'outmatch';

import { ok } from './type-safe-assert.js';

type Dictionary<T = unknown> = Record<string, T>;

import type { ImportNameSpec, ObjectSetting } from '../types.js';

import { ReExport } from '../handlers/re-export.js';
import { createEmitBlocks, type EmitBlocksOption } from './create-emit-blocks.js';

type ConfigFieldSetting = Partial<Omit<ObjectSetting, 'name'>>;
interface DecorateElement {
  isMatchField: (s: string) => boolean;
  isMatchType: (s: string) => boolean;
  from: string;
  name: string;
  arguments?: string[];
  namedImport: boolean;
  defaultImport?: string | true;
  namespaceImport?: string;
}
interface CustomImport {
  from: string;
  name: string;
  namedImport: boolean;
  defaultImport?: string | true;
  namespaceImport?: string;
}

export function createConfig(data: Record<string, unknown>): {
  $warnings: string[];
  combineScalarFilters: boolean;
  customImport: CustomImport[];
  decorate: DecorateElement[];
  emitBlocks: Record<string, boolean>;
  emitCompiled: boolean;
  emitSingle: boolean;
  esmCompatible: boolean;
  fields: Record<string, ConfigFieldSetting | undefined>;
  graphqlScalars: Record<string, ImportNameSpec | undefined>;
  noAtomicOperations: boolean;
  noTypeId: boolean;
  omitModelsCount: boolean;
  outputFilePattern: string;
  prismaClientImport: string;
  purgeOutput: boolean;
  reExport: ReExport;
  requireSingleFieldsInWhereUniqueInput: boolean;
  tsConfigFilePath: string | undefined;
  unsafeCompatibleWhereUniqueInput: boolean;
  useInputType: ConfigInputItem[];
} {
  const config = merge({}, unflatten(data, { delimiter: '_' }));
  const $warnings: string[] = [];

  const defaultPattern = `{model}/{name}.{type}.ts`;
  const outputFilePatternValue: unknown = config.outputFilePattern;
  const configOutputFilePattern: string =
    typeof outputFilePatternValue === 'string' ? outputFilePatternValue : defaultPattern;

  // Validate and sanitize the output file pattern
  // We don't use filenamify on the template itself since it contains placeholders like {model}, {name}, {type}
  // Instead, we just normalize the path separators and trim
  const sanitizedStep1: string = configOutputFilePattern
    .replaceAll('..', '/')
    .replaceAll(/\/+/g, '/');
  const outputFilePattern: string = trim(sanitizedStep1, '/');

  if (outputFilePattern !== configOutputFilePattern) {
    $warnings.push(
      `Due to invalid filepath 'outputFilePattern' changed to '${outputFilePattern}'`,
    );
  }

  if (
    config.reExportAll !== undefined &&
    config.reExportAll !== null &&
    config.reExportAll !== false
  ) {
    $warnings.push(`Option 'reExportAll' is deprecated, use 'reExport' instead`);
    if (toBoolean(config.reExportAll)) {
      config.reExport = 'All';
    }
  }

  const fields: Record<string, ConfigFieldSetting | undefined> = Object.fromEntries(
    Object.entries<Dictionary<string | undefined>>(
      (config.fields ?? {}) as Record<string, Dictionary<string | undefined>>,
    )
      .filter(({ 1: value }) => typeof value === 'object')
      .map(([name, value]) => {
        const fieldSetting: ConfigFieldSetting = {
          arguments: [],
          defaultImport: toBoolean(value.defaultImport) ? true : value.defaultImport,
          from: value.from,
          input: toBoolean(value.input),
          model: toBoolean(value.model),
          namespaceImport: value.namespaceImport,
          output: toBoolean(value.output),
        };
        return [name, fieldSetting];
      }),
  );

  const decorate: DecorateElement[] = [];
  const decorateConfig =
    config.decorate !== undefined && config.decorate !== null
      ? (config.decorate as Record<string, Record<string, string> | undefined>)
      : {};
  const configDecorate: Array<Record<string, string> | undefined> =
    Object.values(decorateConfig);

  for (const element of configDecorate) {
    if (element === undefined || element === null) {
      continue;
    }
    ok(
      element.from !== undefined &&
        element.from !== '' &&
        element.name !== undefined &&
        element.name !== '',
      `Missed 'from' or 'name' part in configuration for decorate`,
    );
    decorate.push({
      arguments:
        element.arguments !== undefined && element.arguments !== ''
          ? JSON5.parse(element.arguments)
          : undefined,
      defaultImport: toBoolean(element.defaultImport) ? true : element.defaultImport,
      from: element.from,
      isMatchField: outmatch(element.field, { separator: false }),
      isMatchType: outmatch(element.type, { separator: false }),
      name: element.name,
      namedImport: toBoolean(element.namedImport),
      namespaceImport: element.namespaceImport,
    });
  }

  const customImport: CustomImport[] = [];
  const customImportConfig =
    config.customImport !== undefined && config.customImport !== null
      ? (config.customImport as Record<string, Record<string, string> | undefined>)
      : {};
  const configCustomImport: Array<Record<string, string> | undefined> =
    Object.values(customImportConfig);
  for (const element of configCustomImport) {
    if (element === undefined || element === null) {
      continue;
    }
    ok(
      element.from !== undefined &&
        element.from !== '' &&
        element.name !== undefined &&
        element.name !== '',
      `Missed 'from' or 'name' part in configuration for customImport`,
    );
    customImport.push({
      defaultImport: toBoolean(element.defaultImport) ? true : element.defaultImport,
      from: element.from,
      name: element.name,
      namedImport: toBoolean(element.namedImport),
      namespaceImport: element.namespaceImport,
    });
  }
  return {
    $warnings,
    combineScalarFilters: toBoolean(config.combineScalarFilters),
    customImport,
    decorate,
    emitBlocks: createEmitBlocks(config.emitBlocks as EmitBlocksOption[]),
    emitCompiled: toBoolean(config.emitCompiled),
    emitSingle: toBoolean(config.emitSingle),
    esmCompatible: toBoolean(config.esmCompatible),
    fields,
    graphqlScalars: (config.graphqlScalars ?? {}) as Record<
      string,
      ImportNameSpec | undefined
    >,
    noAtomicOperations: toBoolean(config.noAtomicOperations),
    noTypeId: toBoolean(config.noTypeId),
    omitModelsCount: toBoolean(config.omitModelsCount),
    outputFilePattern,
    prismaClientImport: createPrismaImport(config.prismaClientImport),
    purgeOutput: toBoolean(config.purgeOutput),
    reExport: ReExport[String(config.reExport) as keyof typeof ReExport] ?? ReExport.None,
    requireSingleFieldsInWhereUniqueInput: toBoolean(
      config.requireSingleFieldsInWhereUniqueInput,
    ),
    tsConfigFilePath: createTsConfigFilePathValue(config.tsConfigFilePath),
    unsafeCompatibleWhereUniqueInput: toBoolean(config.unsafeCompatibleWhereUniqueInput),
    useInputType: createUseInputType(
      config.useInputType as Record<string, ConfigInputItem>,
    ),
  };
}

interface ConfigInputItem {
  typeName: string;
  ALL?: string;
  [index: string]: string | undefined;
}

type FileExistsFunction = (filePath: string) => boolean;
type ExistsSyncFunction = (path: string) => boolean;
const existsSyncTyped: ExistsSyncFunction = existsSync as ExistsSyncFunction;
const tsConfigFileExistsRaw: unknown = memoize((filePath: string): boolean => {
  const exists: boolean = existsSyncTyped(filePath);
  return exists;
});
const tsConfigFileExists: FileExistsFunction =
  tsConfigFileExistsRaw as FileExistsFunction;

function createTsConfigFilePathValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value !== '') {
    return value;
  }
  const fileExists: boolean = tsConfigFileExists('tsconfig.json');
  if (fileExists) {
    return 'tsconfig.json';
  }
  return undefined;
}

function createPrismaImport(value: unknown): string {
  if (typeof value === 'string' && value !== '') {
    return value;
  }
  return '@prisma/client';
}

function createUseInputType(data?: Record<string, ConfigInputItem>): ConfigInputItem[] {
  if (data === undefined || data === null) {
    return [];
  }
  const result: ConfigInputItem[] = [];
  for (const [typeName, useInputs] of Object.entries(data)) {
    const entry: ConfigInputItem = {
      ALL: undefined,
      typeName,
    };
    if (useInputs.ALL !== undefined && useInputs.ALL !== '') {
      entry.ALL = useInputs.ALL;
      delete useInputs.ALL;
    }

    for (const [propertyName, pattern] of Object.entries(useInputs)) {
      entry[propertyName] = pattern;
    }

    result.push(entry);
  }
  return result;
}

function toBoolean(value: unknown): boolean {
  return ['true', '1', 'on'].includes(String(value));
}
