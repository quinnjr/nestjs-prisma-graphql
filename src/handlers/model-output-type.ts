import type { EventArguments, OutputType } from '../types.js';
import type { PlainObject } from 'simplytyped';

import JSON5 from 'json5';
import { castArray } from 'lodash-es';
import pupa from 'pupa';
import {
  type ClassDeclarationStructure,
  type ExportSpecifierStructure,
  type StatementStructures,
  StructureKind,
} from 'ts-morph';

import { createComment } from '../helpers/create-comment.js';
import { hasCircularDependency } from '../helpers/detect-circular-deps.js';
import { getGraphqlImport } from '../helpers/get-graphql-import.js';
import { getOutputTypeName } from '../helpers/get-output-type-name.js';
import { getPropertyType } from '../helpers/get-property-type.js';
import { ImportDeclarationMap } from '../helpers/import-declaration-map.js';
import { isManyAndReturnOutputType } from '../helpers/is-many-and-return.js';
import {
  createObjectSettings,
  type ObjectSetting,
  type ObjectSettings,
} from '../helpers/object-settings.js';
import { propertyStructure } from '../helpers/property-structure.js';
import { relativePath } from '../helpers/relative-path.js';
import { ok } from '../helpers/type-safe-assert.js';

const nestjsGraphql = '@nestjs/graphql';

export function modelOutputType(outputType: OutputType, args: EventArguments): void {
  const {
    circularDependencies,
    config,
    eventEmitter,
    fieldSettings,
    getSourceFile,
    modelFields,
    models,
    output,
  } = args;

  if (isManyAndReturnOutputType(outputType.name)) {
    return;
  }

  const model = models.get(outputType.name);
  ok(model, `Cannot find model by name ${outputType.name}`);

  const sourceFile = getSourceFile({
    name: outputType.name,
    type: 'model',
  });
  const sourceFileStructure = sourceFile.getStructure();
  const exportDeclaration = getExportDeclaration(
    model.name,
    sourceFileStructure.statements as StatementStructures[],
  );
  const importDeclarations = new ImportDeclarationMap();
  const classStructure: ClassDeclarationStructure = {
    decorators: [
      {
        arguments: [],
        name: 'ObjectType',
      },
    ],
    isExported: true,
    kind: StructureKind.Class,
    name: outputType.name,
    properties: [],
  };
  (sourceFileStructure.statements as StatementStructures[]).push(classStructure);
  ok(classStructure.decorators, 'classStructure.decorators is undefined');
  const decorator = classStructure.decorators.find(d => d.name === 'ObjectType');
  ok(decorator, 'ObjectType decorator not found');

  let modelSettings: ObjectSettings | undefined;
  // Get model settings from documentation
  if (
    model.documentation !== null &&
    model.documentation !== undefined &&
    model.documentation.length > 0
  ) {
    const objectTypeOptions: PlainObject = {};
    const { documentation, settings } = createObjectSettings({
      config,
      text: model.documentation,
    });
    if (documentation !== undefined && documentation.length > 0) {
      classStructure.leadingTrivia ??= createComment(documentation);
      objectTypeOptions.description = documentation;
    }
    decorator.arguments = settings.getObjectTypeArguments(objectTypeOptions);
    modelSettings = settings;
  }

  importDeclarations.add('Field', nestjsGraphql);
  importDeclarations.add('ObjectType', nestjsGraphql);

  // Track types that need lazy loading due to circular dependencies
  const lazyTypes = new Set<string>();

  // Add type registry imports if ESM compatible mode is enabled
  if (config.esmCompatible) {
    let typeRegistryPath = relativePath(
      sourceFile.getFilePath(),
      `${output}/type-registry.ts`,
    );
    // Add .js extension for ESM module resolution
    if (!typeRegistryPath.endsWith('.js')) {
      typeRegistryPath += '.js';
    }
    importDeclarations.add('registerType', typeRegistryPath);
    importDeclarations.add('getType', typeRegistryPath);
  }

  for (const field of outputType.fields) {
    if (config.omitModelsCount && field.name === '_count') {
      continue;
    }

    let fileType = 'model';
    const { isList, location, namespace, type } = field.outputType;

    let outputTypeName = type;
    if (namespace !== 'model') {
      fileType = 'output';
      outputTypeName = getOutputTypeName(outputTypeName);
    }
    const modelField = modelFields.get(model.name)?.get(field.name);
    const settings = fieldSettings.get(model.name)?.get(field.name);
    const fieldType = settings?.getFieldType({
      name: outputType.name,
      output: true,
    });
    const propertySettings = settings?.getPropertyType({
      name: outputType.name,
      output: true,
    });

    const propertyType = castArray(
      propertySettings?.name ??
        getPropertyType({
          location,
          type: outputTypeName,
        }),
    );

    // For model we keep only one type
    propertyType.splice(1, propertyType.length);

    if (field.isNullable === true && !isList) {
      propertyType.push('null');
    }

    let graphqlType: string;
    let useGetType = false;

    if (fieldType === undefined) {
      const graphqlImport = getGraphqlImport({
        config,
        fileType,
        getSourceFile,
        isId: modelField?.isId,
        location,
        noTypeId: config.noTypeId,
        sourceFile,
        typeName: outputTypeName,
      });

      graphqlType = graphqlImport.name;

      if (
        graphqlImport.name !== outputType.name &&
        graphqlImport.specifier !== null &&
        graphqlImport.specifier !== undefined &&
        graphqlImport.specifier.length > 0
      ) {
        // Check for circular dependency in ESM mode
        const isCircular =
          config.esmCompatible &&
          location === 'outputObjectTypes' &&
          namespace === 'model' &&
          hasCircularDependency(circularDependencies, outputType.name, outputTypeName);

        if (isCircular) {
          // Use regular import (not type-only) so registerType() executes
          importDeclarations.add(graphqlImport.name, graphqlImport.specifier);
          lazyTypes.add(graphqlImport.name);
          useGetType = true;
        } else {
          importDeclarations.add(graphqlImport.name, graphqlImport.specifier);
        }
      }
    } else {
      graphqlType = fieldType.name;
      importDeclarations.create({ ...fieldType });
    }

    const property = propertyStructure({
      hasExclamationToken: true,
      hasQuestionToken: location === 'outputObjectTypes',
      isList,
      isNullable: field.isNullable,
      name: field.name,
      propertyType,
    });

    if (
      typeof property.leadingTrivia === 'string' &&
      modelField?.documentation !== null &&
      modelField?.documentation !== undefined &&
      modelField.documentation.length > 0
    ) {
      property.leadingTrivia += createComment(modelField.documentation, settings);
    }

    if (classStructure.properties !== undefined) {
      classStructure.properties.push(property);
    }

    if (propertySettings !== undefined) {
      importDeclarations.create({ ...propertySettings });
    } else if (propertyType.some(p => p.includes('Prisma.Decimal'))) {
      importDeclarations.add('Prisma', config.prismaClientImport);
    }

    ok(property.decorators !== undefined, 'property.decorators is undefined');

    const shouldHideField =
      settings?.shouldHideField({ name: outputType.name, output: true }) === true ||
      config.decorate.some(
        d =>
          d.name === 'HideField' &&
          d.from === '@nestjs/graphql' &&
          d.isMatchField(field.name) &&
          d.isMatchType(outputTypeName),
      );

    if (shouldHideField) {
      importDeclarations.add('HideField', nestjsGraphql);
      property.decorators.push({ arguments: [], name: 'HideField' });
    } else {
      // Generate `@Field()` decorator
      let typeExpression: string;
      if (useGetType) {
        typeExpression = isList
          ? `() => [getType('${graphqlType}')]`
          : `() => getType('${graphqlType}')`;
      } else {
        typeExpression = isList ? `() => [${graphqlType}]` : `() => ${graphqlType}`;
      }

      property.decorators.push({
        arguments: [
          typeExpression,
          JSON5.stringify({
            ...settings?.fieldArguments(),
            defaultValue: ['number', 'string', 'boolean'].includes(
              typeof modelField?.default,
            )
              ? modelField?.default
              : undefined,
            description:
              modelField?.documentation !== null &&
              modelField?.documentation !== undefined &&
              modelField.documentation !== ''
                ? modelField.documentation
                : undefined,
            nullable: Boolean(field.isNullable),
          }),
        ],
        name: 'Field',
      });

      for (const setting of settings ?? []) {
        if (shouldBeDecorated(setting) && (setting.match?.(field.name) ?? true)) {
          property.decorators.push({
            arguments: setting.arguments as string[],
            name: setting.name,
          });
          ok(
            setting.from && setting.from.length > 0,
            "Missed 'from' part in configuration or field setting",
          );
          importDeclarations.create(setting);
        }
      }

      for (const decorate of config.decorate) {
        if (decorate.isMatchField(field.name) && decorate.isMatchType(outputTypeName)) {
          property.decorators.push({
            arguments: decorate.arguments?.map(x => pupa(x, { propertyType })),
            name: decorate.name,
          });
          importDeclarations.create(decorate);
        }
      }
    }

    eventEmitter.emitSync('ClassProperty', property, {
      isList,
      location,
      propertyType,
    });
  }

  // Generate class decorators from model settings
  for (const setting of modelSettings ?? []) {
    if (shouldBeDecorated(setting)) {
      classStructure.decorators.push({
        arguments: setting.arguments as string[],
        name: setting.name,
      });
      importDeclarations.create(setting);
    }
  }

  // Build statements array
  const statements: Array<StatementStructures | string> = [
    ...importDeclarations.toStatements(),
    classStructure,
  ];

  // Add registerType call if ESM compatible mode is enabled
  if (config.esmCompatible) {
    statements.push(`\nregisterType('${outputType.name}', ${outputType.name});`);
  }

  if (exportDeclaration) {
    sourceFile.set({
      statements: [exportDeclaration, '\n', classStructure],
    });
    const classDeclaration = sourceFile.getClassOrThrow(model.name);
    const commentedText = classDeclaration
      .getText()
      .split('\n')
      .map(x => `// ${x}`);
    classDeclaration.remove();
    sourceFile.addStatements(['\n', ...commentedText]);
  } else {
    sourceFile.set({
      statements,
    });
  }
}

function shouldBeDecorated(setting: ObjectSetting): boolean {
  return (
    setting.kind === 'Decorator' &&
    (setting.output || setting.model) &&
    !(setting.output && setting.model)
  );
}

function getExportDeclaration(
  name: string,
  statements: StatementStructures[],
): StatementStructures | undefined {
  return statements.find(structure => {
    return (
      structure.kind === StructureKind.ExportDeclaration &&
      (structure.namedExports as ExportSpecifierStructure[]).some(
        o => (o.alias ?? o.name) === name,
      )
    );
  });
}
