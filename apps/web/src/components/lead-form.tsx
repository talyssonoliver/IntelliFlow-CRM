'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { trpc } from '@/lib/trpc';
import { X } from 'lucide-react';

/**
 * Lead Form validation schema
 * Matches @intelliflow/validators createLeadSchema
 */
const leadFormSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  firstName: z.string().min(1, 'First name is required').max(100).optional(),
  lastName: z.string().min(1, 'Last name is required').max(100).optional(),
  company: z.string().min(1).max(200).optional(),
  title: z.string().max(100).optional(),
  phone: z.string().optional(),
  source: z.enum(['WEBSITE', 'REFERRAL', 'SOCIAL', 'EMAIL', 'COLD_CALL', 'EVENT', 'OTHER']),
});

type LeadFormData = z.infer<typeof leadFormSchema>;

interface LeadFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function LeadForm({ isOpen, onClose, onSuccess }: LeadFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // tRPC mutation for creating leads
  const createLead = trpc.lead.create.useMutation({
    onSuccess: () => {
      setSubmitSuccess(true);
      setTimeout(() => {
        form.reset();
        setSubmitSuccess(false);
        onSuccess?.();
        onClose();
      }, 1500);
    },
    onError: (error: { message?: string }) => {
      setSubmitError(error.message || 'Failed to create lead. Please try again.');
    },
  });

  const form = useForm<LeadFormData>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      company: '',
      title: '',
      phone: '',
      source: 'WEBSITE',
    },
  });

  const onSubmit = async (data: LeadFormData) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await createLead.mutateAsync(data);
    } catch {
      // Error handled by mutation onError
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    form.reset();
    setSubmitError(null);
    setSubmitSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-white dark:bg-gray-800 rounded-xl shadow-2xl animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Add New Lead
          </h2>
          <button
            onClick={handleClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4">
          {/* Success Message */}
          {submitSuccess && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-green-700 dark:text-green-400 text-sm font-medium">
                Lead created successfully!
              </p>
            </div>
          )}

          {/* Error Message */}
          {submitError && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-700 dark:text-red-400 text-sm">{submitError}</p>
            </div>
          )}

          {/* Email Field - Required */}
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              {...form.register('email')}
              type="email"
              id="email"
              placeholder="john@example.com"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
            />
            {form.formState.errors.email && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          {/* Name Fields - Grid Layout */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                First Name
              </label>
              <input
                {...form.register('firstName')}
                type="text"
                id="firstName"
                placeholder="John"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
              />
              {form.formState.errors.firstName && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {form.formState.errors.firstName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Last Name
              </label>
              <input
                {...form.register('lastName')}
                type="text"
                id="lastName"
                placeholder="Doe"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
              />
              {form.formState.errors.lastName && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {form.formState.errors.lastName.message}
                </p>
              )}
            </div>
          </div>

          {/* Company Field */}
          <div className="space-y-2">
            <label htmlFor="company" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Company
            </label>
            <input
              {...form.register('company')}
              type="text"
              id="company"
              placeholder="Acme Corp"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
            />
          </div>

          {/* Title Field */}
          <div className="space-y-2">
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Job Title
            </label>
            <input
              {...form.register('title')}
              type="text"
              id="title"
              placeholder="VP of Sales"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
            />
          </div>

          {/* Phone Field */}
          <div className="space-y-2">
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Phone
            </label>
            <input
              {...form.register('phone')}
              type="tel"
              id="phone"
              placeholder="+1 (555) 123-4567"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
            />
          </div>

          {/* Source Field */}
          <div className="space-y-2">
            <label htmlFor="source" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Lead Source
            </label>
            <select
              {...form.register('source')}
              id="source"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
            >
              <option value="WEBSITE">Website</option>
              <option value="REFERRAL">Referral</option>
              <option value="SOCIAL">Social Media</option>
              <option value="EMAIL">Email Campaign</option>
              <option value="COLD_CALL">Cold Call</option>
              <option value="EVENT">Event</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || submitSuccess}
              className="px-4 py-2 text-white bg-primary rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center space-x-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Creating...</span>
                </>
              ) : submitSuccess ? (
                <span>Created!</span>
              ) : (
                <span>Create Lead</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
