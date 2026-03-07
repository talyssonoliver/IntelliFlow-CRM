'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@intelliflow/ui';

interface ApplyButtonProps {
  jobId: string;
  jobTitle: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  className?: string;
  showIcon?: boolean;
}

/**
 * ApplyButton - Primary CTA for job applications
 *
 * Features:
 * - Links to application form with pre-selected job
 * - Tracks analytics events for conversion tracking
 * - Supports multiple visual variants
 * - Accessible with proper ARIA attributes
 */
export function ApplyButton({
  jobId,
  jobTitle,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  showIcon = true,
}: Readonly<ApplyButtonProps>) {
  const handleClick = () => {
    // Track analytics event (in production, integrate with analytics service)
    if (typeof globalThis.window !== 'undefined') {
      const win = globalThis as typeof globalThis & {
        gtag?: (cmd: string, event: string, data: Record<string, string>) => void;
      };
      win.gtag?.('event', 'apply_click', {
        job_id: jobId,
        job_title: jobTitle,
      });
    }
  };

  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-2.5 text-base',
    lg: 'px-8 py-3 text-lg',
  };

  const variantClasses = {
    primary: 'bg-[#137fec] text-white hover:bg-[#0e6ac7] focus:ring-[#7cc4ff]',
    secondary:
      'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 focus:ring-slate-400',
    outline:
      'bg-transparent border-2 border-[#137fec] text-[#137fec] hover:bg-[#137fec]/10 focus:ring-[#137fec]',
  };

  return (
    <Link
      href={`/careers/${jobId}#apply`}
      onClick={handleClick}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-offset-2',
        sizeClasses[size],
        variantClasses[variant],
        fullWidth && 'w-full',
        className
      )}
      aria-label={`Apply for ${jobTitle} position`}
    >
      Apply Now
      {showIcon && (
        <span className="material-symbols-outlined text-lg" aria-hidden="true">
          arrow_forward
        </span>
      )}
    </Link>
  );
}

/**
 * SaveJobButton - Secondary action to save job for later
 */
interface SaveJobButtonProps {
  jobId: string;
  jobTitle: string;
  className?: string;
}

export function SaveJobButton({ jobId, jobTitle, className }: Readonly<SaveJobButtonProps>) {
  const [isSaved, setIsSaved] = React.useState(false);

  const handleSave = () => {
    setIsSaved(!isSaved);

    // In production, persist to user's saved jobs list
    if (typeof globalThis.window !== 'undefined') {
      const savedJobs = JSON.parse(localStorage.getItem('savedJobs') || '[]');
      if (isSaved) {
        localStorage.setItem(
          'savedJobs',
          JSON.stringify(savedJobs.filter((id: string) => id !== jobId))
        );
      } else {
        localStorage.setItem('savedJobs', JSON.stringify([...savedJobs, jobId]));
      }
    }
  };

  React.useEffect(() => {
    // Check if job is already saved on mount
    if (typeof globalThis.window !== 'undefined') {
      const savedJobs = JSON.parse(localStorage.getItem('savedJobs') || '[]');
      setIsSaved(savedJobs.includes(jobId));
    }
  }, [jobId]);

  return (
    <button
      onClick={handleSave}
      className={cn(
        'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
        'border border-slate-200 dark:border-slate-700',
        isSaved
          ? 'bg-[#137fec]/10 text-[#137fec] border-[#137fec]'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
        className
      )}
      aria-pressed={isSaved}
      aria-label={isSaved ? `Remove ${jobTitle} from saved jobs` : `Save ${jobTitle} for later`} // NOSONAR typescript:S4624 — ternary between two sibling template literals, not a nested template
    >
      <span className="material-symbols-outlined text-lg" aria-hidden="true">
        {isSaved ? 'bookmark' : 'bookmark_border'}
      </span>
      {isSaved ? 'Saved' : 'Save for Later'}
    </button>
  );
}

/**
 * ShareJobButton - Share job via various channels
 */
interface ShareJobButtonProps {
  jobId: string;
  jobTitle: string;
  className?: string;
}

export function ShareJobButton({ jobId, jobTitle, className }: Readonly<ShareJobButtonProps>) {
  const [showDropdown, setShowDropdown] = React.useState(false);

  const jobUrl =
    typeof globalThis.window === 'undefined'
      ? `/careers/${jobId}`
      : `${globalThis.location.origin}/careers/${jobId}`;

  const linkedInTitle = `${jobTitle} at IntelliFlow`;
  const twitterText = `Check out this opportunity: ${jobTitle} at IntelliFlow`;
  const emailSubject = `Job Opportunity: ${jobTitle} at IntelliFlow`;
  const emailBody = `I thought you might be interested in this role:

${jobTitle}

${jobUrl}`;
  const shareOptions = [
    {
      label: 'Copy Link',
      icon: 'link',
      action: () => {
        navigator.clipboard?.writeText(jobUrl);
        setShowDropdown(false);
      },
    },
    {
      label: 'Share on LinkedIn',
      icon: 'work',
      action: () => {
        globalThis.open(
          `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(jobUrl)}&title=${encodeURIComponent(linkedInTitle)}`,
          '_blank'
        );
        setShowDropdown(false);
      },
    },
    {
      label: 'Share on Twitter',
      icon: 'share',
      action: () => {
        globalThis.open(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterText)}&url=${encodeURIComponent(jobUrl)}`,
          '_blank'
        );
        setShowDropdown(false);
      },
    },
    {
      label: 'Email',
      icon: 'mail',
      action: () => {
        globalThis.open(
          `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`,
          '_blank'
        );
        setShowDropdown(false);
      },
    },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={cn(
          'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
          'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300',
          'hover:bg-slate-100 dark:hover:bg-slate-800',
          className
        )}
        aria-expanded={showDropdown}
        aria-haspopup="menu"
        aria-label="Share this job"
      >
        <span className="material-symbols-outlined text-lg" aria-hidden="true">
          share
        </span>{' '}
        Share
      </button>

      {showDropdown && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label="Close share menu"
            onClick={() => setShowDropdown(false)}
          />
          <div
            role="menu"
            className="absolute right-0 mt-2 w-48 rounded-lg bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 z-20 py-1"
          >
            {shareOptions.map((option) => (
              <button
                key={option.label}
                onClick={option.action}
                role="menuitem"
                className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-3"
              >
                <span
                  className="material-symbols-outlined text-lg text-slate-500 dark:text-slate-400"
                  aria-hidden="true"
                >
                  {option.icon}
                </span>
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
