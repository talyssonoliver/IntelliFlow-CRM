'use client';

import { useState } from 'react';
import { Card } from '@intelliflow/ui';

interface Position {
  id: string;
  title: string;
}

interface ApplicationFormProps {
  positions: Position[];
}

export function ApplicationForm({ positions }: ApplicationFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    setIsSubmitting(false);
    setIsSubmitted(true);
  }

  if (isSubmitted) {
    return (
      <Card className="p-8 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-3xl text-green-600 dark:text-green-400" aria-hidden="true">
            check_circle
          </span>
        </div>
        <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
          Application Received
        </h3>
        <p className="text-slate-600 dark:text-slate-300">
          Thank you for your interest in IntelliFlow. We&apos;ll review your application and get back to you within 5 business days.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              required
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent"
              placeholder="Jane"
            />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              required
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent"
              placeholder="Doe"
            />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent"
            placeholder="jane.doe@example.com"
          />
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent"
            placeholder="+1 (555) 000-0000"
          />
        </div>

        <div>
          <label htmlFor="position" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Position <span className="text-red-500">*</span>
          </label>
          <select
            id="position"
            name="position"
            required
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent"
          >
            <option value="">Select a position</option>
            {positions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.title}
              </option>
            ))}
            <option value="general">General Application</option>
          </select>
        </div>

        <div>
          <label htmlFor="linkedin" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            LinkedIn Profile
          </label>
          <input
            id="linkedin"
            name="linkedin"
            type="url"
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent"
            placeholder="https://linkedin.com/in/janedoe"
          />
        </div>

        <div>
          <label htmlFor="portfolio" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Portfolio / GitHub
          </label>
          <input
            id="portfolio"
            name="portfolio"
            type="url"
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent"
            placeholder="https://github.com/janedoe"
          />
        </div>

        <div>
          <label htmlFor="resume" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Resume/CV <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="resume"
              name="resume"
              type="file"
              required
              accept=".pdf,.doc,.docx"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#137fec]/10 file:text-[#137fec] file:font-medium hover:file:bg-[#137fec]/20 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent"
            />
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            PDF, DOC, or DOCX (max 5MB)
          </p>
        </div>

        <div>
          <label htmlFor="coverLetter" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Why IntelliFlow?
          </label>
          <textarea
            id="coverLetter"
            name="coverLetter"
            rows={4}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent resize-none"
            placeholder="Tell us why you're excited about this role and what you'd bring to the team..."
          />
        </div>

        <div className="flex items-start gap-2">
          <input
            id="privacy"
            name="privacy"
            type="checkbox"
            required
            className="mt-1 w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-[#137fec] focus:ring-[#137fec]"
          />
          <label htmlFor="privacy" className="text-sm text-slate-600 dark:text-slate-300">
            I agree to the{' '}
            <a href="/privacy" className="text-[#137fec] hover:underline">
              Privacy Policy
            </a>{' '}
            and consent to IntelliFlow processing my data for recruitment purposes.
          </label>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#137fec] text-white font-semibold hover:bg-[#0e6ac7] transition-colors focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <span className="material-symbols-outlined animate-spin text-lg" aria-hidden="true">
                progress_activity
              </span>
              Submitting...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                send
              </span>
              Submit Application
            </>
          )}
        </button>
      </form>
    </Card>
  );
}
