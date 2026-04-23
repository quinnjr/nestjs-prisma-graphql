import {
  type ImportDeclarationStructure,
  type ImportSpecifierStructure,
  type OptionalKind,
  StructureKind,
} from 'ts-morph';

export class ImportDeclarationMap extends Map<
  string,
  OptionalKind<ImportDeclarationStructure>
> {
  public add(name: string, moduleSpecifier: string, isTypeOnly?: boolean): void;
  public add(name: string, value: OptionalKind<ImportDeclarationStructure>): void;

  public add(
    name: string,
    value: OptionalKind<ImportDeclarationStructure> | string,
    isTypeOnly?: boolean,
  ): void {
    if (!this.has(name)) {
      const structure: OptionalKind<ImportDeclarationStructure> =
        typeof value === 'string'
          ? { isTypeOnly, moduleSpecifier: value, namedImports: [{ name }] }
          : value;
      this.set(name, structure);
    }
  }

  /**
   * Add a type-only import for ESM circular dependency resolution
   */
  public addType(name: string, moduleSpecifier: string): void {
    const typeOnlyKey = `type:${name}`;
    if (!this.has(typeOnlyKey) && !this.has(name)) {
      this.set(typeOnlyKey, {
        isTypeOnly: true,
        moduleSpecifier,
        namedImports: [{ name }],
      });
    }
  }

  public create(args: {
    name: string;
    from: string;
    defaultImport?: string | true;
    namespaceImport?: string;
    namedImport?: boolean;
    isTypeOnly?: boolean;
  }): void {
    const { defaultImport, from, isTypeOnly, namedImport, namespaceImport } = args;
    let { name } = args;
    const value: OptionalKind<ImportDeclarationStructure> = {
      defaultImport: undefined as string | undefined,
      isTypeOnly,
      moduleSpecifier: from,
      namedImports: [] as Array<OptionalKind<ImportSpecifierStructure>>,
      namespaceImport: undefined as string | undefined,
    };
    if (namedImport === true && namespaceImport !== undefined) {
      value.namedImports = [{ name: namespaceImport }];

      name = namespaceImport;
    } else if (defaultImport === undefined) {
      if (namespaceImport === undefined) {
        value.namedImports = [{ name }];
      } else {
        value.namespaceImport = namespaceImport;

        name = namespaceImport;
      }
    } else {
      value.defaultImport = defaultImport === true ? name : defaultImport;

      name = value.defaultImport;
    }
    const key = isTypeOnly === true ? `type:${name}` : name;
    if (this.has(key)) {
      return;
    }
    this.set(key, value);
  }

  public *toStatements(): Iterable<ImportDeclarationStructure> {
    const iterator = this.values();
    let result = iterator.next();
    while (result.value !== undefined) {
      yield {
        ...result.value,
        kind: StructureKind.ImportDeclaration,
      };
      result = iterator.next();
    }
  }
}
