import { ok as assertOk } from 'node:assert';

/**
 * Type-safe assertion wrapper for node:assert.ok
 * This wrapper prevents TypeScript/ESLint 'unsafe call' errors
 * while preserving the assertion behavior.
 */
export function ok(value: unknown, message?: string): asserts value {
  (assertOk as (value: unknown, message?: string | Error) => asserts value)(
    value,
    message,
  );
}
