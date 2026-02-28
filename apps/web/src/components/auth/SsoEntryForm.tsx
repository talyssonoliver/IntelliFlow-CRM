'use client';

/**
 * SSO Entry Form Component
 *
 * Email input form for Enterprise SSO provider resolution.
 * Users enter their work email and the form resolves their SSO provider.
 *
 * IMPLEMENTS: PG-124 (SSO/OAuth social login providers)
 *
 * Features:
 * - Email validation with accessible error messages
 * - Loading state during resolution
 * - Error state for unrecognized domains
 * - Keyboard navigation support (Enter to submit)
 * - ARIA attributes for screen reader support
 */

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Input } from '@intelliflow/ui';
import { Button } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import type { SsoResolution } from '@/lib/auth/sso-handler';

// ============================================
// Types
// ============================================

export interface SsoEntryFormProps {
  /** Called when SSO provider is resolved */
  onResolve: (resolution: SsoResolution) => void;
  /** Whether the form is in a loading state (e.g., during SSO redirect) */
  isLoading?: boolean;
}

// ============================================
// Component
// ============================================

export function SsoEntryForm({ onResolve, isLoading = false }: Readonly<SsoEntryFormProps>) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const utils = trpc.useUtils();

  const isDisabled = isLoading || isResolving;

  const validateEmail = (value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setError('Email is required');
      return;
    }

    if (!validateEmail(trimmed)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsResolving(true);
    try {
      const result = await utils.auth.resolveSso.fetch({ email: trimmed });
      let resolution: SsoResolution;
      if (result.found && 'config' in result) {
        const cfg = result.config as { provider_id: string; provider_name: string; provider_type: string };
        resolution = {
          found: true,
          config: {
            domain: trimmed.split('@')[1]!,
            provider_id: cfg.provider_id,
            provider_name: cfg.provider_name,
            provider_type: cfg.provider_type as 'saml' | 'oauth',
            enabled: true,
          },
        };
      } else {
        const suggestion = 'suggestion' in result ? (result.suggestion as string) : undefined;
        resolution = { found: false, suggestion };
        setError(suggestion || 'Your organization has not configured SSO. Please use standard login.');
      }
      onResolve(resolution);
    } catch {
      setError('Failed to resolve SSO provider. Please try again.');
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Email input */}
      <div className="space-y-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          placeholder="you@company.com"
          aria-label="Work email address"
          aria-describedby="sso-help-text"
          aria-invalid={!!error}
          disabled={isDisabled}
          className="w-full bg-white/5 border-white/10 text-white placeholder:text-slate-400 focus:ring-[#7cc4ff] focus:border-transparent"
          autoComplete="email"
          autoFocus
        />
        <p id="sso-help-text" className="text-xs text-slate-400">
          Enter your work email to find your organization&apos;s SSO provider
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            error
          </span>
          {error}
        </div>
      )}

      {/* Submit button */}
      <Button
        type="submit"
        disabled={isDisabled}
        className="w-full bg-[#137fec] text-white font-semibold hover:bg-[#0e6ac7] focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-[#0f172a] shadow-lg shadow-[#137fec]/20"
      >
        {isDisabled ? (
          <>
            <span className="material-symbols-outlined animate-spin text-xl" aria-hidden="true">
              progress_activity
            </span>
            <span>Finding provider...</span>
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              search
            </span>
            <span>Find my SSO provider</span>
          </>
        )}
      </Button>

      {/* Back to login link */}
      <div className="text-center pt-2">
        <Link
          href="/login"
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-[#0f172a] rounded px-1"
        >
          &larr; Back to standard login
        </Link>
      </div>
    </form>
  );
}
