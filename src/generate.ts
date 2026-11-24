import type { GeneratorOptions } from '@prisma/generator-helper';

import { mapKeys } from 'lodash-es';
import { createRequire } from 'node:module';
import { Project, QuoteKind } from 'ts-morph';

import { ok } from './helpers/type-safe-assert.js';

// Use createRequire for CommonJS module compatibility in ESM
// Type-safe wrapper for require to avoid 'any' type issues
type RequireFunction = (id: string) => unknown;
const createRequireTyped: (filename: string) => RequireFunction = createRequire as (
  filename: string,
) => RequireFunction;
const requireCjs: RequireFunction = createRequireTyped(import.meta.url);

// Type for await-event-emitter's default export
type AwaitEventEmitterConstructor = new () => EventEmitter;
interface AwaitEventEmitterModule {
  default: AwaitEventEmitterConstructor;
}
const AwaitEventEmitter: AwaitEventEmitterModule = requireCjs(
  'await-event-emitter',
) as AwaitEventEmitterModule;
const AwaitEventEmitterClass = AwaitEventEmitter.default;

import type {
  Document,
  EventArguments,
  EventEmitter,
  Field,
  Model,
  ObjectSettings,
  OutputType,
} from './types.js';

import { argsType } from './handlers/args-type.js';
import { combineScalarFilters } from './handlers/combine-scalar-filters.js';
import { createAggregateInput } from './handlers/create-aggregate-input.js';
import { generateDecimalHelpers } from './handlers/decimal-helpers.js';
import { emitSingle } from './handlers/emit-single.js';
import { generateBarrelExports } from './handlers/generate-barrel-exports.js';
import { generateFiles } from './handlers/generate-files.js';
import { inputType } from './handlers/input-type.js';
import { modelData } from './handlers/model-data.js';
import { modelOutputType } from './handlers/model-output-type.js';
import { noAtomicOperations } from './handlers/no-atomic-operations.js';
import { outputType } from './handlers/output-type.js';
import { postProcessImports } from './handlers/post-process-imports.js';
import { purgeOutput } from './handlers/purge-output.js';
import { ReExport, reExport } from './handlers/re-export.js';
import { registerEnum } from './handlers/register-enum.js';
import { announceTypeRegistryRemoval } from './handlers/removed-type-registry.js';
import { requireSingleFieldsInWhereUniqueInput } from './handlers/require-single-fields-in-whereunique-input.js';
import { suppressTypeErrors } from './handlers/suppress-type-errors.js';
import { warning } from './handlers/warning.js';
import { createConfig } from './helpers/create-config.js';
import {
  buildDependencyGraph,
  detectCircularDependencies,
} from './helpers/detect-circular-deps.js';
import { hasCustomEnumValues } from './helpers/enum-value-settings.js';
import {
  factoryGetSourceFile,
  getReservedRootFiles,
} from './helpers/factory-get-source-file.js';
import { createGetModelName } from './helpers/get-model-name.js';

export async function generate(
  args: GeneratorOptions & {
    skipAddOutputSourceFiles?: boolean;
    connectCallback?: (
      emitter: EventEmitter,
      eventArguments: EventArguments,
    ) => void | Promise<void>;
  },
): Promise<void> {
  const { connectCallback, dmmf, generator, skipAddOutputSourceFiles } = args;

  const generatorOutputValue = generator.output?.value ?? '';
  ok(generatorOutputValue !== '', 'Missing generator configuration: output');

  const config = createConfig(generator.config);

  const eventEmitter = new AwaitEventEmitterClass();
  eventEmitter.on('Warning', warning);
  if (config.emitBlocks.models) {
    eventEmitter.on('Model', modelData);
  }
  if (config.emitBlocks.prismaEnums || config.emitBlocks.schemaEnums) {
    eventEmitter.on('EnumType', registerEnum);
  }
  if (
    config.emitBlocks.outputs ||
    (config.emitBlocks.models && !config.omitModelsCount)
  ) {
    eventEmitter.on('OutputType', outputType);
  }
  if (config.emitBlocks.models) {
    eventEmitter.on('ModelOutputType', modelOutputType);
  }
  if (config.emitBlocks.outputs) {
    eventEmitter.on('AggregateOutput', createAggregateInput);
  }
  if (config.emitBlocks.inputs) {
    eventEmitter.on('InputType', inputType);
  }
  if (config.emitBlocks.args) {
    eventEmitter.on('ArgsType', argsType);
  }

  eventEmitter.on('GenerateFiles', generateFiles);

  for (const message of config.$warnings) {
    eventEmitter.emitSync('Warning', message);
  }

  const project = new Project({
    manipulationSettings: {
      quoteKind: QuoteKind.Single,
    },
    skipAddingFilesFromTsConfig: true,
    skipLoadingLibFiles: !config.emitCompiled,
    tsConfigFilePath: config.tsConfigFilePath,
  });

  if (skipAddOutputSourceFiles !== true) {
    project.addSourceFilesAtPaths([
      `${generatorOutputValue}/**/*.ts`,
      `!${generatorOutputValue}/**/*.d.ts`,
    ]);
  }

  if (config.combineScalarFilters) {
    combineScalarFilters(eventEmitter);
  }
  if (config.noAtomicOperations) {
    noAtomicOperations(eventEmitter);
  }
  if (config.reExport !== ReExport.None) {
    reExport(eventEmitter);
  }
  if (config.emitSingle) {
    emitSingle(eventEmitter);
  }
  if (config.purgeOutput) {
    purgeOutput(eventEmitter);
  }
  if (config.requireSingleFieldsInWhereUniqueInput) {
    requireSingleFieldsInWhereUniqueInput(eventEmitter);
  }

  const models = new Map<string, Model>();
  const modelNames: string[] = [];
  const modelFields = new Map<string, Map<string, Field>>();
  const fieldSettings = new Map<string, Map<string, ObjectSettings>>();
  const getModelName = createGetModelName(modelNames);
  const getSourceFile = factoryGetSourceFile({
    eventEmitter,
    getModelName,
    output: generatorOutputValue,
    outputFilePattern: config.outputFilePattern,
    project,
    reservedRootFiles: getReservedRootFiles(config),
  });
  const { datamodel, schema } = JSON.parse(JSON.stringify(dmmf)) as Document;
  const removeTypes = new Set<string>();

  // Build circular dependency detection for ESM compatibility
  const datamodelTypes: Model[] = datamodel.types ?? [];
  const allModels: Model[] = [...datamodel.models, ...datamodelTypes];
  const dependencyGraph = buildDependencyGraph(allModels);
  const circularDependencies = detectCircularDependencies(dependencyGraph);

  const eventArguments: EventArguments = {
    circularDependencies,
    classTransformerTypeModels: new Set(),
    config,
    customValueEnums: new Set(
      datamodel.enums.filter(hasCustomEnumValues).map(x => x.name),
    ),
    enums: mapKeys(datamodel.enums, x => x.name),
    eventEmitter,
    fieldSettings,
    getModelName,
    getSourceFile,
    modelFields,
    modelNames,
    models,
    output: generatorOutputValue,
    project,
    removeTypes,
    schema,
    typeNames: new Set<string>(),
  };

  if (connectCallback) {
    await connectCallback(eventEmitter, eventArguments);
  }

  await eventEmitter.emit('Begin', eventArguments);

  // 2.0: the ESM type registry is gone. Say so loudly and delete files left by 1.x,
  // so a stale register-all-types cannot keep an old import working.
  announceTypeRegistryRemoval(eventArguments);

  // Generate decimal helpers for Prisma 7+ compatibility
  // This replaces the dependency on prisma-graphql-type-decimal
  generateDecimalHelpers(eventArguments);

  for (const model of datamodel.models) {
    await eventEmitter.emit('Model', model, eventArguments);
  }

  // Types behaves like model
  for (const model of datamodelTypes) {
    await eventEmitter.emit('Model', model, eventArguments);
  }

  const { enumTypes, inputObjectTypes, outputObjectTypes } = schema;

  await eventEmitter.emit('PostBegin', eventArguments);

  for (const enumType of enumTypes.prisma.concat(enumTypes.model ?? [])) {
    await eventEmitter.emit('EnumType', enumType, eventArguments);
  }

  for (const outputTypeItem of outputObjectTypes.model) {
    await eventEmitter.emit('ModelOutputType', outputTypeItem, eventArguments);
  }

  const queryOutputTypes: OutputType[] = [];

  for (const outputTypeItem of outputObjectTypes.prisma) {
    if (['Query', 'Mutation'].includes(outputTypeItem.name)) {
      queryOutputTypes.push(outputTypeItem);
      continue;
    }
    await eventEmitter.emit('OutputType', outputTypeItem, eventArguments);
  }

  const inputTypes = (inputObjectTypes.prisma ?? []).concat(inputObjectTypes.model ?? []);

  for (const inputTypeItem of inputTypes) {
    const event = {
      ...eventArguments,
      classDecoratorName: 'InputType',
      fileType: 'input',
      inputType: inputTypeItem,
    };
    if (inputTypeItem.fields.length === 0) {
      removeTypes.add(inputTypeItem.name);
      continue;
    }
    await eventEmitter.emit('BeforeInputType', event);
    await eventEmitter.emit('InputType', event);
  }

  for (const outputTypeItem of queryOutputTypes) {
    for (const field of outputTypeItem.fields) {
      await eventEmitter.emit('ArgsType', field, eventArguments);
    }
  }

  await eventEmitter.emit('BeforeGenerateFiles', eventArguments);

  // Pre-save processing steps for ESM compatibility
  // Must run AFTER BeforeGenerateFiles, whose handlers (noAtomicOperations, reExport)
  // remove or add files, and BEFORE GenerateFiles so created files are included in the save
  if (config.esmCompatible) {
    // 1. Generate barrel exports (index.ts files) if reExport="None"
    generateBarrelExports(eventArguments);

    // 2. Add .js extensions to relative imports for ESM
    postProcessImports(eventArguments);

    // 3. Add // @ts-nocheck when esmSuppressTypeErrors is set
    suppressTypeErrors(eventArguments);
  }

  await eventEmitter.emit('GenerateFiles', eventArguments);
  await eventEmitter.emit('End', eventArguments);

  for (const name of Object.keys(
    (eventEmitter as unknown as { _events: Record<string, unknown> })._events,
  )) {
    eventEmitter.off(name);
  }
}
