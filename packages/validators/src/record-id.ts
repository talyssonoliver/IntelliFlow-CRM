/**
 * Record ids carried by queue jobs and AI chains (#1074).
 *
 * Records use `@default(cuid())` (schema.prisma has no uuid column), seed data
 * uses UUIDs and scheduled jobs use system ids, so this accepts all three. It is
 * bounded, with the same character set as the actor-id rule from #1052, so it
 * never admits text that could break out of a path, query or log line.
 *
 * A zod-only entry point (`@intelliflow/validators/record-id`), so workers can
 * use it without loading the domain package.
 */
import { z } from 'zod';

/** Upper bound for a record id; a cuid (25) and a uuid (36) both fit. */
export const MAX_RECORD_ID_LENGTH = 64;

export const recordIdSchema = z
  .string()
  .min(1, 'Invalid id')
  .max(MAX_RECORD_ID_LENGTH, 'Invalid id')
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid id');
