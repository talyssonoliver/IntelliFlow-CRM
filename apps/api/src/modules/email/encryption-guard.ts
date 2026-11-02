import { TRPCError } from '@trpc/server';

/**
 * PG-207 (CA-2): mailbox secrets may only be written when field encryption is
 * active. Without PRISMA_FIELD_ENCRYPTION_KEY the Prisma extension is not
 * attached and a write would store plaintext (packages/db/src/client.ts), so
 * every secret write calls this first and nothing is written when it throws.
 */
export function requireEncryptionKey(env: NodeJS.ProcessEnv = process.env): void {
  if (env.PRISMA_FIELD_ENCRYPTION_KEY?.trim()) return;
  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message:
      'Secure storage for mailbox credentials is not configured on this server. Ask your administrator.',
  });
}
