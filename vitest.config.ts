import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '@generated'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/test/**', 'src/index.ts'],
      thresholds: {
        // Helpers have ~80% coverage, handlers need integration tests.
        // Thresholds set as floors below current overall coverage so CI is
        // gated against regressions without requiring the handler integration
        // tests that are not yet in place.
        lines: 25,
        functions: 30,
        branches: 28,
        statements: 25,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    reporters: ['verbose'],
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
