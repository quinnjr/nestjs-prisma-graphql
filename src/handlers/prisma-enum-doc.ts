interface EnumValueDocInfo {
  description?: string;
  deprecationReason?: string;
}

const DEPRECATED_PREFIX = '@deprecated';

/**
 * Splits enum value documentation into a GraphQL description and deprecation
 * reason. Any line starting with `@deprecated` sets the reason; the remaining
 * lines form the description, so a value can have both.
 */
export function extractEnumValueDocs(
  values: ReadonlyArray<{ name: string; documentation?: unknown }>,
): Record<string, EnumValueDocInfo> {
  return Object.fromEntries(
    values
      .map((value): [string, EnumValueDocInfo] | null => {
        const { documentation, name } = value;

        if (typeof documentation !== 'string') {
          return null;
        }

        const lines = documentation.split('\n');
        const deprecatedLine = lines.find(line => line.startsWith(DEPRECATED_PREFIX));

        if (deprecatedLine === undefined) {
          return [name, { description: documentation }];
        }

        const result: EnumValueDocInfo = {
          deprecationReason: deprecatedLine.slice(DEPRECATED_PREFIX.length).trim(),
        };
        const description = lines
          .filter(line => !line.startsWith(DEPRECATED_PREFIX))
          .join('\n')
          .trim();
        if (description !== '') {
          result.description = description;
        }

        return [name, result];
      })
      .filter((entry): entry is [string, EnumValueDocInfo] => entry !== null),
  );
}
