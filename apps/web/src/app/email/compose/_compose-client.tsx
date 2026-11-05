'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { trpc } from '@/lib/trpc';
import { EmailCompose, type ComposeDraft } from '@/components/email/EmailCompose';

type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward';

const MODE_LABELS: Record<ComposeMode, string> = {
  new: 'New Message',
  reply: 'Reply',
  replyAll: 'Reply All',
  forward: 'Forward',
};

interface EmailAddressRow {
  address: string;
}

/** A message read back for Compose, only when it really is a draft. */
function draftFrom(
  email:
    | {
        id: string;
        isDraft: boolean;
        to: EmailAddressRow[];
        cc?: EmailAddressRow[];
        bcc?: EmailAddressRow[];
        subject: string;
        htmlBody?: string;
        textBody?: string;
        threadId?: string;
      }
    | null
    | undefined
): ComposeDraft | undefined {
  if (!email?.isDraft) return undefined;
  const addresses = (rows: EmailAddressRow[] = []) =>
    rows.map((row) => row.address).filter((address) => address.length > 0);
  return {
    id: email.id,
    to: addresses(email.to),
    cc: addresses(email.cc),
    bcc: addresses(email.bcc),
    subject: email.subject,
    htmlBody: email.htmlBody ?? email.textBody ?? '',
    threadId: email.threadId,
  };
}

export function ComposeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const mode = (searchParams.get('mode') as ComposeMode) ?? 'new';
  const emailId = searchParams.get('emailId');
  const toParam = searchParams.get('to');
  // One message being written. Saving a new draft adds its id to the URL, and that must not
  // reload it; arriving at any other address, such as Compose again, starts a new message.
  const search = searchParams.toString();
  const expectedSearchRef = useRef(search);
  const [session, setSession] = useState(() => ({ key: 0, draftId: searchParams.get('draftId') }));
  useEffect(() => {
    if (search === expectedSearchRef.current) return;
    expectedSearchRef.current = search;
    const next = new URLSearchParams(search).get('draftId');
    setSession((current) => ({ key: current.key + 1, draftId: next }));
  }, [search]);
  const { draftId } = session;

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

  // gcTime 0: Compose reads this once, so it must never start from an older copy.
  const draftQuery = trpc.email.getEmail.useQuery(
    { emailId: draftId ?? '' },
    { enabled: !!draftId, gcTime: 0 }
  );
  const initialDraft = draftFrom(draftQuery.data);

  // PG-207 (owner ruling Q5): only a new message starts with the default
  // signature; replies and forwards start without one.
  const prefillSignature = mode === 'new' && !emailId && !draftId;
  const signatureQuery = trpc.emailSignatures.resolveDefault.useQuery(undefined, {
    enabled: prefillSignature,
  });

  // Compose reads its initial body once, so it renders only after what it
  // starts from has loaded; a failed signature lookup just means no signature.
  const ready =
    !(prefillSignature && signatureQuery.isLoading) &&
    !(needsOriginal && emailQuery.isLoading) &&
    !(draftId && draftQuery.isLoading);

  const handleDone = useCallback(() => {
    router.push('/email');
  }, [router]);

  // Leaving by any route, the lists show what Compose saved, sent or removed.
  const utils = trpc.useUtils();
  const refreshLists = useCallback(() => {
    void utils.email.listEmails.invalidate();
    void utils.email.getUnreadCounts.invalidate();
  }, [utils]);
  useEffect(() => refreshLists, [refreshLists]);

  // Keeps Back working: this page's history entry now points at the saved draft.
  const handleDraftSaved = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('draftId', id);
    expectedSearchRef.current = url.searchParams.toString();
    window.history.replaceState(window.history.state, '', url);
  }, []);

  const handleLeave = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router]
  );

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
        <h1 className="text-lg font-semibold">{initialDraft ? 'Draft' : MODE_LABELS[mode]}</h1>
      </div>

      {/* Compose form */}
      {ready ? (
        <EmailCompose
          key={session.key}
          mode={mode}
          originalEmail={emailQuery.data ?? undefined}
          initialTo={initialTo}
          initialSignatureHtml={
            prefillSignature ? (signatureQuery.data?.html ?? undefined) : undefined
          }
          initialDraft={initialDraft}
          onDraftSaved={handleDraftSaved}
          onDraftChanged={refreshLists}
          onLeave={handleLeave}
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
