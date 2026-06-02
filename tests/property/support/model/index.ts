/**
 * Model-based testing helpers (fast-check commands / modelRun).
 *
 * A *model* is a simplified, in-memory reference implementation of an aggregate's
 * observable behaviour. fast-check generates random command sequences, runs them
 * against BOTH the model and the real system, and asserts they stay consistent —
 * surfacing illegal state transitions a hand-written test would miss.
 *
 * Keep the model independent of production logic (don't import the aggregate's
 * own state machine) or the test only proves the code equals itself.
 *
 * @module tests/property/support/model
 */

import fc from 'fast-check';

export type { Command, AsyncCommand } from 'fast-check';

/** `fc.commands` — arbitrary of command sequences. */
export const commands = fc.commands;

/** Run a generated command sequence against a sync model+real pair. */
export const modelRun = fc.modelRun;

/** Run a generated command sequence against an async model+real pair. */
export const asyncModelRun = fc.asyncModelRun;
