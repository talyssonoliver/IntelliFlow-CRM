'use client';

import * as React from 'react';
import { contactFormSchema, type ContactFormInput } from '@intelliflow/validators';
import { sendContactEmail } from '@/lib/shared/email-handler';

/**
 * Contact Form Component
 *
 * Public-facing contact form with:
 * - Full brand compliance (IntelliFlow design system)
 * - WCAG 2.1 AA accessibility
 * - Client-side + server-side validation
 * - Spam prevention (honeypot)
 * - Type-safe submission handling
 */

interface FormState {
  isSubmitting: boolean;
  isSuccess: boolean;
  error: string | null;
}

export function ContactForm() {
  const [formState, setFormState] = React.useState<FormState>({
    isSubmitting: false,
    isSuccess: false,
    error: null,
  });

  const [formErrors, setFormErrors] = React.useState<Partial<Record<keyof ContactFormInput, string>>>({});

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormErrors({});
    setFormState({ isSubmitting: true, isSuccess: false, error: null });

    const formData = new FormData(event.currentTarget);

    // Build form input object (raw input before Zod transformation)
    const input = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      phone: (formData.get('phone') as string) || undefined,
      company: (formData.get('company') as string) || null,
      subject: (formData.get('subject') as string) || null,
      message: formData.get('message') as string,
      website: (formData.get('website') as string) || '',
    };

    // Validate with Zod
    const validation = contactFormSchema.safeParse(input);

    if (!validation.success) {
      const errors: Partial<Record<keyof ContactFormInput, string>> = {};
      validation.error.errors.forEach((err) => {
        const field = err.path[0] as keyof ContactFormInput;
        errors[field] = err.message;
      });
      setFormErrors(errors);
      setFormState({ isSubmitting: false, isSuccess: false, error: null });
      return;
    }

    // Send email
    const result = await sendContactEmail(validation.data);

    if (result.ok) {
      setFormState({ isSubmitting: false, isSuccess: true, error: null });
      // Clear form
      event.currentTarget?.reset();

      // Reset success message after 5 seconds
      setTimeout(() => {
        setFormState((prev) => ({ ...prev, isSuccess: false }));
      }, 5000);
    } else {
      setFormState({
        isSubmitting: false,
        isSuccess: false,
        error: result.error.message,
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6"
      role="form"
      aria-label="Contact form"
      noValidate
    >
      {/* Success Message */}
      {formState.isSuccess && (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
        >
          <span className="material-symbols-outlined text-green-600 dark:text-green-400" aria-hidden="true">
            check_circle
          </span>
          <div>
            <p className="font-medium text-green-800 dark:text-green-300">
              Thank you for your message!
            </p>
            <p className="text-sm text-green-700 dark:text-green-400">
              We&apos;ve received your inquiry and will get back to you soon.
            </p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {formState.error && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
        >
          <span className="material-symbols-outlined text-red-600 dark:text-red-400" aria-hidden="true">
            error
          </span>
          <div>
            <p className="font-medium text-red-800 dark:text-red-300">
              Failed to send message
            </p>
            <p className="text-sm text-red-700 dark:text-red-400">
              {formState.error}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Name Field */}
        <div className="space-y-1.5">
          <label
            htmlFor="contact-name"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Name{' '}
            <span className="text-red-500" aria-hidden="true">
              *
            </span>
            <span className="sr-only">(required)</span>
          </label>
          <input
            type="text"
            id="contact-name"
            name="name"
            required
            aria-required="true"
            aria-invalid={!!formErrors.name}
            aria-describedby={formErrors.name ? 'name-error' : undefined}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-900
              text-slate-900 dark:text-white placeholder-slate-400
              focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent
              disabled:opacity-50 disabled:cursor-not-allowed
              ${formErrors.name ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'}`}
            placeholder="John Doe"
            disabled={formState.isSubmitting}
          />
          {formErrors.name && (
            <p id="name-error" className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1" role="alert">
              <span className="material-symbols-outlined text-sm" aria-hidden="true">
                error
              </span>
              {formErrors.name}
            </p>
          )}
        </div>

        {/* Email Field */}
        <div className="space-y-1.5">
          <label
            htmlFor="contact-email"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Email{' '}
            <span className="text-red-500" aria-hidden="true">
              *
            </span>
            <span className="sr-only">(required)</span>
          </label>
          <input
            type="email"
            id="contact-email"
            name="email"
            required
            autoComplete="email"
            aria-required="true"
            aria-invalid={!!formErrors.email}
            aria-describedby={formErrors.email ? 'email-error' : undefined}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-900
              text-slate-900 dark:text-white placeholder-slate-400
              focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent
              disabled:opacity-50 disabled:cursor-not-allowed
              ${formErrors.email ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'}`}
            placeholder="you@example.com"
            disabled={formState.isSubmitting}
          />
          {formErrors.email && (
            <p id="email-error" className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1" role="alert">
              <span className="material-symbols-outlined text-sm" aria-hidden="true">
                error
              </span>
              {formErrors.email}
            </p>
          )}
        </div>

        {/* Phone Field */}
        <div className="space-y-1.5">
          <label
            htmlFor="contact-phone"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Phone <span className="text-slate-500 text-xs">(optional)</span>
          </label>
          <input
            type="tel"
            id="contact-phone"
            name="phone"
            autoComplete="tel"
            aria-invalid={!!formErrors.phone}
            aria-describedby={formErrors.phone ? 'phone-error' : undefined}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-900
              text-slate-900 dark:text-white placeholder-slate-400
              focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent
              disabled:opacity-50 disabled:cursor-not-allowed
              ${formErrors.phone ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'}`}
            placeholder="+1 (555) 123-4567"
            disabled={formState.isSubmitting}
          />
          {formErrors.phone && (
            <p id="phone-error" className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1" role="alert">
              <span className="material-symbols-outlined text-sm" aria-hidden="true">
                error
              </span>
              {formErrors.phone}
            </p>
          )}
        </div>

        {/* Company Field */}
        <div className="space-y-1.5">
          <label
            htmlFor="contact-company"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Company <span className="text-slate-500 text-xs">(optional)</span>
          </label>
          <input
            type="text"
            id="contact-company"
            name="company"
            autoComplete="organization"
            aria-invalid={!!formErrors.company}
            className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-900
              text-slate-900 dark:text-white placeholder-slate-400
              focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent
              disabled:opacity-50 disabled:cursor-not-allowed
              ${formErrors.company ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'}`}
            placeholder="Acme Corporation"
            disabled={formState.isSubmitting}
          />
        </div>
      </div>

      {/* Subject Field */}
      <div className="space-y-1.5">
        <label
          htmlFor="contact-subject"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Subject <span className="text-slate-500 text-xs">(optional)</span>
        </label>
        <input
          type="text"
          id="contact-subject"
          name="subject"
          aria-invalid={!!formErrors.subject}
          className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-900
            text-slate-900 dark:text-white placeholder-slate-400
            focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed
            ${formErrors.subject ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'}`}
          placeholder="Interested in IntelliFlow CRM"
          disabled={formState.isSubmitting}
        />
      </div>

      {/* Message Field */}
      <div className="space-y-1.5">
        <label
          htmlFor="contact-message"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Message{' '}
          <span className="text-red-500" aria-hidden="true">
            *
          </span>
          <span className="sr-only">(required)</span>
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={6}
          aria-required="true"
          aria-invalid={!!formErrors.message}
          aria-describedby={formErrors.message ? 'message-error' : 'message-hint'}
          className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-900
            text-slate-900 dark:text-white placeholder-slate-400
            focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed resize-y
            ${formErrors.message ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'}`}
          placeholder="Tell us about your needs..."
          disabled={formState.isSubmitting}
        />
        {formErrors.message ? (
          <p id="message-error" className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1" role="alert">
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              error
            </span>
            {formErrors.message}
          </p>
        ) : (
          <p id="message-hint" className="text-xs text-slate-500 dark:text-slate-400">
            Please provide at least 10 characters
          </p>
        )}
      </div>

      {/* Honeypot field (spam prevention) */}
      <input
        type="text"
        name="website"
        aria-hidden="true"
        tabIndex={-1}
        autoComplete="off"
        className="absolute opacity-0 pointer-events-none"
        style={{ position: 'absolute', left: '-9999px' }}
      />

      {/* Submit Button */}
      <button
        type="submit"
        disabled={formState.isSubmitting}
        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg
          bg-[#137fec] text-white font-semibold hover:bg-[#0e6ac7]
          transition-colors focus:outline-none focus:ring-2 focus:ring-[#137fec]
          focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {formState.isSubmitting ? (
          <>
            <svg
              className="animate-spin h-5 w-5"
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Sending...
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              send
            </span>
            Send Message
          </>
        )}
      </button>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        <span className="text-red-500" aria-hidden="true">*</span> Required fields
      </p>
    </form>
  );
}
