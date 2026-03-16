import Link from 'next/link';
import { MarkdownRenderer } from '@/components/blog/markdown-renderer';
import { ShareButtons } from '@/components/blog/share-buttons';

export interface PressRelease {
  id: string;
  date: string;
  title: string;
  summary: string;
  category: string;
  featured: boolean;
  body: string;
  quotes: Array<{
    text: string;
    attribution: string;
  }>;
  boilerplate: string;
  readTime?: string;
}

export interface PressReleaseDetailProps {
  release: PressRelease;
  relatedReleases: PressRelease[];
  pressContact: {
    name: string;
    email: string;
    phone: string;
  };
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    Product: '#137fec',
    Security: '#10b981',
    Partnership: '#8b5cf6',
    Company: '#f59e0b',
  };
  return colors[category] || '#6b7280';
}

export function PressReleaseDetail({
  release,
  relatedReleases,
  pressContact,
}: Readonly<PressReleaseDetailProps>) {
  if (!release) {
    return null;
  }

  const categoryColor = getCategoryColor(release.category);

  return (
    <>
      {/* Breadcrumb Navigation */}
      <nav
        aria-label="Breadcrumb"
        className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700"
      >
        <div className="container px-4 lg:px-6 mx-auto max-w-4xl py-3">
          <ol className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
            <li>
              <Link href="/" className="hover:text-[#137fec] transition-colors">
                Home
              </Link>
            </li>
            <li aria-hidden="true" className="mx-1">
              <span className="material-symbols-outlined text-xs" aria-hidden="true">
                chevron_right
              </span>
            </li>
            <li>
              <Link href="/press" className="hover:text-[#137fec] transition-colors">
                Press
              </Link>
            </li>
            <li aria-hidden="true" className="mx-1">
              <span className="material-symbols-outlined text-xs" aria-hidden="true">
                chevron_right
              </span>
            </li>
            <li
              aria-current="page"
              className="text-slate-900 dark:text-white font-medium truncate max-w-xs"
            >
              {release.title}
            </li>
          </ol>
        </div>
      </nav>

      <article aria-labelledby="pr-title" className="bg-white dark:bg-slate-800">
        {/* Back Link */}
        <div className="container px-4 lg:px-6 mx-auto max-w-4xl pt-6">
          <Link
            href="/press"
            className="inline-flex items-center gap-1 text-sm text-[#137fec] hover:text-[#0e6ac7] font-medium transition-colors"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              arrow_back
            </span>{' '}
            Back to Press Releases
          </Link>
        </div>

        {/* Header Section */}
        <header className="container px-4 lg:px-6 mx-auto max-w-4xl pt-8 pb-6">
          <div className="flex items-center gap-3 mb-4">
            <span
              className="px-3 py-1 text-xs font-semibold rounded-full"
              style={{
                backgroundColor: `${categoryColor}15`,
                color: categoryColor,
              }}
            >
              {release.category}
            </span>
            <time dateTime={release.date} className="text-sm text-slate-500 dark:text-slate-400">
              {formatDate(release.date)}
            </time>
            {release.readTime && (
              <span className="text-sm text-slate-400 dark:text-slate-500">{release.readTime}</span>
            )}
          </div>

          <h1
            id="pr-title"
            className="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-4"
          >
            {release.title}
          </h1>

          <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
            {release.summary}
          </p>
        </header>

        {/* Body Content */}
        <div className="container px-4 lg:px-6 mx-auto max-w-4xl pb-8">
          <MarkdownRenderer
            content={release.body}
            className="prose prose-slate dark:prose-invert max-w-none"
          />
        </div>

        {/* Executive Quotes */}
        {release.quotes.length > 0 && (
          <div className="container px-4 lg:px-6 mx-auto max-w-4xl pb-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
              Executive Commentary
            </h2>
            <div className="space-y-6">
              {release.quotes.map((quote, index) => (
                <blockquote key={index} className="border-l-4 border-[#137fec] pl-6 py-2"> {/* NOSONAR typescript:S6479 */}
                  <p className="text-lg text-slate-700 dark:text-slate-300 italic mb-2">
                    &ldquo;{quote.text}&rdquo;
                  </p>
                  <footer className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                    &mdash; {quote.attribution}
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        )}

        {/* Boilerplate / About IntelliFlow */}
        <div className="container px-4 lg:px-6 mx-auto max-w-4xl pb-8">
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
              About IntelliFlow
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {release.boilerplate}
            </p>
          </div>
        </div>

        {/* Press Contact */}
        <div className="container px-4 lg:px-6 mx-auto max-w-4xl pb-8">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Press Contact</h2>
          <div className="flex flex-col sm:flex-row gap-4 text-sm">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                person
              </span>
              <span>{pressContact.name}</span>
            </div>
            <a
              href={`mailto:${pressContact.email}`}
              className="flex items-center gap-2 text-[#137fec] hover:text-[#0e6ac7] transition-colors"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                mail
              </span>
              <span>{pressContact.email}</span>
            </a>
            <a
              href={`tel:${pressContact.phone.replaceAll(/[^+\d]/g, '')}`}
              className="flex items-center gap-2 text-[#137fec] hover:text-[#0e6ac7] transition-colors"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                phone
              </span>
              <span>{pressContact.phone}</span>
            </a>
          </div>
        </div>

        {/* Share Buttons */}
        <div className="container px-4 lg:px-6 mx-auto max-w-4xl pb-8">
          <ShareButtons title={release.title} slug={release.id} url={`/press/${release.id}`} />
        </div>
      </article>

      {/* Related Releases */}
      {relatedReleases.length > 0 && (
        <section
          aria-labelledby="related-releases-heading"
          className="bg-slate-50 dark:bg-slate-900 py-12"
        >
          <div className="container px-4 lg:px-6 mx-auto max-w-4xl">
            <h2
              id="related-releases-heading"
              className="text-2xl font-bold text-slate-900 dark:text-white mb-8"
            >
              More Press Releases
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {relatedReleases.map((related) => (
                <Link
                  key={related.id}
                  href={`/press/${related.id}`}
                  aria-label={`Read full press release: ${related.title}`}
                  className="block p-6 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-[#137fec] hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="px-2 py-0.5 text-xs font-semibold rounded-full"
                      style={{
                        backgroundColor: `${getCategoryColor(related.category)}15`,
                        color: getCategoryColor(related.category),
                      }}
                    >
                      {related.category}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(related.date)}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                    {related.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                    {related.summary}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
