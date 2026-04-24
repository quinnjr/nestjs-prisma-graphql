type EmittedBlockType =
  | 'prismaEnums'
  | 'schemaEnums'
  | 'models'
  | 'inputs'
  | 'args'
  | 'outputs';

export type EmitBlocksOption = 'enums' | 'models' | 'inputs' | 'args' | 'outputs';

const allEmmittedBlocks: EmittedBlockType[] = [
  'prismaEnums',
  'schemaEnums',
  'models',
  'inputs',
  'args',
  'outputs',
];

const blocksDependencyMap: Record<EmitBlocksOption, EmittedBlockType[]> = {
  args: ['args', 'inputs', 'prismaEnums'],
  enums: ['schemaEnums', 'prismaEnums'],
  inputs: ['inputs', 'prismaEnums'],
  models: ['models', 'schemaEnums'],
  outputs: ['outputs'],
};

export function createEmitBlocks(data?: string[]): Record<EmittedBlockType, boolean> {
  if (!data) {
    const entries = allEmmittedBlocks.map(block => [block, true] as const);
    const allBlocks = Object.fromEntries(entries) as Record<EmittedBlockType, boolean>;
    return allBlocks;
  }

  const initialBlocks: Record<EmittedBlockType, boolean> = {} as Record<EmittedBlockType, boolean>;
  let currentBlocks = initialBlocks;

  for (const block of data) {
    if (!Object.keys(blocksDependencyMap).includes(block)) {
      continue;
    }

    const blockEntries = blocksDependencyMap[block as EmitBlocksOption].map(
      emittedBlock => [emittedBlock, true] as const,
    );
    const newBlocks = Object.fromEntries(blockEntries) as Record<
      EmittedBlockType,
      boolean
    >;
    currentBlocks = {
      ...currentBlocks,
      ...newBlocks,
    };
  }

  return currentBlocks;
}
