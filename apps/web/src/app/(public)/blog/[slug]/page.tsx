import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@intelliflow/ui';
import {
  MarkdownRenderer,
  ReadingProgress,
  TableOfContents,
} from '@/components/blog/markdown-renderer';
import { CommentsWidget } from '@/components/blog/comments-widget';
import { ShareButtons } from '@/components/blog/share-buttons';
import { AppAvatar } from '@/components/shared/app-avatar';
import { blogPosts, type BlogPost } from '@/data/blog-posts';

// Get all slugs for static generation
export function generateStaticParams() {
  return Object.keys(blogPosts).map((slug) => ({
    slug,
  }));
}

// Generate metadata for SEO
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = blogPosts[slug];

  if (!post) {
    return {
      title: 'Post Not Found | IntelliFlow Blog',
    };
  }

  return {
    title: `${post.title} | IntelliFlow Blog`,
    description: post.excerpt,
    authors: [{ name: post.author.name }],
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      publishedTime: post.publishedAt,
      authors: [post.author.name],
      tags: post.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
    },
  };
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Related posts (simple implementation - would be smarter in production)
function getRelatedPosts(currentSlug: string, category: string): BlogPost[] {
  return Object.values(blogPosts)
    .filter((post) => post.slug !== currentSlug && post.category === category)
    .slice(0, 3);
}

export default async function BlogPostPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = blogPosts[slug];

  if (!post) {
    notFound();
  }

  const relatedPosts = getRelatedPosts(slug, post.category);

  return (
    <>
      <ReadingProgress />

      <main id="main-content" className="bg-white dark:bg-slate-900 min-h-screen">
        {/* Article Header */}
        <header className="bg-gradient-to-br from-[#0f172a] via-[#0d1b2a] to-[#0b1f37] text-white py-16 lg:py-20">
          <div className="container px-4 lg:px-6 mx-auto max-w-4xl">
            {/* Breadcrumb */}
            <nav aria-label="Breadcrumb" className="mb-6">
              <ol className="flex items-center gap-2 text-sm text-slate-300">
                <li>
                  <Link href="/" className="hover:text-white transition-colors">
                    Home
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li>
                  <Link href="/blog" className="hover:text-white transition-colors">
                    Blog
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="text-slate-400 truncate max-w-[200px]">
                  {post.title}
                </li>
              </ol>
            </nav>

            {/* Category & Read Time */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-[#137fec]/20 text-[#7cc4ff]">
                {post.category}
              </span>
              <span className="text-slate-300 text-sm">{post.readTime}</span>
            </div>

            {/* Title */}
            <h1 className="text-3xl lg:text-4xl xl:text-5xl font-bold mb-6 leading-tight">
              {post.title}
            </h1>

            {/* Excerpt */}
            <p className="text-lg text-slate-200 mb-8 max-w-3xl">{post.excerpt}</p>

            {/* Author Info */}
            <div className="flex items-center gap-4">
              <AppAvatar
                name={post.author.name}
                src={post.author.avatar ?? null}
                className="w-12 h-12"
                fallbackText="person"
                fallbackClassName="bg-slate-700 text-slate-300 material-symbols-outlined text-base"
              />
              <div>
                <p className="font-medium text-white">{post.author.name}</p>
                <p className="text-sm text-slate-300">
                  {post.author.role} &middot; {formatDate(post.publishedAt)}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Article Body */}
        <div className="container px-4 lg:px-6 mx-auto max-w-4xl py-12">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Sidebar (Table of Contents) */}
            <aside className="lg:w-64 lg:flex-shrink-0 lg:sticky lg:top-20 lg:self-start">
              <div className="hidden lg:block">
                <TableOfContents content={post.content} />
              </div>
            </aside>

            {/* Main Content */}
            <article className="flex-1 min-w-0">
              <MarkdownRenderer content={post.content} />

              {/* Tags */}
              <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">
                  Topics
                </h3>
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <Link
                      key={tag}
                      href={`/blog?tag=${encodeURIComponent(tag.toLowerCase())}`}
                      className="px-3 py-1 rounded-full text-sm bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-[#137fec]/10 hover:text-[#137fec] transition-colors"
                    >
                      {tag}
                    </Link>
                  ))}
                </div>
              </div>

              {/* Author Bio */}
              {post.author.bio && (
                <Card className="mt-8 p-6 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="flex gap-4">
                    <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                      <span
                        className="material-symbols-outlined text-2xl text-slate-500 dark:text-slate-300"
                        aria-hidden="true"
                      >
                        person
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white">
                        About {post.author.name}
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                        {post.author.role}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {post.author.bio}
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Share Buttons */}
              <ShareButtons title={post.title} slug={post.slug} />

              {/* Comments Section */}
              <CommentsWidget postSlug={post.slug} />
            </article>
          </div>
        </div>

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <section
            aria-labelledby="related-heading"
            className="bg-slate-50 dark:bg-slate-800 py-16"
          >
            <div className="container px-4 lg:px-6 mx-auto max-w-auto">
              <h2
                id="related-heading"
                className="text-2xl font-bold text-slate-900 dark:text-white mb-8"
              >
                Related Articles
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {relatedPosts.map((relatedPost) => (
                  <Card
                    key={relatedPost.id}
                    className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-[#137fec] transition-colors group"
                  >
                    <Link href={`/blog/${relatedPost.slug}`} className="block space-y-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {relatedPost.category}
                      </span>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white group-hover:text-[#137fec] transition-colors">
                        {relatedPost.title}
                      </h3>
                      <p className="text-slate-600 dark:text-slate-300 text-sm line-clamp-2">
                        {relatedPost.excerpt}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {relatedPost.author.name} &middot; {relatedPost.readTime}
                      </p>
                    </Link>
                  </Card>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* CTA Section */}
        <section className="py-16 bg-gradient-to-r from-[#137fec] to-[#0e6ac7]">
          <div className="container px-4 lg:px-6 mx-auto max-w-4xl text-center">
            <h2 className="text-2xl lg:text-3xl font-bold text-white mb-4">
              Ready to transform your sales process?
            </h2>
            <p className="text-white/90 mb-6 max-w-2xl mx-auto">
              See how IntelliFlow's AI-powered CRM can help your team close more deals with
              governance-ready automation.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/contact"
                className="px-6 py-3 bg-white text-[#137fec] font-semibold rounded-lg hover:bg-slate-100 transition-colors"
              >
                Schedule a Demo
              </Link>
              <Link
                href="/pricing"
                className="px-6 py-3 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition-colors border border-white/30"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
