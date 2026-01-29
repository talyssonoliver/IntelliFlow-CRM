'use client';

import Link from 'next/link';

interface BlogPaginationProps {
  currentPage: number;
  totalPages: number;
  basePath?: string;
}

export function BlogPagination({
  currentPage,
  totalPages,
  basePath = '/blog'
}: BlogPaginationProps) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  return (
    <nav
      aria-label="Blog pagination"
      className="flex items-center justify-center gap-2"
    >
      {/* Previous Button */}
      {canGoPrev ? (
        <Link
          href={currentPage === 2 ? basePath : `${basePath}?page=${currentPage - 1}`}
          className="inline-flex items-center gap-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          aria-label="Go to previous page"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            chevron_left
          </span>
          <span className="hidden sm:inline">Previous</span>
        </Link>
      ) : (
        <span
          className="inline-flex items-center gap-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-600 cursor-not-allowed"
          aria-disabled="true"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            chevron_left
          </span>
          <span className="hidden sm:inline">Previous</span>
        </span>
      )}

      {/* Page Numbers */}
      <div className="flex items-center gap-1">
        {pages.map((page) => {
          const isActive = page === currentPage;

          if (isActive) {
            return (
              <span
                key={page}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-[#137fec] text-white font-medium"
                aria-current="page"
              >
                {page}
              </span>
            );
          }

          return (
            <Link
              key={page}
              href={page === 1 ? basePath : `${basePath}?page=${page}`}
              className="w-10 h-10 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              aria-label={`Go to page ${page}`}
            >
              {page}
            </Link>
          );
        })}
      </div>

      {/* Next Button */}
      {canGoNext ? (
        <Link
          href={`${basePath}?page=${currentPage + 1}`}
          className="inline-flex items-center gap-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          aria-label="Go to next page"
        >
          <span className="hidden sm:inline">Next</span>
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            chevron_right
          </span>
        </Link>
      ) : (
        <span
          className="inline-flex items-center gap-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-600 cursor-not-allowed"
          aria-disabled="true"
        >
          <span className="hidden sm:inline">Next</span>
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            chevron_right
          </span>
        </span>
      )}
    </nav>
  );
}
