import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@intelliflow/ui';
import { MarkdownRenderer, ReadingProgress, TableOfContents } from '@/components/blog/markdown-renderer';
import { CommentsWidget } from '@/components/blog/comments-widget';
import { ShareButtons } from '@/components/blog/share-buttons';

// Blog post data structure
interface BlogPost {
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

// Sample blog posts with full content (in production, fetch from CMS/API)
const blogPosts: Record<string, BlogPost> = {
  'ai-lead-scoring-best-practices': {
    id: '1',
    slug: 'ai-lead-scoring-best-practices',
    title: 'AI Lead Scoring: Best Practices for Modern Sales Teams',
    excerpt: 'Learn how to implement AI-powered lead scoring that improves conversion rates while maintaining human oversight.',
    category: 'AI & Automation',
    author: {
      name: 'Sarah Chen',
      role: 'Head of AI',
      bio: 'Sarah leads AI research at IntelliFlow, focusing on responsible AI implementation in enterprise sales.',
    },
    publishedAt: '2025-12-28',
    readTime: '8 min read',
    tags: ['AI', 'Lead Scoring', 'Sales Automation', 'Best Practices'],
    featured: true,
    content: `
# AI Lead Scoring: Best Practices for Modern Sales Teams

In today's competitive sales landscape, the difference between winning and losing deals often comes down to knowing which leads to prioritize. AI-powered lead scoring has emerged as a game-changer, but implementing it effectively requires careful consideration of both technology and human factors.

## Why Traditional Lead Scoring Falls Short

Traditional lead scoring relies on static rules: a lead from a Fortune 500 company gets 10 points, a marketing director gets 5 points, and so on. While simple to understand, this approach has significant limitations:

- **Recency bias**: Rules are based on past successful deals, not future potential
- **Context blindness**: A startup CTO might be more valuable than a Fortune 500 intern
- **Maintenance burden**: Rules need constant updating as markets change
- **False precision**: Arbitrary point values suggest confidence that doesn't exist

## The AI Advantage

Machine learning models can identify patterns humans miss. They analyze:

- **Behavioral signals**: Website visits, email engagement, content downloads
- **Firmographic data**: Company size, industry, growth trajectory
- **Timing patterns**: Best days/times for outreach, buying cycle indicators
- **Historical outcomes**: What actually led to closed deals, not just what we assumed

> "The best AI scoring systems don't replace sales intuition—they augment it with data patterns impossible for humans to detect at scale."

## Implementation Best Practices

### 1. Start with Clean Data

Your AI model is only as good as your data. Before implementation:

\`\`\`typescript
// Example data validation
const validateLeadData = (lead: Lead) => {
  const requiredFields = ['email', 'company', 'source'];
  const missingFields = requiredFields.filter(f => !lead[f]);

  if (missingFields.length > 0) {
    throw new DataQualityError(\`Missing: \${missingFields.join(', ')}\`);
  }

  return true;
};
\`\`\`

### 2. Define Clear Outcomes

What constitutes a "good" lead? Be specific:

- **Conversion to opportunity**: Lead progressed to sales pipeline
- **Revenue generated**: Actual closed deal value
- **Time to close**: Speed of conversion matters for CAC calculations
- **Expansion potential**: First deal that led to larger account

### 3. Implement Human-in-the-Loop

AI should inform, not decide. Best practices:

- Show confidence scores alongside recommendations
- Allow sales reps to override with documented reasoning
- Feed overrides back into model training
- Flag edge cases for human review

### 4. Monitor and Iterate

AI models drift over time. Implement:

- Weekly accuracy metrics dashboards
- A/B testing of model versions
- Feedback loops from sales outcomes
- Quarterly model retraining cycles

## Common Pitfalls to Avoid

1. **Over-reliance on demographics**: Behavior signals often matter more
2. **Ignoring negative signals**: Bounced emails and unsubscribes are informative
3. **Static thresholds**: What's "hot" this quarter may be cold next quarter
4. **Lack of explainability**: Sales teams won't trust black-box scores

## Measuring Success

Track these KPIs to validate your AI scoring:

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Conversion rate lift | +20% | Direct ROI indicator |
| Time to qualification | -30% | Efficiency gain |
| Rep adoption | >80% | Trust and usability |
| False positive rate | <15% | Score accuracy |

## Conclusion

AI lead scoring, when implemented thoughtfully, becomes a force multiplier for sales teams. The key is treating it as a tool that enhances human judgment rather than replacing it. Start small, iterate based on feedback, and always keep the human in the loop.

---

*Want to see how IntelliFlow's AI scoring works? [Schedule a demo](/contact) to see it in action.*
    `,
  },
  'governance-ready-automation': {
    id: '2',
    slug: 'governance-ready-automation',
    title: 'Building Governance-Ready Automation Workflows',
    excerpt: 'How to design automation workflows that satisfy compliance requirements without slowing down your team.',
    category: 'Governance & Compliance',
    author: {
      name: 'Michael Torres',
      role: 'Compliance Lead',
      bio: 'Michael ensures IntelliFlow meets enterprise compliance standards including SOC 2 and GDPR.',
    },
    publishedAt: '2025-12-25',
    readTime: '6 min read',
    tags: ['Governance', 'Automation', 'Compliance', 'Audit Trail'],
    featured: true,
    content: `
# Building Governance-Ready Automation Workflows

Automation is powerful, but uncontrolled automation is a compliance nightmare. Here's how to build workflows that auditors love and teams actually use.

## The Governance Paradox

Companies want automation for speed, but governance demands accountability. These goals seem at odds:

- **Speed**: Fewer approvals, instant actions
- **Governance**: Documentation, audit trails, human oversight

The solution isn't choosing one over the other—it's designing systems where both coexist.

## Core Principles

### 1. Audit Everything by Default

Every automated action should be logged with:

- **Who triggered it** (user, system, AI agent)
- **What changed** (before/after state)
- **When it happened** (timestamp with timezone)
- **Why it occurred** (trigger condition or reasoning)

### 2. Graduated Autonomy

Not all actions carry equal risk. Design tiers:

\`\`\`
Level 1: Auto-execute, log only (status updates)
Level 2: Auto-execute, notify stakeholder (email sends)
Level 3: Propose action, require approval (deal stage changes)
Level 4: Escalate to human (contract modifications)
\`\`\`

### 3. Explicit Rollback Paths

Every automation should have a documented undo path:

- What state was changed?
- How can it be reverted?
- What's the impact of rollback?
- Who is authorized to rollback?

## Implementation Patterns

### The Approval Queue

For Level 3+ actions, implement an approval workflow:

\`\`\`typescript
interface ApprovalRequest {
  id: string;
  action: AutomatedAction;
  proposedBy: 'ai' | 'system' | 'user';
  reasoning: string;
  confidence: number;
  expiresAt: Date;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}
\`\`\`

### Audit Trail Schema

Structure your audit logs for compliance:

- Immutable storage (append-only)
- Retention policies (7+ years for financial)
- Searchable by entity, actor, date range
- Exportable for auditor review

## Real-World Example

A financial services company needed to automate lead assignment while maintaining SOC 2 compliance:

**Before**: Manual assignment by sales manager, 2-hour delays
**After**: AI-recommended assignment with 15-minute approval SLA

The automation included:
- Confidence score displayed with each recommendation
- Manager approval required above $50K deal potential
- Full audit trail of assignments and reasoning
- Weekly accuracy reports for continuous improvement

Result: 85% faster lead routing with 100% audit compliance.

## Conclusion

Governance and automation aren't enemies—they're partners when designed correctly. Build for audit from day one, implement graduated autonomy, and always maintain human oversight for high-impact decisions.
    `,
  },
};

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
    .filter(post => post.slug !== currentSlug && post.category === category)
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
            <p className="text-lg text-slate-200 mb-8 max-w-3xl">
              {post.excerpt}
            </p>

            {/* Author Info */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center">
                {post.author.avatar ? (
                  <img
                    src={post.author.avatar}
                    alt=""
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <span className="material-symbols-outlined text-slate-300" aria-hidden="true">
                    person
                  </span>
                )}
              </div>
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
                  {post.tags.map(tag => (
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
                      <span className="material-symbols-outlined text-2xl text-slate-500 dark:text-slate-300" aria-hidden="true">
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
          <section aria-labelledby="related-heading" className="bg-slate-50 dark:bg-slate-800 py-16">
            <div className="container px-4 lg:px-6 mx-auto max-w-auto">
              <h2 id="related-heading" className="text-2xl font-bold text-slate-900 dark:text-white mb-8">
                Related Articles
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {relatedPosts.map(relatedPost => (
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
              See how IntelliFlow's AI-powered CRM can help your team close more deals with governance-ready automation.
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
