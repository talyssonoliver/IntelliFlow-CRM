/**
 * Prisma Public Feedback Repository — PG-126
 *
 * Persists anonymous public-site feedback submissions. Tenant-agnostic:
 * visitors are unauthenticated, so no tenantId predicate applies.
 *
 * Rate limiting (by hashed IP) lives at the tRPC router layer; this adapter
 * is a thin Prisma-backed `create` implementation.
 */

import type { PrismaClient } from '@intelliflow/db';
import type {
  PublicFeedbackRepositoryPort,
  CreatePublicFeedbackInput,
  PublicFeedbackRecord,
} from '@intelliflow/application';

export class PrismaPublicFeedbackRepository implements PublicFeedbackRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreatePublicFeedbackInput): Promise<PublicFeedbackRecord> {
    const row = await this.prisma.publicFeedback.create({
      data: {
        rating: input.rating,
        comment: input.comment ?? null,
        email: input.email ?? null,
        source: input.source,
        userAgent: input.userAgent ?? null,
        ipHash: input.ipHash,
      },
    });

    return {
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      email: row.email,
      source: row.source,
      userAgent: row.userAgent,
      ipHash: row.ipHash,
      createdAt: row.createdAt,
    };
  }
}
