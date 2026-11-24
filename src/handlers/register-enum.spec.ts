import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bin = (name: string): string => path.join(repoRoot, 'node_modules/.bin', name);

function runGenerator(directory: string, enums: string): void {
  writeFileSync(
    path.join(directory, 'schema.prisma'),
    `datasource db {
  provider = "postgresql"
}

generator nestgraphql {
  provider = "${bin('tsx')} ${path.join(repoRoot, 'src/index.ts')}"
  output   = "./generated"
}

${enums}

model Thing {
  id    Int    @id
  role  Role
  level Level?
}
`,
  );
  execFileSync(bin('prisma'), ['generate', '--schema', 'schema.prisma'], {
    cwd: directory,
    stdio: 'pipe',
  });
}

describe('enum generation (prisma generate)', () => {
  let directory: string;
  const read = (file: string): string =>
    readFileSync(path.join(directory, 'generated', file), 'utf8');

  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'npg-enum-'));
    runGenerator(
      directory,
      `/// Role enum
enum Role {
  /// @EnumValue("administrator")
  /// Full "access": everything
  ADMIN
  /// @deprecated Use ADMIN
  USER
}

enum Level {
  /// @EnumValue(1)
  LOW
  /// @EnumValue(2)
  HIGH
}`,
    );
  }, 120_000);

  afterAll(() => {
    rmSync(directory, { force: true, recursive: true });
  });

  it('emits string @EnumValue initializers and defaults others to their name', () => {
    const roleEnum = read('prisma/role.enum.ts');

    expect(roleEnum).toContain('ADMIN = "administrator"');
    expect(roleEnum).toContain('USER = "USER"');
  });

  it('emits numeric @EnumValue initializers', () => {
    const levelEnum = read('prisma/level.enum.ts');

    expect(levelEnum).toContain('LOW = 1');
    expect(levelEnum).toContain('HIGH = 2');
  });

  it('keeps enum value docs (minus the directive) in valuesMap', () => {
    const roleEnum = read('prisma/role.enum.ts');

    expect(roleEnum).toContain(`description: 'Full "access": everything'`);
    expect(roleEnum).toContain("deprecationReason: 'Use ADMIN'");
    expect(roleEnum).not.toContain('@EnumValue');
  });

  it('types custom-valued enum properties as the enum itself', () => {
    expect(read('thing/thing.model.ts')).toContain('level!: Level | null;');
    expect(read('thing/thing.model.ts')).toContain('role!: Role;');
    expect(read('thing/thing-create.input.ts')).toContain('level?: Level;');
  });

  it('keeps property types on input classes', () => {
    expect(read('thing/thing-create.input.ts')).toContain('id!: number;');
  });

  it('fails generation on duplicate enum values', () => {
    const failing = mkdtempSync(path.join(tmpdir(), 'npg-enum-dup-'));
    try {
      expect(() =>
        runGenerator(
          failing,
          `enum Role {
  /// @EnumValue("USER")
  ADMIN
  USER
}

enum Level {
  LOW
}`,
        ),
      ).toThrow(/Role\.USER: value "USER" is already used by Role\.ADMIN/);
    } finally {
      rmSync(failing, { force: true, recursive: true });
    }
  }, 120_000);
});
