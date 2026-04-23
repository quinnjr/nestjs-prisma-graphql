import { memoize } from 'lodash-es';

const splitKeywords = [
  'CreateInput',
  'CreateMany',
  'CreateNested',
  'CreateOneWithout',
  'CreateOrConnect',
  'CreateWithout',
  'DistinctField',
  'Filter',
  'ManyWithout',
  'OrderByInput',
  'RelationFilter',
  'NullableRelationFilter',
  'ListRelationFilter',
  'ScalarWhereInput',
  'UpdateInput',
  'UpdateMany',
  'UpdateOneRequiredWithout',
  'UpdateOneWithout',
  'UpdateWith',
  'UpsertWith',
  'UpsertWithout',
  'WhereInput',
  'WhereUniqueInput',
  'AvgAggregate',
  'SumAggregate',
  'MinAggregate',
  'MaxAggregate',
  'CountAggregate',
  'ScalarField',
  'GroupBy',
  'OrderBy',
  'UncheckedUpdate',
  'UncheckedCreate',
  'ScalarWhere',
  'CountOutputType',
  'CountOrderBy',
  'SumOrderBy',
  'MinOrderBy',
  'MaxOrderBy',
  'AvgOrderBy',
  'Create',
  'Update',
  'ScalarRelationFilter',
  'NullableScalarRelationFilter',
].sort((a, b) => b.length - a.length);

const endsWithKeywords = [
  'Aggregate',
  'GroupBy',
  'CreateOne',
  'CreateMany',
  'DeleteMany',
  'DeleteOne',
  'FindMany',
  'FindOne',
  'FindUnique',
  'UpdateMany',
  'UpdateOne',
  'UpsertOne',
];

const middleKeywords = [
  ['FindFirst', 'OrThrowArgs'],
  ['FindUnique', 'OrThrowArgs'],
  ['Aggregate', 'Args'],
  ['CreateOne', 'Args'],
  ['CreateMany', 'Args'],
  ['DeleteMany', 'Args'],
  ['DeleteOne', 'Args'],
  ['FindMany', 'Args'],
  ['FindFirst', 'Args'],
  ['FindOne', 'Args'],
  ['FindUnique', 'Args'],
  ['UpdateMany', 'Args'],
  ['UpdateMany', 'AndReturnOutputType'],
  ['UpdateOne', 'Args'],
  ['UpsertOne', 'Args'],
  ['GroupBy', 'Args'],
  ['OrderBy', 'Args'],
];

export function createGetModelName(
  modelNames: string[],
): (name: string) => string | undefined {
  return memoize(tryGetName);

  function tryGetName(name: string): string | undefined {
    return getModelName({ modelNames, name });
  }
}

function getModelName(args: { name: string; modelNames: string[] }): string | undefined {
  const { modelNames, name } = args;
  for (const keyword of splitKeywords) {
    const [test] = name.split(keyword, 1);
    if (test !== undefined && modelNames.includes(test)) {
      return test;
    }
  }
  for (const keyword of endsWithKeywords) {
    const test = name.split(keyword).at(-1);
    if (test !== undefined && modelNames.includes(test)) {
      return test;
    }
  }
  for (const [start, end] of middleKeywords) {
    let test = name.slice(start.length).slice(0, -end.length);
    if (modelNames.includes(test) && name.startsWith(start) && name.endsWith(end)) {
      return test;
    }
    test = name.slice(0, -(start + end).length);
    if (modelNames.includes(test) && name.endsWith(start + end)) {
      return test;
    }
  }

  // test for {Model}{UniqueName}CompoundUniqueInput
  const COMPOUND_UNIQUE_INPUT_LENGTH = 19;
  if (name.endsWith('CompoundUniqueInput')) {
    const test = name.slice(0, -COMPOUND_UNIQUE_INPUT_LENGTH);
    const models = modelNames
      .filter(x => test.startsWith(x))
      .sort((a, b) => b.length - a.length);
    return models[0];
  }

  // test for {Model}Count
  const COUNT_SUFFIX_LENGTH = 5;
  if (name.endsWith('Count')) {
    const test = name.slice(0, -COUNT_SUFFIX_LENGTH);
    if (modelNames.includes(test)) {
      return test;
    }
  }

  return undefined;
}
