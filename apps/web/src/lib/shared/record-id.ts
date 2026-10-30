import { recordIdSchema } from '@intelliflow/validators/record-id';

/**
 * True when `id` is a record id the api accepts: a cuid (Prisma `@default(cuid())`),
 * a seed uuid or a system id. Uses the api's own schema, so the web never gates a
 * real id that the server would take (#1097).
 */
export function isRecordId(id: string): boolean {
  return recordIdSchema.safeParse(id).success;
}
