import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import { OG_IMAGES } from '@/lib/og-images';
import { blogPosts as postsBySlug } from '@/data/blog-posts';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Posts from the Aurora team on AI-first CRM, sales automation and governance.',
  openGraph: {
    images: OG_IMAGES,
    title: 'Aurora Blog',
    description: 'Posts from the Aurora team on AI-first CRM, sales automation and governance.',
    type: 'website',
  },
};

// Blog post categories
const categories = [
  { id: 'all', label: 'All Posts' },
  { id: 'ai-automation', label: 'AI & Automation' },
  { id: 'sales-strategy', label: 'Sales Strategy' },
  { id: 'product-updates', label: 'Product Updates' },
  { id: 'case-studies', label: 'Case Studies' },
  { id: 'governance', label: 'Governance & Compliance' },
];

// Published posts only, newest first. Empty until the first real post is published.
const blogPosts = Object.values(postsBySlug).sort((a, b) =>
  b.publishedAt.localeCompare(a.publishedAt)
);

function getCategoryLabel(categoryId: string): string {
  return categories.find((c) => c.id === categoryId)?.label ?? categoryId;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function BlogIndexPage() {
  const featuredPosts = blogPosts.filter((p) => p.featured);
  const regularPosts = blogPosts.filter((p) => !p.featured);

  return (
    <div className="bg-slate-50 dark:bg-slate-900 min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#11175b] via-[#11175b] to-[#11175b] text-white py-16 lg:py-24">
        <div className="container px-4 lg:px-6 mx-auto max-w-auto">
          <div className="max-w-3xl">
            <h1 className="text-4xl lg:text-5xl font-bold mb-4">Aurora Blog</h1>
            <p className="text-lg text-slate-200">
              Posts from the Aurora team on AI-first CRM, sales automation and governance.
            </p>
          </div>
        </div>
      </section>

      {blogPosts.length === 0 ? (
        <section className="py-16">
          <div className="container px-4 lg:px-6 mx-auto max-w-2xl">
            <Card className="p-8 lg:p-12 text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <span
                className="material-symbols-outlined text-4xl text-slate-400 mb-4"
                aria-hidden="true"
              >
                article
              </span>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
                No posts yet
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                The first posts from the Aurora team will appear here.
              </p>
            </Card>
          </div>
        </section>
      ) : (
        <>
          {/* Category Filter */}
          <section className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 sticky top-0 z-10">
            <div className="container px-4 lg:px-6 mx-auto max-w-auto">
              <nav aria-label="Blog categories" className="flex gap-2 py-4 overflow-x-auto">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors
                  ${
                    category.id === 'all'
                      ? 'bg-[#2a78f6] text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                  >
                    {category.label}
                  </button>
                ))}
              </nav>
            </div>
          </section>

          {/* Featured Posts */}
          <section aria-labelledby="featured-heading" className="py-12">
            <div className="container px-4 lg:px-6 mx-auto max-w-auto">
              <h2
                id="featured-heading"
                className="text-2xl font-bold text-slate-900 dark:text-white mb-6"
              >
                Featured Articles
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {featuredPosts.map((post) => (
                  <Card
                    key={post.id}
                    className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-[#2a78f6] transition-colors group"
                  >
                    <Link href={`/blog/${post.slug}`} className="block space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#2a78f6]/10 text-[#2a78f6]">
                          {getCategoryLabel(post.category)}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {post.readTime}
                        </span>
                      </div>
                      <h3 className="text-xl font-semibold text-slate-900 dark:text-white group-hover:text-[#2a78f6] transition-colors">
                        {post.title}
                      </h3>
                      <p className="text-slate-600 dark:text-slate-300 text-sm">{post.excerpt}</p>
                      <div className="flex items-center gap-3 pt-2">
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center">
                          <span
                            className="material-symbols-outlined text-sm text-slate-500 dark:text-slate-300"
                            aria-hidden="true"
                          >
                            person
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">
                            {post.author.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {formatDate(post.publishedAt)}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          {/* All Posts */}
          <section aria-labelledby="all-posts-heading" className="py-12 bg-white dark:bg-slate-800">
            <div className="container px-4 lg:px-6 mx-auto max-w-auto">
              <h2
                id="all-posts-heading"
                className="text-2xl font-bold text-slate-900 dark:text-white mb-6"
              >
                All Articles
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {regularPosts.map((post) => (
                  <Card
                    key={post.id}
                    className="p-5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-[#2a78f6] transition-colors group"
                  >
                    <Link href={`/blog/${post.slug}`} className="block space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          {getCategoryLabel(post.category)}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {post.readTime}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white group-hover:text-[#2a78f6] transition-colors">
                        {post.title}
                      </h3>
                      <p className="text-slate-600 dark:text-slate-300 text-sm line-clamp-2">
                        {post.excerpt}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 pt-2">
                        {post.author.name} &middot; {formatDate(post.publishedAt)}
                      </p>
                    </Link>
                  </Card>
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      {/* Newsletter CTA */}
      <section className="py-16 bg-gradient-to-r from-[#2a78f6] to-[#1f63d4]">
        <div className="container px-4 lg:px-6 mx-auto max-w-4xl text-center">
          <h2 className="text-2xl lg:text-3xl font-bold text-white mb-4">
            Stay ahead with Aurora insights
          </h2>
          <p className="text-white/90 mb-6">
            Get the latest on AI-powered sales, automation best practices, and product updates
            delivered to your inbox.
          </p>
          <form className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <label htmlFor="newsletter-email" className="sr-only">
              Email address
            </label>
            <input
              id="newsletter-email"
              type="email"
              placeholder="Enter your email"
              className="flex-1 px-4 py-3 rounded-lg text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-white"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-white text-[#2a78f6] font-semibold rounded-lg hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#2a78f6]"
            >
              Subscribe
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
