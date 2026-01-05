'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import { ApplyButton, SaveJobButton, ShareJobButton } from './apply-button';

export interface JobListing {
  id: string;
  title: string;
  department: string;
  location: string;
  type: string; // Full-time, Part-time, Contract
  description: string;
  responsibilities: string[];
  requirements: string[];
  niceToHave?: string[];
  benefits?: string[];
  salary?: {
    min: number;
    max: number;
    currency: string;
  };
  postedAt: string;
  closingDate?: string;
}

interface JobDetailTemplateProps {
  job: JobListing;
  relatedJobs?: JobListing[];
}

/**
 * JobDetailTemplate - Displays full job listing details
 *
 * Features:
 * - Full job description with responsibilities and requirements
 * - Sticky apply button on scroll
 * - Related jobs section
 * - Social sharing
 * - Print-friendly styles
 */
export function JobDetailTemplate({ job, relatedJobs = [] }: JobDetailTemplateProps) {
  const [showStickyApply, setShowStickyApply] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      const heroHeight = 400; // Approximate hero section height
      setShowStickyApply(window.scrollY > heroHeight);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatSalary = (salary: JobListing['salary']) => {
    if (!salary) return null;
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: salary.currency,
      maximumFractionDigits: 0,
    });
    return `${formatter.format(salary.min)} - ${formatter.format(salary.max)}`;
  };

  return (
    <>
      {/* Sticky Apply Bar */}
      {showStickyApply && (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 p-4 z-40 shadow-lg lg:hidden">
          <div className="container mx-auto flex items-center justify-between gap-4">
            <div className="truncate">
              <p className="font-semibold text-slate-900 dark:text-white truncate">
                {job.title}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {job.department}
              </p>
            </div>
            <ApplyButton
              jobId={job.id}
              jobTitle={job.title}
              size="sm"
              showIcon={false}
            />
          </div>
        </div>
      )}

      {/* Job Header */}
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
                <Link href="/careers" className="hover:text-white transition-colors">
                  Careers
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-slate-400 truncate max-w-[200px]">
                {job.title}
              </li>
            </ol>
          </nav>

          {/* Job Meta */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-[#137fec]/20 text-[#7cc4ff]">
              {job.department}
            </span>
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-white/10 text-slate-200">
              {job.type}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-3xl lg:text-4xl xl:text-5xl font-bold mb-6 leading-tight">
            {job.title}
          </h1>

          {/* Location & Details */}
          <div className="flex flex-wrap gap-4 text-slate-200 mb-8">
            <span className="inline-flex items-center gap-2">
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                location_on
              </span>
              {job.location}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                schedule
              </span>
              {job.type}
            </span>
            {job.salary && (
              <span className="inline-flex items-center gap-2">
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  payments
                </span>
                {formatSalary(job.salary)}
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-4">
            <ApplyButton jobId={job.id} jobTitle={job.title} size="lg" />
            <SaveJobButton jobId={job.id} jobTitle={job.title} />
            <ShareJobButton jobId={job.id} jobTitle={job.title} />
          </div>
        </div>
      </header>

      {/* Job Content */}
      <div className="container px-4 lg:px-6 mx-auto max-w-4xl py-12">
        <div className="flex flex-col lg:flex-row gap-12">
          {/* Main Content */}
          <div className="flex-1">
            {/* About the Role */}
            <section aria-labelledby="about-heading" className="mb-10">
              <h2 id="about-heading" className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
                About the Role
              </h2>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                {job.description}
              </p>
            </section>

            {/* Responsibilities */}
            <section aria-labelledby="responsibilities-heading" className="mb-10">
              <h2 id="responsibilities-heading" className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
                What You&apos;ll Do
              </h2>
              <ul className="space-y-3">
                {job.responsibilities.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-[#137fec] mt-0.5" aria-hidden="true">
                      check_circle
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Requirements */}
            <section aria-labelledby="requirements-heading" className="mb-10">
              <h2 id="requirements-heading" className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
                What We&apos;re Looking For
              </h2>
              <ul className="space-y-3">
                {job.requirements.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-slate-400 mt-0.5" aria-hidden="true">
                      arrow_right
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Nice to Have */}
            {job.niceToHave && job.niceToHave.length > 0 && (
              <section aria-labelledby="nice-heading" className="mb-10">
                <h2 id="nice-heading" className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
                  Nice to Have
                </h2>
                <ul className="space-y-3">
                  {job.niceToHave.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-amber-500 mt-0.5" aria-hidden="true">
                        star
                      </span>
                      <span className="text-slate-600 dark:text-slate-300">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Benefits */}
            {job.benefits && job.benefits.length > 0 && (
              <section aria-labelledby="benefits-heading" className="mb-10">
                <h2 id="benefits-heading" className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
                  Benefits & Perks
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {job.benefits.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800"
                    >
                      <span className="material-symbols-outlined text-[#137fec]" aria-hidden="true">
                        verified
                      </span>
                      <span className="text-sm text-slate-600 dark:text-slate-300">{item}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <aside className="lg:w-80 space-y-6">
            {/* Quick Info Card */}
            <Card className="p-6 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 sticky top-20">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
                Job Details
              </h3>
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Department</dt>
                  <dd className="font-medium text-slate-900 dark:text-white">{job.department}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Location</dt>
                  <dd className="font-medium text-slate-900 dark:text-white">{job.location}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Employment Type</dt>
                  <dd className="font-medium text-slate-900 dark:text-white">{job.type}</dd>
                </div>
                {job.salary && (
                  <div>
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Salary Range</dt>
                    <dd className="font-medium text-slate-900 dark:text-white">
                      {formatSalary(job.salary)}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Posted</dt>
                  <dd className="font-medium text-slate-900 dark:text-white">
                    {formatDate(job.postedAt)}
                  </dd>
                </div>
                {job.closingDate && (
                  <div>
                    <dt className="text-sm text-slate-500 dark:text-slate-400">Closing Date</dt>
                    <dd className="font-medium text-red-600 dark:text-red-400">
                      {formatDate(job.closingDate)}
                    </dd>
                  </div>
                )}
              </dl>

              <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                <ApplyButton
                  jobId={job.id}
                  jobTitle={job.title}
                  fullWidth
                />
              </div>
            </Card>

            {/* Contact Card */}
            <Card className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
                Questions?
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                Reach out to our talent team for any questions about this role.
              </p>
              <Link
                href="/contact?subject=careers"
                className="inline-flex items-center gap-2 text-sm text-[#137fec] font-medium hover:underline"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  mail
                </span>
                Contact Recruiting
              </Link>
            </Card>
          </aside>
        </div>
      </div>

      {/* Related Jobs */}
      {relatedJobs.length > 0 && (
        <section aria-labelledby="related-heading" className="bg-slate-50 dark:bg-slate-800 py-16">
          <div className="container px-4 lg:px-6 mx-auto max-w-auto">
            <h2 id="related-heading" className="text-2xl font-bold text-slate-900 dark:text-white mb-8">
              Similar Opportunities
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedJobs.map(relatedJob => (
                <Card
                  key={relatedJob.id}
                  className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-[#137fec] transition-colors"
                >
                  <Link href={`/careers/${relatedJob.id}`} className="block space-y-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#137fec]/10 text-[#137fec]">
                      {relatedJob.department}
                    </span>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {relatedJob.title}
                    </h3>
                    <div className="flex gap-3 text-sm text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <span className="material-symbols-outlined text-base" aria-hidden="true">
                          location_on
                        </span>
                        {relatedJob.location}
                      </span>
                      <span>{relatedJob.type}</span>
                    </div>
                  </Link>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

export default JobDetailTemplate;
