import type { createConfig } from './helpers/create-config.js';
import type { ObjectSettings } from './helpers/object-settings.js';
import type { DMMF } from '@prisma/generator-helper';
import type { Project, SourceFile } from 'ts-morph';
import type { WritableDeep } from 'type-fest';

/**
 * Event emitter interface for type safety across ESM modules
 */
export interface EventEmitter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on: (type: string | symbol, fn: (...args: any[]) => any) => this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  once: (type: string | symbol, fn: (...args: any[]) => any) => this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off: (type: string | symbol, nullOrFn?: (...args: any[]) => any) => boolean;
  emit: (type: string | symbol, ...args: unknown[]) => Promise<boolean>;
  emitSync: (type: string | symbol, ...args: unknown[]) => boolean;
  removeAllListeners: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listeners: (type: string | symbol) => Array<(...args: any[]) => any>;
}

export type InputType = WritableDeep<DMMF.InputType>;
export type FieldLocation = DMMF.FieldLocation;
export type OutputType = WritableDeep<DMMF.OutputType>;
export type SchemaField = WritableDeep<DMMF.SchemaField>;
export type SchemaEnum = WritableDeep<DMMF.SchemaEnum>;
export type Model = WritableDeep<DMMF.Model>;
export type SchemaArg = WritableDeep<DMMF.SchemaArg>;
export type Schema = WritableDeep<DMMF.Schema>;
export type Document = WritableDeep<DMMF.Document>;

export type FieldOutputType = SchemaField['outputType'];

export type TypeRecord = Partial<{
  /**
   * TypeScript field/property type
   */
  fieldType: string;
  fieldModule: string;
  graphqlType: string;
  graphqlModule: string;
}>;

export type GeneratorConfiguration = ReturnType<typeof createConfig>;

export interface EventArguments {
  schema: Schema;
  models: Map<string, Model>;
  modelNames: string[];
  modelFields: Map<string, Map<string, Field>>;
  fieldSettings: Map<string, Map<string, ObjectSettings>>;
  config: GeneratorConfiguration;
  project: Project;
  output: string;
  getSourceFile: (args: { type: string; name: string }) => SourceFile;
  eventEmitter: EventEmitter;
  typeNames: Set<string>;
  removeTypes: Set<string>;
  enums: Record<string, DMMF.DatamodelEnum | undefined>;
  getModelName: (name: string) => string | undefined;
  /**
   * Input types for this models should be decorated @Type(() => Self)
   */
  classTransformerTypeModels: Set<string>;
  /**
   * Set of model pairs that have circular dependencies (for ESM compatibility)
   * Format: "ModelA:ModelB" where ModelA < ModelB alphabetically
   */
  circularDependencies: Set<string>;
}

export interface ImportNameSpec {
  name: string;
  specifier?: string;
}

export type Field = DMMF.Field;

export type { ObjectSetting, ObjectSettings } from './helpers/object-settings.js';
export type { DMMF } from '@prisma/generator-helper';
