import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CodeBlockComponent } from '../../components/code-block/code-block.component';

@Component({
  selector: 'app-esm',
  standalone: true,
  imports: [RouterLink, CodeBlockComponent],
  template: `
    <div class="pt-24 pb-16">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <!-- Header -->
        <div class="mb-12">
          <nav class="flex items-center gap-2 text-sm text-steel-400 mb-4">
            <a routerLink="/" class="hover:text-brand-400 transition-colors">Home</a>
            <span>/</span>
            <span class="text-white">ESM Guide</span>
          </nav>
          <h1 class="text-4xl font-bold text-white mb-4">ESM Compatibility</h1>
          <p class="text-lg text-steel-300">
            This generator is built ESM-first. Learn how to handle circular dependencies and
            configure your project for optimal ESM support.
          </p>
        </div>

        <!-- Why ESM -->
        <section class="mb-12">
          <h2 class="text-2xl font-bold text-white mb-6">Why ESM-First?</h2>
          <div class="grid sm:grid-cols-2 gap-4">
            @for (benefit of benefits; track benefit.title) {
              <div class="p-5 rounded-xl glass">
                <div class="text-2xl mb-3">{{ benefit.icon }}</div>
                <h3 class="font-semibold text-white mb-2">{{ benefit.title }}</h3>
                <p class="text-sm text-steel-400">{{ benefit.description }}</p>
              </div>
            }
          </div>
        </section>

        <!-- Circular Dependencies -->
        <section class="mb-12">
          <h2 class="text-2xl font-bold text-white mb-6">The Circular Dependency Problem</h2>
          <p class="text-steel-300 mb-4">
            In ESM, circular imports behave differently than CommonJS. When models reference each other
            (like User ↔ Post), you can get undefined imports at runtime:
          </p>
          <app-code-block [code]="circularProblem" language="graphql" filename="schema.prisma" />

          <div class="mt-4 p-4 rounded-lg bg-forge-500/10 border border-forge-500/20">
            <p class="text-sm text-forge-300">
              <strong>Without handling:</strong> When <code>user.model.ts</code> imports <code>Post</code>
              and <code>post.model.ts</code> imports <code>User</code>, one of them will be
              <code>undefined</code> during initialization.
            </p>
          </div>
        </section>

        <!-- Migrating to 2.0 -->
        <section class="mb-12">
          <h2 class="text-2xl font-bold text-white mb-6">Migrating to 2.0</h2>
          <div class="mb-4 p-4 rounded-lg bg-forge-500/10 border border-forge-500/20">
            <p class="text-sm text-forge-300">
              <strong>Breaking change:</strong> the ESM type registry has been removed.
              <code>type-registry.ts</code> and <code>register-all-types.ts</code> are no longer
              generated, and <code>registerType()</code> / <code>getType()</code> no longer exist.
              The generator prints a notice on every run and deletes those files if an older
              version left them in your output directory, along with 1.x class files that are no
              longer generated and still import the registry.
            </p>
          </div>
          <p class="text-steel-300 mb-4">
            Remove the registry import from your entry point, and replace any
            <code>getType('X')</code> in your own code with the class itself. Delete any other
            registry calls (<code>registerType</code>, <code>forwardRef</code>,
            <code>lazyType</code>, <code>validateRegistry</code>, and so on). If you imported
            <code>__Lazy</code> from <code>type-registry.js</code>, declare it locally:
            <code>type __Lazy&lt;T&gt; = T;</code>
          </p>
          <app-code-block [code]="migrationExample" language="typescript" filename="main.ts" />
        </section>

        <!-- Solution -->
        <section class="mb-12">
          <h2 class="text-2xl font-bold text-white mb-6">The Solution: esmCompatible</h2>
          <p class="text-steel-300 mb-4">
            Enable the <code>esmCompatible</code> option to generate code that is safe to load in
            any order:
          </p>
          <app-code-block [code]="esmConfig" language="graphql" filename="schema.prisma" />

          <h3 class="text-lg font-semibold text-white mt-6 mb-3">How It Works</h3>
          <p class="text-steel-300 mb-4">
            A cycle only breaks ESM when a class is read while its module is still loading.
            Generated code avoids every such read: field types are functions, and cyclic
            properties are typed through a local <code>__Lazy&lt;T&gt;</code> alias so decorator
            metadata records <code>Object</code> instead of reading the class.
          </p>
          <app-code-block [code]="modelExample" language="typescript" filename="user.model.ts" />
        </section>

        <!-- App Setup -->
        <section class="mb-12">
          <h2 class="text-2xl font-bold text-white mb-6">Application Setup</h2>
          <p class="text-steel-300 mb-4">
            There is nothing to set up. No registry, and no file that must be imported first:
          </p>
          <app-code-block [code]="mainSetup" language="typescript" filename="main.ts" />

          <div class="mt-4 p-4 rounded-lg bg-brand-500/10 border border-brand-500/20">
            <p class="text-sm text-brand-300">
              <strong>Bundlers:</strong> generated classes pass their GraphQL name explicitly
              (<code>&#64;ObjectType('User')</code>), so bundled and minified builds produce the
              same schema even though bundlers rename classes.
            </p>
          </div>
        </section>

        <!-- Project Config -->
        <section class="mb-12">
          <h2 class="text-2xl font-bold text-white mb-6">Project Configuration</h2>

          <h3 class="text-lg font-semibold text-white mb-3">package.json</h3>
          <app-code-block [code]="packageJson" language="json" filename="package.json" />

          <h3 class="text-lg font-semibold text-white mt-6 mb-3">tsconfig.json</h3>
          <app-code-block [code]="tsconfig" language="json" filename="tsconfig.json" />
        </section>

        <!-- Troubleshooting -->
        <section class="mb-12">
          <h2 class="text-2xl font-bold text-white mb-6">Troubleshooting</h2>

          <div class="space-y-6">
            <div class="p-5 rounded-xl glass">
              <h3 class="font-semibold text-white mb-2 flex items-center gap-2">
                <span class="text-forge-400">⚠️</span>
                Cannot find module register-all-types
              </h3>
              <p class="text-steel-400 text-sm mb-3">
                The type registry was removed in 2.0. Delete the import; nothing replaces it.
              </p>
              <app-code-block [code]="registerImportFix" language="typescript" />
            </div>

            <div class="p-5 rounded-xl glass">
              <h3 class="font-semibold text-white mb-2 flex items-center gap-2">
                <span class="text-forge-400">⚠️</span>
                Cannot access 'X' before initialization
              </h3>
              <p class="text-steel-400 text-sm mb-3">
                Generated code no longer causes this. Look for a hand-written class in a cycle
                whose property is typed as another class, and type it through
                <code>__Lazy&lt;T&gt;</code> the same way.
              </p>
            </div>

            <div class="p-5 rounded-xl glass">
              <h3 class="font-semibold text-white mb-2 flex items-center gap-2">
                <span class="text-forge-400">⚠️</span>
                ERR_MODULE_NOT_FOUND
              </h3>
              <p class="text-steel-400 text-sm mb-3">
                Make sure all imports use <code>.js</code> extensions (TypeScript resolves them to <code>.ts</code>):
              </p>
              <app-code-block [code]="extensionExample" language="typescript" />
            </div>

            <div class="p-5 rounded-xl glass">
              <h3 class="font-semibold text-white mb-2 flex items-center gap-2">
                <span class="text-forge-400">⚠️</span>
                Cannot use import statement outside a module
              </h3>
              <p class="text-steel-400 text-sm mb-3">
                Add <code>"type": "module"</code> to your package.json or use <code>.mjs</code> extension.
              </p>
            </div>
          </div>
        </section>

        <!-- Without ESM -->
        <section class="mb-12">
          <h2 class="text-2xl font-bold text-white mb-6">CommonJS Fallback</h2>
          <p class="text-steel-300 mb-4">
            If you're not using ESM, you can disable the ESM-specific features:
          </p>
          <app-code-block [code]="cjsConfig" language="graphql" />
          <div class="mt-4 p-4 rounded-lg bg-steel-500/10 border border-steel-500/20">
            <p class="text-sm text-steel-300">
              <strong>Note:</strong> The generator still produces valid TypeScript. CommonJS bundlers
              and transpilers will handle the output correctly. The <code>esmCompatible</code> option
              adds <code>.js</code> import extensions, barrel files and cycle-safe property types.
            </p>
          </div>
        </section>
      </div>
    </div>
  `,
})
export class EsmComponent {
  benefits = [
    {
      icon: '🌳',
      title: 'Tree Shaking',
      description: 'ESM enables better dead code elimination and smaller bundle sizes.',
    },
    {
      icon: '⚡',
      title: 'Native Support',
      description: 'Modern Node.js and browsers support ESM natively without transpilation.',
    },
    {
      icon: '🔒',
      title: 'Static Analysis',
      description: 'ESM imports are statically analyzable for better tooling support.',
    },
    {
      icon: '🔮',
      title: 'Future-Proof',
      description: 'ESM is the official JavaScript module standard going forward.',
    },
  ];

  circularProblem = `model User {
  id    String @id @default(cuid())
  posts Post[]  // User references Post
}

model Post {
  id       String @id @default(cuid())
  author   User   @relation(fields: [authorId], references: [id])
  authorId String // Post references User
}`;

  esmConfig = `generator nestgraphql {
  provider      = "nestjs-prisma-graphql"
  output        = "../src/@generated"
  esmCompatible = true  // .js import extensions, barrels, cycle-safe property types
}`;

  modelExample = `import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Post } from '../post/post.model.js';

/** Identity alias: keeps decorator metadata from reading a class during an ESM import cycle. */
type __Lazy<T> = T;

@ObjectType('User')
export class User {
  @Field(() => ID)
  id!: string;

  // The field type is a function, so Post is only read when the schema is built
  @Field(() => [Post])
  posts?: Array<__Lazy<Post>>;
}`;

  migrationExample = `- import './${'@'}generated/register-all-types.js';
  import 'reflect-metadata';
  import { NestFactory } from '@nestjs/core';

- import { getType } from './${'@'}generated/type-registry.js';
- @Field(() => getType('Post'))
+ import { Post } from './${'@'}generated/post/post.model.js';
+ @Field(() => Post)`;

  mainSetup = `import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}

bootstrap();`;

  registerImportFix = `- import './${'@'}generated/register-all-types.js';`;

  packageJson = `{
  "name": "my-nestjs-app",
  "type": "module",
  "engines": {
    "node": ">=20.0.0"
  }
}`;

  tsconfig = `{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "strict": true,
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "verbatimModuleSyntax": true
  }
}`;

  extensionExample = `// ❌ Wrong - will fail in ESM
import { User } from './user.model';

// ✅ Correct - use .js extension
import { User } from './user.model.js';`;

  cjsConfig = `generator nestgraphql {
  provider      = "nestjs-prisma-graphql"
  output        = "../src/@generated"
  esmCompatible = false  // Disable ESM handling
}`;
}
