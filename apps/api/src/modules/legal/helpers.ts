import { TRPCError } from '@trpc/server';
import { mapErrorToTRPCError } from '../../shared/error-mapper';

/**
 * Maps a DomainError (or unknown) from a use-case Result.fail into a TRPCError.
 * Thin wrapper around the centralized mapper — exists so legal-module callers
 * don't have to import from `shared/` directly.
 */
export function mapDomainErrorToTRPC(error: unknown): TRPCError {
  return mapErrorToTRPCError(error);
}
