/** Blog post data module — single source of truth for blog post data used by sitemap.ts and blog/[slug]/page.tsx */

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  author: {
    name: string;
    role: string;
    bio?: string;
    avatar?: string;
  };
  publishedAt: string;
  updatedAt?: string;
  readTime: string;
  tags: string[];
  featured: boolean;
}

// In production, fetch from CMS/API

/**
 * Published posts, keyed by slug. Empty until Aurora publishes its first post: every
 * entry must be written by a real person about something that happened.
 */
export const blogPosts: Record<string, BlogPost> = {};
