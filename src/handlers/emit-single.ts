import type { DMMF, EventEmitter } from '../types.js';
import type { PropertyDeclarationStructure } from 'ts-morph';

import { partition } from 'lodash-es';

export function emitSingle(emitter: EventEmitter): void {
  emitter.on('ClassProperty', classProperty);
}

function classProperty(
  property: PropertyDeclarationStructure,
  eventArguments: {
    location: DMMF.FieldLocation;
    isList: boolean;
    propertyType: string[];
  },
): void {
  const { isList, location, propertyType } = eventArguments;
  if (['inputObjectTypes', 'outputObjectTypes'].includes(location) && !isList) {
    const [safeTypes, instanceofTypes] = partition(
      propertyType,
      t => t === 'null' || t.startsWith('Prisma.'),
    );
    const mappedInstanceofTypes = instanceofTypes.map(t => `InstanceType<typeof ${t}>`);

    // eslint-disable-next-line no-param-reassign
    property.type = [...mappedInstanceofTypes, ...safeTypes].join(' | ');
  }
}
