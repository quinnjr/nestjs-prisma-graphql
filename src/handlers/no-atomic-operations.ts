import type { EventArguments, EventEmitter, InputType } from '../types.js';

export function noAtomicOperations(eventEmitter: EventEmitter): void {
  eventEmitter.on('BeforeInputType', beforeInputType);
  eventEmitter.on('BeforeGenerateFiles', beforeGenerateFiles);
}

function beforeInputType(args: EventArguments & { inputType: InputType }): void {
  const { getModelName, inputType } = args;

  for (const field of inputType.fields) {
    const fieldName = field.name;
    field.inputTypes = field.inputTypes.filter(it => {
      const inputTypeName = it.type;
      const modelName = getModelName(inputTypeName);

      const isModelNameValid =
        modelName !== null && modelName !== undefined && modelName.length > 0;
      if (
        isAtomicOperation(inputTypeName) ||
        (isModelNameValid && isListInput(inputTypeName, modelName, fieldName))
      ) {
        return false;
      }
      return true;
    });
  }
}

function beforeGenerateFiles(args: EventArguments): void {
  const { project } = args;

  for (const sourceFile of project.getSourceFiles()) {
    const className = sourceFile.getClass(() => true)?.getName();

    const isClassNameValid =
      className !== undefined && className !== null && className.length > 0;
    if (isClassNameValid && isAtomicOperation(className)) {
      project.removeSourceFile(sourceFile);
    }
  }
}

function isAtomicOperation(typeName: string): boolean {
  if (typeName.endsWith('FieldUpdateOperationsInput')) {
    return true;
  }
  return false;
}

function isListInput(typeName: string, model: string, field: string): boolean {
  return (
    typeName === `${model}Create${field}Input` ||
    typeName === `${model}Update${field}Input`
  );
}
