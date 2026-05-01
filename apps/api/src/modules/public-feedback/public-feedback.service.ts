/**
 * Public Feedback Service — PG-126
 *
 * Thin application-service layer between the tRPC router and the Prisma
 * adapter. Accepts validated input (zod-parsed at router boundary), strips
 * any stray honeypot, and delegates persistence to the repository port.
 */
import { TRPCError } from '@trpc/server';
import type { PublicFeedbackRepositoryPort } from '@intelliflow/application';
import type { PublicFeedbackInput } from '@intelliflow/validators';

export interface SubmitPublicFeedbackResult {
  success: true;
  id: string;
}

export class PublicFeedbackService {
  constructor(private readonly repository: PublicFeedbackRepositoryPort) {}

  async submit(input: PublicFeedbackInput, ipHash: string): Promise<SubmitPublicFeedbackResult> {
    try {
      const record = await this.repository.create({
        rating: input.rating,
        comment: input.comment ?? null,
        email: input.email ?? null,
        source: input.source,
        userAgent: input.userAgent ?? null,
        ipHash,
      });
      return { success: true, id: record.id };
    } catch (err) {
      // Preserve tRPC errors; wrap everything else as 500.
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to persist public feedback.',
        cause: err,
      });
    }
  }
}
