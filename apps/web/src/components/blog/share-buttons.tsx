'use client';

interface ShareButtonsProps {
  title: string;
  slug: string;
}

export function ShareButtons({ title, slug }: ShareButtonsProps) {
  const postUrl = `https://intelliflow.com/blog/${slug}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard?.writeText(postUrl);
    } catch {
      // Fallback for older browsers
      console.log('Copy to clipboard failed');
    }
  };

  return (
    <div className="mt-8 flex items-center gap-4">
      <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
        Share:
      </span>
      <div className="flex gap-2">
        <a
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(postUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-[#1DA1F2] hover:text-white transition-colors"
          aria-label="Share on Twitter"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            share
          </span>
        </a>
        <a
          href={`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(postUrl)}&title=${encodeURIComponent(title)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-[#0A66C2] hover:text-white transition-colors"
          aria-label="Share on LinkedIn"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            work
          </span>
        </a>
        <button
          onClick={handleCopyLink}
          className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          aria-label="Copy link"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            link
          </span>
        </button>
      </div>
    </div>
  );
}
