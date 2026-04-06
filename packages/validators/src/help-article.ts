/**
 * Help Article Validation Schemas (IFC-299)
 *
 * Zod schemas for the helpArticle tRPC router.
 * ArticleStatus is a Prisma-only enum (DRAFT/PUBLISHED),
 * not derived from domain constants.
 */

import { z } from 'zod';

// ─── Article Status ──────────────────────────────────────────────────────────

export const articleStatusSchema = z.enum(['DRAFT', 'PUBLISHED']);
export type ArticleStatus = z.infer<typeof articleStatusSchema>;

// ─── Section Input ───────────────────────────────────────────────────────────

export const articleSectionInputSchema = z.object({
  heading: z.string().min(1).max(500),
  content: z.string().min(1),
  blocks: z.unknown().optional(),
  order: z.number().int().min(0).default(0),
});

export type ArticleSectionInput = z.infer<typeof articleSectionInputSchema>;

// ─── Create Article ──────────────────────────────────────────────────────────

export const createHelpArticleSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, 'Slug must be kebab-case (lowercase letters, numbers, hyphens)'),
  title: z.string().min(1).max(500),
  categoryId: z.string().min(1).max(100),
  excerpt: z.string().min(1).max(1000),
  readTimeMinutes: z.number().int().min(1).max(60),
  keywords: z.array(z.string().max(100)).max(20).default([]),
  relatedArticleIds: z.array(z.string()).max(10).default([]),
  order: z.number().int().min(0).default(0),
  sections: z.array(articleSectionInputSchema).min(1),
});

export type CreateHelpArticleInput = z.infer<typeof createHelpArticleSchema>;

// ─── Update Article ──────────────────────────────────────────────────────────

export const updateHelpArticleSchema = z.object({
  id: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, 'Slug must be kebab-case')
    .optional(),
  title: z.string().min(1).max(500).optional(),
  categoryId: z.string().min(1).max(100).optional(),
  excerpt: z.string().min(1).max(1000).optional(),
  readTimeMinutes: z.number().int().min(1).max(60).optional(),
  keywords: z.array(z.string().max(100)).max(20).optional(),
  relatedArticleIds: z.array(z.string()).max(10).optional(),
  order: z.number().int().min(0).optional(),
  sections: z.array(articleSectionInputSchema).optional(),
});

export type UpdateHelpArticleInput = z.infer<typeof updateHelpArticleSchema>;

// ─── Query / List ────────────────────────────────────────────────────────────

export const helpArticleQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  status: articleStatusSchema.optional(),
  categoryId: z.string().optional(),
  search: z.string().max(200).optional(),
  orderBy: z.enum(['order', 'createdAt', 'updatedAt', 'title']).default('order'),
  orderDir: z.enum(['asc', 'desc']).default('asc'),
});

export type HelpArticleQueryInput = z.infer<typeof helpArticleQuerySchema>;

// ─── Simple Inputs ───────────────────────────────────────────────────────────

export const helpArticleIdSchema = z.object({
  id: z.string().min(1),
});

export const helpArticleSlugSchema = z.object({
  slug: z.string().min(1),
});

export const helpArticleCategorySchema = z.object({
  categoryId: z.string().min(1),
  includeUnpublished: z.boolean().default(false),
});
