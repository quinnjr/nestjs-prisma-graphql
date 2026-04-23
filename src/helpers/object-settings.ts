import type { GeneratorConfiguration } from '../types.js';
import type { PlainObject } from 'simplytyped';

import JSON5 from 'json5';
import { isObject, merge, omit, trim } from 'lodash-es';
import outmatch from 'outmatch';

export interface ObjectSetting {
  /**
   * Act as named import or namespaceImport or defaultImport
   */
  name: string;
  kind: 'Decorator' | 'Field' | 'FieldType' | 'PropertyType' | 'ObjectType';
  arguments?: string[] | Record<string, unknown>;
  input: boolean;
  output: boolean;
  model: boolean;
  match?: (test: string) => boolean;
  from: string;
  namespace?: string;
  defaultImport?: string | true;
  namespaceImport?: string;
  namedImport?: boolean;
}

interface ObjectSettingsFilterArgs {
  name: string;
  input?: boolean;
  output?: boolean;
}

export class ObjectSettings extends Array<ObjectSetting> {
  public shouldHideField({
    input = false,
    name,
    output = false,
  }: ObjectSettingsFilterArgs): boolean {
    const hideField = this.find(s => s.name === 'HideField');

    return Boolean(
      (hideField?.input && input) ||
      (hideField?.output && output) ||
      hideField?.match?.(name),
    );
  }

  public getFieldType({
    input,
    name,
    output,
  }: ObjectSettingsFilterArgs): ObjectSetting | undefined {
    const fieldType = this.find(s => s.kind === 'FieldType');

    if (!fieldType) {
      return undefined;
    }

    if (fieldType.match) {
      return fieldType.match(name) ? fieldType : undefined;
    }

    if (input && !fieldType.input) {
      return undefined;
    }

    if (output && !fieldType.output) {
      return undefined;
    }

    return fieldType;
  }

  public getPropertyType({
    input,
    name,
    output,
  }: ObjectSettingsFilterArgs): ObjectSetting | undefined {
    const propertyType = this.find(s => s.kind === 'PropertyType');

    if (!propertyType) {
      return undefined;
    }

    if (propertyType.match) {
      return propertyType.match(name) ? propertyType : undefined;
    }

    if (input && !propertyType.input) {
      return undefined;
    }

    if (output && !propertyType.output) {
      return undefined;
    }

    return propertyType;
  }

  public getObjectTypeArguments(options: Record<string, unknown>): string[] {
    const objectTypeOptions = merge({}, options);
    const resultArguments: unknown[] = [objectTypeOptions];
    const objectType = this.find(s => s.kind === 'ObjectType');
    if (objectType && isObject(objectType.arguments)) {
      const { name } = objectType.arguments as PlainObject;
      merge(objectTypeOptions, omit(objectType.arguments, 'name'));
      if (name !== null && name !== undefined && name !== '') {
        resultArguments.unshift(name);
      }
    }
    return resultArguments.map(x => JSON5.stringify(x));
  }

  public fieldArguments(): Record<string, unknown> | undefined {
    const fieldItem = this.find(item => item.kind === 'Field');
    if (fieldItem) {
      return fieldItem.arguments as Record<string, unknown>;
    }
    return undefined;
  }
}

export function createObjectSettings(args: {
  text: string;
  config: GeneratorConfiguration;
}): { documentation: string | undefined; settings: ObjectSettings } {
  const { config, text } = args;
  const result = new ObjectSettings();
  const textLines = text.split('\n');
  const documentationLines: string[] = [];

  let fieldElement = result.find(item => item.kind === 'Field');
  if (!fieldElement) {
    const newFieldElement: ObjectSetting = {
      arguments: {},
      from: '',
      input: false,
      kind: 'Field',
      model: false,
      name: '',
      output: false,
    };
    fieldElement = newFieldElement;
  }

  for (const line of textLines) {
    const match = /^@(?<name>\w+(\.(\w+))?)\((?<args>.*)\)/.exec(line);
    const { documentLine, element } = createSettingElement({
      config,
      fieldElement,
      line,
      match,
    });

    if (element) {
      result.push(element);
    }

    if (documentLine) {
      documentationLines.push(line);
    }
  }

  return {
    documentation: documentationLines.filter(Boolean).join('\n') || undefined,
    settings: result,
  };
}

function createSettingElement({
  config,
  fieldElement,
  line,
  match,
}: {
  line: string;
  config: GeneratorConfiguration;
  fieldElement: ObjectSetting;
  match: RegExpExecArray | null;
}): { documentLine: string; element: ObjectSetting | undefined } {
  const result = {
    documentLine: '',
    element: undefined as ObjectSetting | undefined,
  };
  if (line.startsWith('@deprecated')) {
    const DEPRECATED_PREFIX_LENGTH = 11;
    const updatedFieldElement = {
      ...fieldElement,
      arguments: {
        ...(fieldElement.arguments as Record<string, unknown>),
        deprecationReason: trim(line.slice(DEPRECATED_PREFIX_LENGTH)),
      },
    };

    result.element = updatedFieldElement;

    return result;
  }

  if (line.startsWith('@complexity')) {
    const COMPLEXITY_PREFIX_LENGTH = 11;
    const MIN_COMPLEXITY = 1;
    let n = Number.parseInt(trim(line.slice(COMPLEXITY_PREFIX_LENGTH)), 10);
    if (Number.isNaN(n) || n < MIN_COMPLEXITY) {
      n = MIN_COMPLEXITY;
    }
    const updatedFieldElement = {
      ...fieldElement,
      arguments: {
        ...(fieldElement.arguments as Record<string, unknown>),
        complexity: n,
      },
    };

    result.element = updatedFieldElement;

    return result;
  }

  const name = match?.groups?.name;

  if (!(match && name !== undefined && name !== '')) {
    result.documentLine = line;
    return result;
  }

  const element: ObjectSetting = {
    arguments: [],
    from: '',
    input: false,
    kind: 'Decorator',
    model: false,
    name: '',
    output: false,
  };

  result.element = element;

  if (name === 'TypeGraphQL.omit' || name === 'HideField') {
    Object.assign(element, hideFieldDecorator(match));

    return result;
  }

  if (
    ['FieldType', 'PropertyType'].includes(name) &&
    match.groups?.args !== undefined &&
    match.groups.args !== ''
  ) {
    const options = customType(match.groups.args);
    const namespaceConfig =
      options.namespace !== undefined && options.namespace !== ''
        ? config.fields[options.namespace]
        : undefined;
    merge(element, namespaceConfig, options, {
      kind: name,
    });
    return result;
  }

  if (
    name === 'ObjectType' &&
    match.groups?.args !== undefined &&
    match.groups.args !== ''
  ) {
    element.kind = 'ObjectType';
    const options = customType(match.groups.args) as Record<string, unknown>;
    if (typeof options[0] === 'string' && options[0] !== '') {
      options.name = options[0];
    }
    if (isObject(options[1])) {
      merge(options, options[1]);
    }
    element.arguments = {
      isAbstract: options.isAbstract,
      name: options.name,
    };

    return result;
  }

  if (
    name === 'Directive' &&
    match.groups?.args !== undefined &&
    match.groups.args !== ''
  ) {
    const options = customType(match.groups.args);
    merge(element, { from: '@nestjs/graphql', model: true }, options, {
      arguments: Array.isArray(options.arguments)
        ? options.arguments.map(s => JSON5.stringify(s))
        : options.arguments,
      kind: 'Decorator',
      name,
      namespace: false,
    });

    return result;
  }

  const namespace = getNamespace(name);
  element.namespaceImport = namespace;
  const args = match.groups?.args ?? '';
  const options = {
    arguments: args
      .split(',')
      .map(s => trim(s))
      .filter(Boolean),
    name,
  };
  const namespaceConfig =
    namespace !== undefined && namespace !== '' ? config.fields[namespace] : undefined;
  merge(element, namespaceConfig, options);

  return result;
}

function customType(args: string): Partial<ObjectSetting> {
  const result: Partial<ObjectSetting> = {};
  let options = parseArgs(args);
  if (typeof options === 'string') {
    options = { name: options };
  }
  Object.assign(result, options);
  const namespace = getNamespace(options.name);
  result.namespace = namespace;
  const optionsWithName = options as { name: string | undefined };
  if (
    optionsWithName.name !== undefined &&
    optionsWithName.name !== '' &&
    optionsWithName.name.includes('.')
  ) {
    result.namespaceImport = namespace;
  }

  if (typeof options.match === 'string' || Array.isArray(options.match)) {
    result.match = outmatch(options.match, { separator: false });
  }

  return result;
}

function hideFieldDecorator(match: RegExpExecArray): Partial<ObjectSetting> {
  const result: Partial<ObjectSetting> = {
    arguments: [],
    defaultImport: undefined,
    from: '@nestjs/graphql',
    match: undefined,
    name: 'HideField',
    namespaceImport: undefined,
  };
  const args = match.groups?.args;
  if (args === undefined || args === '') {
    result.output = true;
    return result;
  }

  if (args.includes('{') && args.includes('}')) {
    const options = parseArgs(args) as Record<string, unknown>;
    result.output = Boolean(options.output);
    result.input = Boolean(options.input);
    if (typeof options.match === 'string' || Array.isArray(options.match)) {
      result.match = outmatch(options.match, { separator: false });
    }
  } else {
    if (/output:\s*true/.test(args)) {
      result.output = true;
    }
    if (/input:\s*true/.test(args)) {
      result.input = true;
    }
  }

  return result;
}

function parseArgs(string: string): Record<string, unknown> | string {
  try {
    return JSON5.parse(string);
  } catch {
    try {
      return JSON5.parse(`[${string}]`);
    } catch {
      throw new Error(`Failed to parse: ${string}`);
    }
  }
}

function getNamespace(name: unknown): string | undefined {
  if (name === undefined || name === null) {
    return undefined;
  }
  if (typeof name !== 'string') {
    return undefined;
  }
  let result = name;
  if (result === '') {
    return undefined;
  }
  if (result.includes('.')) {
    const parts = result.split('.');
    result = parts[0] ?? '';
  }
  if (result === '') {
    return undefined;
  }
  return result;
}
