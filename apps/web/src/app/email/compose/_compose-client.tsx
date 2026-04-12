'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
  const emailQuery = trpc.email.getEmail.useQuery(
    { emailId: emailId! },
    { enabled: !!emailId && mode !== 'new' }
  );

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
          <ArrowLeft className="h-4 w-4" />
          Back to Email
        </Link>
        <div className="h-4 w-px bg-border" />
        <h1 className="text-lg font-semibold">{MODE_LABELS[mode]}</h1>
      </div>

      {/* Compose form */}
      <EmailCompose
        mode={mode}
        originalEmail={emailQuery.data ?? undefined}
        initialTo={initialTo}
        onDiscard={handleDone}
        onSent={handleDone}
        className="flex-1"
      />
    </div>
  );
}
