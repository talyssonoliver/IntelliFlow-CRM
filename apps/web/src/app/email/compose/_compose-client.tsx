'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { trpc } from '@/lib/trpc';
import { EmailCompose } from '@/components/email/EmailCompose';

type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward';

const MODE_LABELS: Record<ComposeMode, string> = {
  new: 'New Message',
  reply: 'Reply',
  replyAll: 'Reply All',
  forward: 'Forward',
};

export function ComposeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const mode = (searchParams.get('mode') as ComposeMode) ?? 'new';
  const emailId = searchParams.get('emailId');
  const toParam = searchParams.get('to');

  // Parse the `to` query param into initial recipients
  const initialTo = useMemo(() => {
    if (!toParam) return undefined;
    return toParam.split(',').map((email) => {
      const trimmed = email.trim();
      return { name: trimmed.split('@')[0], email: trimmed };
    });
  }, [toParam]);

  // Fetch original email for reply/forward modes
  const needsOriginal = !!emailId && mode !== 'new';
  const emailQuery = trpc.email.getEmail.useQuery(
    { emailId: emailId! },
    { enabled: needsOriginal }
  );

  // PG-207 (owner ruling Q5): only a new message starts with the default
  // signature; replies and forwards start without one.
  const prefillSignature = mode === 'new' && !emailId;
  const signatureQuery = trpc.emailSignatures.resolveDefault.useQuery(undefined, {
    enabled: prefillSignature,
  });

  // Compose reads its initial body once, so it renders only after what it
  // starts from has loaded; a failed signature lookup just means no signature.
  const ready =
    !(prefillSignature && signatureQuery.isLoading) && !(needsOriginal && emailQuery.isLoading);

  const handleDone = useCallback(() => {
    router.push('/email');
  }, [router]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-border px-6 py-4">
        <Link
          href="/email"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            arrow_back
          </span>{' '}
          Back to Email
        </Link>
        <div className="h-4 w-px bg-border" />
        <h1 className="text-lg font-semibold">{MODE_LABELS[mode]}</h1>
      </div>

      {/* Compose form */}
      {ready ? (
        <EmailCompose
          mode={mode}
          originalEmail={emailQuery.data ?? undefined}
          initialTo={initialTo}
          initialSignatureHtml={
            prefillSignature ? (signatureQuery.data?.html ?? undefined) : undefined
          }
          onDiscard={handleDone}
          onSent={handleDone}
          className="flex-1"
        />
      ) : (
        <output className="block px-6 py-4 text-sm text-muted-foreground">
          Preparing your message…
        </output>
      )}
    </div>
  );
}
