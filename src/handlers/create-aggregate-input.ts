import type { EventArguments, InputType, OutputType } from '../types.js';

/**
 * Create aggregate inputs from aggregate outputs.
 * See client/src/generation/TSClient.ts @ getAggregationTypes
 * Subscribes on: 'AggregateOutput'
 */
export function createAggregateInput(
  args: EventArguments & { outputType: OutputType },
): void {
  const { eventEmitter, outputType } = args;
  const className = `${outputType.name}Input`;

  const inputType: InputType = {
    constraints: { maxNumFields: null, minNumFields: null },
    fields: outputType.fields.map(x => ({
      inputTypes: [
        {
          isList: false,
          location: 'scalar',
          type: 'true',
        },
      ],
      isNullable: x.isNullable ?? true,
      isRequired: false,
      isParameterizable: false,
      name: x.name,
    })),
    name: className,
  };

  eventEmitter.emitSync('InputType', {
    ...args,
    classDecoratorName: 'InputType',
    fileType: 'input',
    inputType,
  });
}
