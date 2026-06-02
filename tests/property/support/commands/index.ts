/**
 * Helpers for authoring fast-check commands with less class boilerplate.
 * @module tests/property/support/commands
 */

import type { AsyncCommand, Command } from 'fast-check';

/** Build an async command from plain functions (model `M`, real system `R`). */
export function defineAsyncCommand<M extends object, R>(spec: {
  check: (model: Readonly<M>) => boolean;
  run: (model: M, real: R) => Promise<void>;
  toString: () => string;
}): AsyncCommand<M, R> {
  return { check: spec.check, run: spec.run, toString: spec.toString };
}

/** Build a sync command from plain functions (model `M`, real system `R`). */
export function defineCommand<M extends object, R>(spec: {
  check: (model: Readonly<M>) => boolean;
  run: (model: M, real: R) => void;
  toString: () => string;
}): Command<M, R> {
  return { check: spec.check, run: spec.run, toString: spec.toString };
}
