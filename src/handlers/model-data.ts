import type { EventArguments, Field, Model } from '../types.js';

import { createObjectSettings, type ObjectSettings } from '../helpers/object-settings.js';

export function modelData(model: Model, args: EventArguments): void {
  const {
    classTransformerTypeModels,
    config,
    fieldSettings,
    modelFields,
    modelNames,
    models,
  } = args;

  modelNames.push(model.name);
  models.set(model.name, model);

  const modelFieldsValue = new Map<string, Field>();
  modelFields.set(model.name, modelFieldsValue);

  const fieldSettingsValue = new Map<string, ObjectSettings>();
  fieldSettings.set(model.name, fieldSettingsValue);

  for (const field of model.fields) {
    if (
      field.documentation !== null &&
      field.documentation !== undefined &&
      field.documentation.length > 0
    ) {
      const { documentation, settings } = createObjectSettings({
        config,
        text: field.documentation,
      });
      field.documentation = documentation;
      fieldSettingsValue.set(field.name, settings);
    }
    modelFieldsValue.set(field.name, field);
  }

  if (model.fields.some(field => field.type === 'Decimal')) {
    classTransformerTypeModels.add(model.name);
  }
}
