import type { FieldLocation } from '../types.js';

export function fileTypeByLocation(fieldLocation: FieldLocation): string {
  switch (fieldLocation) {
    case 'inputObjectTypes': {
      return 'input';
    }
    case 'outputObjectTypes': {
      return 'output';
    }
    case 'enumTypes': {
      return 'enum';
    }
    case 'fieldRefTypes':
    case 'scalar':
    default: {
      return 'object';
    }
  }
}
