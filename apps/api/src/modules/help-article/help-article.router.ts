/**
 * Help Article Router (IFC-299)
 *
 * Tenant-scoped tRPC router for managing help center articles.
 * 9 procedures: list, getBySlug, getByCategory, getRelated,
 * create, update, delete, publish, unpublish.
 *
 * Uses direct Prisma queries via prismaWithTenant (no service layer).
 * Write operations require ADMIN or MANAGER role.
 */

import { TRPCError } from '@trpc/server';
import { Prisma } from '@intelliflow/db';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { z } from 'zod';
import {
  helpArticleQuerySchema,
  helpArticleSlugSchema,
  helpArticleCategorySchema,
  helpArticleIdSchema,
  createHelpArticleSchema,
  updateHelpArticleSchema,
} from '@intelliflow/validators/help-article';

// ─── Feedback Schemas (IFC-303) ─────────────────────────────────────────────

const submitFeedbackSchema = z.object({
  articleId: z.string().min(1),
  value: z.enum(['helpful', 'not_helpful']),
  comment: z.string().max(1000).optional(),
});

const getFeedbackStatsSchema = z.object({
  articleId: z.string().min(1),
});

// ─── Role Guards ─────────────────────────────────────────────────────────────

function assertAdminOrManager(role: string): void {
  if (role !== 'ADMIN' && role !== 'MANAGER') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin or Manager access required',
    });
  }
}

function assertAdmin(role: string): void {
  if (role !== 'ADMIN') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
    });
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const helpArticleRouter = createTRPCRouter({
  /**
   * List help articles with pagination, filtering, and search.
   * DRAFT articles are only visible to ADMIN/MANAGER users.
   */
  list: tenantProcedure.input(helpArticleQuerySchema).query(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const offset = (input.page - 1) * input.limit;
    const isPrivileged = ctx.tenant.role === 'ADMIN' || ctx.tenant.role === 'MANAGER';

    const where: Record<string, unknown> = { tenantId };

    // Status filter — non-privileged users can only see PUBLISHED
    if (input.status) {
      if (input.status === 'DRAFT' && !isPrivileged) {
        where.status = 'PUBLISHED'; // override — non-privileged can't see DRAFTs
      } else {
        where.status = input.status;
      }
    } else if (!isPrivileged) {
      where.status = 'PUBLISHED';
    }

    if (input.categoryId) {
      where.categoryId = input.categoryId;
    }

    if (input.search) {
      where.OR = [
        { title: { contains: input.search, mode: 'insensitive' } },
        { excerpt: { contains: input.search, mode: 'insensitive' } },
      ];
    }

    const [articles, total] = await Promise.all([
      ctx.prismaWithTenant.helpArticle.findMany({
        where,
        select: {
          id: true,
          slug: true,
          title: true,
          categoryId: true,
          excerpt: true,
          readTimeMinutes: true,
          order: true,
          status: true,
          publishedAt: true,
          keywords: true,
          relatedArticleIds: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { feedback: true } },
        },
        orderBy: { [input.orderBy]: input.orderDir },
        skip: offset,
        take: input.limit,
      }),
      ctx.prismaWithTenant.helpArticle.count({ where }),
    ]);

    return {
      items: articles.map((a) => ({
        ...a,
        keywords: a.keywords as string[],
        relatedArticleIds: a.relatedArticleIds as string[],
        feedbackCount: a._count.feedback,
      })),
      total,
      page: input.page,
      limit: input.limit,
      hasMore: offset + input.limit < total,
    };
  }),

  /**
   * Get a single article by slug, including ordered sections.
   * DRAFT articles are only visible to ADMIN/MANAGER.
   */
  getBySlug: tenantProcedure.input(helpArticleSlugSchema).query(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;

    const article = await ctx.prismaWithTenant.helpArticle.findUnique({
      where: { tenantId_slug: { tenantId, slug: input.slug } },
      include: {
        sections: { orderBy: { order: 'asc' } },
        _count: { select: { feedback: true } },
      },
    });

    if (!article) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Article not found' });
    }

    // DRAFT articles only visible to privileged users
    const isPrivileged = ctx.tenant.role === 'ADMIN' || ctx.tenant.role === 'MANAGER';
    if (article.status === 'DRAFT' && !isPrivileged) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Article not found' });
    }

    return {
      ...article,
      keywords: article.keywords as string[],
      relatedArticleIds: article.relatedArticleIds as string[],
      feedbackCount: article._count.feedback,
    };
  }),

  /**
   * Get a single article by id, including ordered sections.
   * Tenant-scoped; DRAFT articles are only visible to ADMIN/MANAGER.
   * Used by the admin editor (PG-181) where the route param is the article id.
   */
  getById: tenantProcedure.input(helpArticleIdSchema).query(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;

    const article = await ctx.prismaWithTenant.helpArticle.findFirst({
      where: { id: input.id, tenantId },
      include: {
        sections: { orderBy: { order: 'asc' } },
        _count: { select: { feedback: true } },
      },
    });

    if (!article) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Article not found' });
    }

    // DRAFT articles only visible to privileged users
    const isPrivileged = ctx.tenant.role === 'ADMIN' || ctx.tenant.role === 'MANAGER';
    if (article.status === 'DRAFT' && !isPrivileged) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Article not found' });
    }

    return {
      ...article,
      keywords: article.keywords as string[],
      relatedArticleIds: article.relatedArticleIds as string[],
      feedbackCount: article._count.feedback,
    };
  }),

  /**
   * Get articles by category. Defaults to PUBLISHED only.
   */
  getByCategory: tenantProcedure.input(helpArticleCategorySchema).query(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;

    const isPrivileged = ctx.tenant.role === 'ADMIN' || ctx.tenant.role === 'MANAGER';
    const where: Record<string, unknown> = {
      tenantId,
      categoryId: input.categoryId,
    };
    // Only privileged users can see unpublished articles
    if (!input.includeUnpublished || !isPrivileged) {
      where.status = 'PUBLISHED';
    }

    const articles = await ctx.prismaWithTenant.helpArticle.findMany({
      where,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        readTimeMinutes: true,
        order: true,
        status: true,
        publishedAt: true,
        keywords: true,
        relatedArticleIds: true,
        _count: { select: { feedback: true, sections: true } },
      },
      orderBy: { order: 'asc' },
    });

    return articles.map((a) => ({
      ...a,
      keywords: a.keywords as string[],
      relatedArticleIds: a.relatedArticleIds as string[],
      feedbackCount: a._count.feedback,
      // IFC-302: the public category-listing card shows a "{n} sections" chip.
      // getByCategory omits the sections relation, so expose the count additively.
      sectionCount: a._count.sections,
    }));
  }),

  /**
   * Get related articles by resolving relatedArticleIds JSON array.
   */
  getRelated: tenantProcedure.input(helpArticleIdSchema).query(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;

    const source = await ctx.prismaWithTenant.helpArticle.findFirst({
      where: { id: input.id, tenantId },
      select: { relatedArticleIds: true },
    });

    if (!source) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Article not found' });
    }

    const relatedIds = source.relatedArticleIds as string[];
    if (relatedIds.length === 0) {
      return [];
    }

    return ctx.prismaWithTenant.helpArticle.findMany({
      where: { id: { in: relatedIds }, tenantId, status: 'PUBLISHED' },
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        readTimeMinutes: true,
        categoryId: true,
      },
      take: 10, // match validator max (z.array(z.string()).max(10))
    });
  }),

  /**
   * Create a new help article with sections.
   * Requires ADMIN or MANAGER role.
   */
  create: tenantProcedure.input(createHelpArticleSchema).mutation(async ({ ctx, input }) => {
    assertAdminOrManager(ctx.tenant.role);
    const tenantId = ctx.tenant.tenantId;

    // Pre-check slug uniqueness for a clean error message
    const existing = await ctx.prismaWithTenant.helpArticle.findUnique({
      where: { tenantId_slug: { tenantId, slug: input.slug } },
      select: { id: true },
    });
    if (existing) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `Slug "${input.slug}" is already in use`,
      });
    }

    try {
      return await ctx.prismaWithTenant.helpArticle.create({
        data: {
          slug: input.slug,
          title: input.title,
          categoryId: input.categoryId,
          excerpt: input.excerpt,
          readTimeMinutes: input.readTimeMinutes,
          keywords: input.keywords,
          relatedArticleIds: input.relatedArticleIds,
          order: input.order,
          status: 'DRAFT',
          tenantId,
          sections: {
            createMany: {
              data: input.sections.map((s, i) => ({
                heading: s.heading,
                content: s.content,
                blocks: s.blocks ?? undefined,
                order: s.order ?? i,
                tenantId,
              })),
            },
          },
        },
        include: { sections: { orderBy: { order: 'asc' } } },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Slug "${input.slug}" is already in use`,
        });
      }
      throw e;
    }
  }),

  /**
   * Update a help article. If sections are provided, replaces all sections.
   * Requires ADMIN or MANAGER role.
   */
  update: tenantProcedure.input(updateHelpArticleSchema).mutation(async ({ ctx, input }) => {
    assertAdminOrManager(ctx.tenant.role);
    const tenantId = ctx.tenant.tenantId;
    const { id, sections, ...articleFields } = input;

    const existing = await ctx.prismaWithTenant.helpArticle.findFirst({
      where: { id, tenantId },
      select: { id: true, slug: true },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Article not found' });
    }

    // Slug conflict check (only if slug is changing)
    if (articleFields.slug && articleFields.slug !== existing.slug) {
      const slugConflict = await ctx.prismaWithTenant.helpArticle.findUnique({
        where: { tenantId_slug: { tenantId, slug: articleFields.slug } },
        select: { id: true },
      });
      if (slugConflict) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Slug "${articleFields.slug}" is already in use`,
        });
      }
    }

    try {
      return await ctx.prismaWithTenant.$transaction(async (tx) => {
        // Replace sections if provided
        if (sections !== undefined) {
          await tx.articleSection.deleteMany({
            where: { articleId: id, tenantId },
          });
          if (sections.length > 0) {
            await tx.articleSection.createMany({
              data: sections.map((s, i) => ({
                heading: s.heading,
                content: s.content,
                blocks: s.blocks ?? undefined,
                order: s.order ?? i,
                articleId: id,
                tenantId,
              })),
            });
          }
        }

        // Build update data — only include provided fields
        const data: Record<string, unknown> = {};
        if (articleFields.slug !== undefined) data.slug = articleFields.slug;
        if (articleFields.title !== undefined) data.title = articleFields.title;
        if (articleFields.categoryId !== undefined) data.categoryId = articleFields.categoryId;
        if (articleFields.excerpt !== undefined) data.excerpt = articleFields.excerpt;
        if (articleFields.readTimeMinutes !== undefined)
          data.readTimeMinutes = articleFields.readTimeMinutes;
        if (articleFields.keywords !== undefined) data.keywords = articleFields.keywords;
        if (articleFields.relatedArticleIds !== undefined)
          data.relatedArticleIds = articleFields.relatedArticleIds;
        if (articleFields.order !== undefined) data.order = articleFields.order;

        await tx.helpArticle.updateMany({
          where: { id, tenantId },
          data,
        });
        // findUniqueOrThrow (not findUnique): the tenant-scoped updateMany above
        // is the authoritative write; if the row vanished (concurrent delete
        // after the pre-check) throw NOT_FOUND-equivalent rather than returning
        // null. Also keeps the return type non-nullable for callers.
        return tx.helpArticle.findUniqueOrThrow({
          where: { id },
          include: { sections: { orderBy: { order: 'asc' } } },
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Slug "${articleFields.slug}" is already in use`,
        });
      }
      throw e;
    }
  }),

  /**
   * Delete a help article. Sections and feedback cascade-delete.
   * Requires ADMIN role.
   */
  delete: tenantProcedure.input(helpArticleIdSchema).mutation(async ({ ctx, input }) => {
    assertAdmin(ctx.tenant.role);
    const tenantId = ctx.tenant.tenantId;

    const existing = await ctx.prismaWithTenant.helpArticle.findFirst({
      where: { id: input.id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Article not found' });
    }

    await ctx.prismaWithTenant.helpArticle.deleteMany({
      where: { id: input.id, tenantId },
    });

    return { success: true };
  }),

  /**
   * Publish a DRAFT article. Sets status to PUBLISHED and publishedAt.
   * Requires ADMIN or MANAGER role.
   */
  publish: tenantProcedure.input(helpArticleIdSchema).mutation(async ({ ctx, input }) => {
    assertAdminOrManager(ctx.tenant.role);
    const tenantId = ctx.tenant.tenantId;

    const existing = await ctx.prismaWithTenant.helpArticle.findFirst({
      where: { id: input.id, tenantId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Article not found' });
    }
    if (existing.status === 'PUBLISHED') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Article is already published',
      });
    }

    const publishedAt = new Date();
    await ctx.prismaWithTenant.helpArticle.updateMany({
      where: { id: input.id, tenantId },
      data: { status: 'PUBLISHED', publishedAt },
    });
    return { id: input.id, status: 'PUBLISHED' as const, publishedAt };
  }),

  /**
   * Unpublish a PUBLISHED article. Sets status to DRAFT and clears publishedAt.
   * Requires ADMIN or MANAGER role.
   */
  unpublish: tenantProcedure.input(helpArticleIdSchema).mutation(async ({ ctx, input }) => {
    assertAdminOrManager(ctx.tenant.role);
    const tenantId = ctx.tenant.tenantId;

    const existing = await ctx.prismaWithTenant.helpArticle.findFirst({
      where: { id: input.id, tenantId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Article not found' });
    }
    if (existing.status === 'DRAFT') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Article is already unpublished',
      });
    }

    await ctx.prismaWithTenant.helpArticle.updateMany({
      where: { id: input.id, tenantId },
      data: { status: 'DRAFT', publishedAt: null },
    });
    return { id: input.id, status: 'DRAFT' as const, publishedAt: null };
  }),

  // ─── Feedback (IFC-303) ─────────────────────────────────────────────────

  /**
   * Submit feedback for a help article.
   * Maps FeedbackValue ('helpful' | 'not_helpful') to boolean.
   */
  submitFeedback: tenantProcedure.input(submitFeedbackSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;

    const article = await ctx.prismaWithTenant.helpArticle.findFirst({
      where: { id: input.articleId, tenantId },
      select: { id: true },
    });
    if (!article) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Article not found' });
    }

    const feedback = await ctx.prismaWithTenant.articleFeedback.create({
      data: {
        articleId: input.articleId,
        helpful: input.value === 'helpful',
        comment: input.comment,
        userId: ctx.tenant.userId,
        tenantId,
      },
    });

    return { id: feedback.id, helpful: feedback.helpful, createdAt: feedback.createdAt };
  }),

  /**
   * Get aggregated feedback stats for a help article.
   * Returns helpful count, not-helpful count, and total.
   */
  getFeedbackStats: tenantProcedure.input(getFeedbackStatsSchema).query(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;

    const [helpful, total] = await Promise.all([
      ctx.prismaWithTenant.articleFeedback.count({
        where: { articleId: input.articleId, tenantId, helpful: true },
      }),
      ctx.prismaWithTenant.articleFeedback.count({
        where: { articleId: input.articleId, tenantId },
      }),
    ]);

    return { helpful, notHelpful: total - helpful, total };
  }),
});
