/**
 * Public Feedback Repository Port — PG-126
 *
 * Contract for persisting anonymous public-site feedback submissions.
 * Tenant-agnostic: visitors are unauthenticated, so no tenantId applies.
 * Rate limiting (by hashed IP) is enforced at the router layer, not here.
 *
 * Implemented by PrismaPublicFeedbackRepository in @intelliflow/adapters.
 */

export interface CreatePublicFeedbackInput {
  rating: number;
  comment?: string | null;
  email?: string | null;
  source: string;
  userAgent?: string | null;
  ipHash: string;
}

export interface PublicFeedbackRecord {
  id: string;
  rating: number;
  comment: string | null;
  email: string | null;
  source: string;
  userAgent: string | null;
  ipHash: string;
  createdAt: Date;
}

export interface PublicFeedbackRepositoryPort {
  create(input: CreatePublicFeedbackInput): Promise<PublicFeedbackRecord>;
}
