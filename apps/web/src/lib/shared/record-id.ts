import { idSchema } from '@intelliflow/validators';

/**
 * True when `id` is a record id the api accepts: a cuid (Prisma `@default(cuid())`)
 * or a seed uuid. Uses the same `idSchema` as the account, ticket and contact inputs
 * it gates, so the web neither blocks a real id nor sends one the server would
 * reject (#1097).
 */
export function isRecordId(id: string): boolean {
  return idSchema.safeParse(id).success;
}
