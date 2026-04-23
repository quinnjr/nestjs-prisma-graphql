import type { DMMF } from '../types.js';

export function getWhereUniqueAtLeastKeys(model: DMMF.Model): string[] {
  const names = model.fields
    .filter(field => field.isUnique || field.isId)
    .map(field => field.name);

  if (model.primaryKey) {
    names.push(createFieldName(model.primaryKey));
  }

  for (const uniqueIndex of model.uniqueIndexes) {
    names.push(createFieldName(uniqueIndex));
  }

  return names;
}

function createFieldName(args: {
  name?: string | null;
  fields: readonly string[];
}): string {
  const { fields, name } = args;

  return name !== null && name !== undefined && name.length > 0 ? name : fields.join('_');
}
