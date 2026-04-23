import type { EventArguments, InputType } from '../types.js';

import JSON5 from 'json5';
import { castArray } from 'lodash-es';
import pupa from 'pupa';
import {
  type ClassDeclarationStructure,
  type StatementStructures,
  StructureKind,
} from 'ts-morph';

import { BeforeGenerateField } from '../event-names.js';
import { getGraphqlImport } from '../helpers/get-graphql-import.js';
import { getGraphqlInputType } from '../helpers/get-graphql-input-type.js';
import { getPropertyType } from '../helpers/get-property-type.js';
import { getWhereUniqueAtLeastKeys } from '../helpers/get-where-unique-at-least-keys.js';
import { ImportDeclarationMap } from '../helpers/import-declaration-map.js';
import { isWhereUniqueInputType } from '../helpers/is-where-unique-input-type.js';
import { propertyStructure } from '../helpers/property-structure.js';
import { relativePath } from '../helpers/relative-path.js';
import { ok } from '../helpers/type-safe-assert.js';

export function inputType(
  args: EventArguments & {
    inputType: InputType;
    fileType: string;
    classDecoratorName: string;
  },
): void {
  const {
    classDecoratorName,
    classTransformerTypeModels,
    config,
    eventEmitter,
    fieldSettings,
    fileType,
    getModelName,
    getSourceFile,
    inputType: inputTypeArg,
    models,
    output,
    removeTypes,
    typeNames,
  } = args;

  typeNames.add(inputTypeArg.name);

  const importDeclarations = new ImportDeclarationMap();
  const sourceFile = getSourceFile({
    name: inputTypeArg.name,
    type: fileType,
  });
  const classStructure: ClassDeclarationStructure = {
    decorators: [
      {
        arguments: [],
        name: classDecoratorName,
      },
    ],
    isExported: true,
    kind: StructureKind.Class,
    name: inputTypeArg.name,
    properties: [],
  };
  const modelName = getModelName(inputTypeArg.name) ?? '';
  const model = models.get(modelName);
  const modelFieldSettings = model && fieldSettings.get(model.name);
  const moduleSpecifier = '@nestjs/graphql';

  // Track types that need lazy loading due to circular dependencies
  const lazyTypes = new Set<string>();

  importDeclarations
    .set('Field', {
      moduleSpecifier,
      namedImports: [{ name: 'Field' }],
    })
    .set(classDecoratorName, {
      moduleSpecifier,
      namedImports: [{ name: classDecoratorName }],
    });

  // Add type registry imports if ESM compatible mode is enabled
  if (config.esmCompatible) {
    const typeRegistryPath = relativePath(
      sourceFile.getFilePath(),
      `${output}/type-registry.ts`,
    );
    importDeclarations.add('registerType', typeRegistryPath);
    importDeclarations.add('getType', typeRegistryPath);
  }

  const useInputType = config.useInputType.find(x =>
    inputTypeArg.name.includes(x.typeName),
  );
  const isWhereUnique = isWhereUniqueInputType(inputTypeArg.name);

  for (const field of inputTypeArg.fields) {
    field.inputTypes = field.inputTypes.filter(t => !removeTypes.has(t.type));

    eventEmitter.emitSync(BeforeGenerateField, field, args);

    const { inputTypes, isRequired, name } = field;

    if (inputTypes.length === 0) {
      continue;
    }

    const usePattern = useInputType?.ALL ?? useInputType?.[name];
    const graphqlInputType = getGraphqlInputType(inputTypes, usePattern);
    const { isList, location, type } = graphqlInputType;
    const typeName = type;
    const settings = modelFieldSettings?.get(name);
    const propertySettings = settings?.getPropertyType({
      input: true,
      name: inputTypeArg.name,
    });
    const modelField = model?.fields.find(f => f.name === name);
    const isCustomsApplicable = typeName === modelField?.type;
    const atLeastKeys = model && getWhereUniqueAtLeastKeys(model);
    const whereUniqueInputTypeValue =
      isWhereUniqueInputType(typeName) &&
      atLeastKeys &&
      `Prisma.AtLeast<${typeName}, ${atLeastKeys.map(n => `'${n}'`).join(' | ')}>`;

    const propertyType = castArray(
      propertySettings?.name ??
        whereUniqueInputTypeValue ??
        getPropertyType({
          location,
          type: typeName,
        }),
    );

    const hasExclamationToken = Boolean(
      isWhereUnique &&
      config.unsafeCompatibleWhereUniqueInput &&
      atLeastKeys?.includes(name),
    );
    const property = propertyStructure({
      hasExclamationToken: hasExclamationToken || undefined,
      hasQuestionToken: hasExclamationToken ? false : undefined,
      isList,
      isNullable: !isRequired,
      name,
      propertyType,
    });

    if (classStructure.properties) {
      classStructure.properties.push(property);
    }

    if (propertySettings) {
      importDeclarations.create({ ...propertySettings });
    } else if (propertyType.some((p: string) => p.includes('Prisma.Decimal'))) {
      importDeclarations.add('Prisma', config.prismaClientImport);
    } else if (propertyType.some((p: string) => p.startsWith('Prisma.'))) {
      importDeclarations.add('Prisma', config.prismaClientImport);
    }

    // Get graphql type
    let graphqlType: string;
    let useGetType = false;
    const shouldHideField =
      settings?.shouldHideField({
        input: true,
        name: inputTypeArg.name,
      }) ??
      config.decorate.some(
        d =>
          d.name === 'HideField' &&
          d.from === moduleSpecifier &&
          d.isMatchField(name) &&
          d.isMatchType(inputTypeArg.name),
      );

    const fieldType = settings?.getFieldType({
      input: true,
      name: inputTypeArg.name,
    });

    if (fieldType && isCustomsApplicable && !shouldHideField) {
      graphqlType = fieldType.name;
      importDeclarations.create({ ...fieldType });
    } else {
      // Import property type class
      const graphqlImport = getGraphqlImport({
        config,
        getSourceFile,
        location,
        sourceFile,
        typeName,
      });

      graphqlType = graphqlImport.name;
      // Extract the actual type name from complex property types like "typeof X | Y"
      if (location === 'enumTypes') {
        const parts = String(propertyType[0]).split(' ');
        const lastPart = parts.at(-1);
        if (lastPart !== undefined) {
          // Use lastPart for enum type resolution
          void lastPart;
        }
      }

      // In ESM mode, always use getType() for input object types
      const shouldUseLazyType = config.esmCompatible && location === 'inputObjectTypes';

      // Handle self-references
      if (graphqlImport.name === inputTypeArg.name && shouldUseLazyType) {
        lazyTypes.add(graphqlImport.name);
        useGetType = true;
      } else if (
        graphqlImport.specifier !== null &&
        graphqlImport.specifier !== undefined &&
        !importDeclarations.has(graphqlImport.name) &&
        graphqlImport.name !== inputTypeArg.name
      ) {
        if (shouldUseLazyType) {
          importDeclarations.addType(graphqlImport.name, graphqlImport.specifier);
          lazyTypes.add(graphqlImport.name);
        } else {
          importDeclarations.set(graphqlImport.name, {
            moduleSpecifier: graphqlImport.specifier,
            namedImports: [{ name: graphqlImport.name }],
          });
        }
      }

      // Check if this type should use lazy loading
      if (lazyTypes.has(graphqlImport.name)) {
        useGetType = true;
      }
    }

    ok(
      property.decorators !== undefined && property.decorators !== null,
      'property.decorators is undefined',
    );

    if (shouldHideField) {
      importDeclarations.add('HideField', moduleSpecifier);
      property.decorators.push({ arguments: [], name: 'HideField' });
    } else {
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
            nullable: !isRequired,
          }),
        ],
        name: 'Field',
      });

      if (graphqlType === 'GraphQLDecimal') {
        // Import from generated decimal-helpers.ts instead of prisma-graphql-type-decimal
        // This provides Prisma 7+ compatibility
        const decimalHelpersPath = relativePath(
          sourceFile.getFilePath(),
          `${output}/decimal-helpers.ts`,
        );
        importDeclarations.add('transformToDecimal', decimalHelpersPath);
        importDeclarations.add('Transform', 'class-transformer');
        importDeclarations.add('Type', 'class-transformer');

        property.decorators.push(
          {
            arguments: ['() => Object'],
            name: 'Type',
          },
          {
            arguments: ['transformToDecimal'],
            name: 'Transform',
          },
        );
      } else if (
        location === 'inputObjectTypes' &&
        (modelField?.type === 'Decimal' ||
          [
            'connect',
            'connectOrCreate',
            'create',
            'createMany',
            'data',
            'delete',
            'deleteMany',
            'disconnect',
            'set',
            'update',
            'updateMany',
            'upsert',
            'where',
          ].includes(name) ||
          classTransformerTypeModels.has(getModelName(graphqlType) ?? '') ||
          (modelField?.kind === 'object' &&
            models
              .get(modelField.type)
              ?.fields.some(
                f => f.kind === 'object' && classTransformerTypeModels.has(f.type),
              ) === true))
      ) {
        importDeclarations.add('Type', 'class-transformer');
        if (useGetType) {
          property.decorators.push({
            arguments: [`getType('${graphqlType}')`],
            name: 'Type',
          });
        } else {
          property.decorators.push({ arguments: [`() => ${graphqlType}`], name: 'Type' });
        }
      }

      if (isCustomsApplicable) {
        for (const options of settings ?? []) {
          if (
            (options.kind === 'Decorator' && options.input && options.match?.(name)) ??
            true
          ) {
            property.decorators.push({
              arguments: options.arguments as string[],
              name: options.name,
            });
            ok(
              options.from !== undefined && options.from !== null && options.from !== '',
              "Missed 'from' part in configuration or field setting",
            );
            importDeclarations.create(options);
          }
        }
      }

      for (const decorate of config.decorate) {
        if (decorate.isMatchField(name) && decorate.isMatchType(inputTypeArg.name)) {
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

  // Build statements array
  const statements: Array<StatementStructures | string> = [
    ...importDeclarations.toStatements(),
    classStructure,
  ];

  // Add registerType call if ESM compatible mode is enabled
  if (config.esmCompatible) {
    statements.push(`\nregisterType('${inputTypeArg.name}', ${inputTypeArg.name});`);
  }

  sourceFile.set({
    statements,
  });
}
