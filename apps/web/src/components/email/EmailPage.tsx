'use client';

import { useState, useCallback, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent } from '@intelliflow/ui';
import { FolderSidebar } from './FolderSidebar';
import { EmailList } from './EmailList';
import { EmailThread } from './EmailThread';
import { EmailCompose } from './EmailCompose';

type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward' | null;

interface EmailFilters {
  unread: boolean;
  hasAttachments: boolean;
}

interface EmailPageProps {
  initialEmailId?: string;
  className?: string;
}

/** Minimal email shape needed for compose/reply/forward context */
interface EmailRecord {
  id: string;
  subject: string;
  threadId?: string;
  from: { address: string; name?: string };
  to: Array<{ address: string; name?: string }>;
  htmlBody?: string;
  textBody?: string;
  receivedAt: string;
  status: string;
}

export function EmailPage({ initialEmailId, className }: EmailPageProps) {
  const [selectedFolder, setSelectedFolder] = useState('inbox');
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(
    initialEmailId ?? null
  );
  const [composeMode, setComposeMode] = useState<ComposeMode>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<EmailFilters>({
    unread: false,
    hasAttachments: false,
  });
  const [composeOriginalEmail, setComposeOriginalEmail] = useState<EmailRecord | undefined>(undefined);

  const debouncedSearch = useDebounce(searchQuery, 300);

  // Fetch emails for current folder
  const emailsQuery = trpc.email.listEmails.useQuery({
    folder: selectedFolder,
    search: debouncedSearch || undefined,
  });

  // Fetch thread for selected email
  const selectedEmail = emailsQuery.data?.emails?.find(
    (e) => e.id === selectedEmailId
  );
  const threadId = selectedEmail?.threadId || selectedEmailId;

  const threadQuery = trpc.email.getThread.useQuery(
    { threadId: threadId! },
    { enabled: !!threadId }
  );

  // Fetch unread counts per folder (refreshed every 30s)
  const unreadQuery = trpc.email.getUnreadCounts.useQuery({}, {
    refetchInterval: 30_000,
  });

  // Mark email as read after 800ms (common email client convention)
  const markAsReadMutation = trpc.email.markAsRead.useMutation({
    onSuccess: () => { unreadQuery.refetch(); },
  });

  useEffect(() => {
    if (!selectedEmailId) return;
    const timer = setTimeout(() => {
      markAsReadMutation.mutate({
        emailId: selectedEmailId,
        threadId: threadId ?? undefined,
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [selectedEmailId]);

  // Keyboard shortcut: 'c' to compose
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input or contenteditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }
      if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
        setComposeMode('new');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleCompose = useCallback(() => {
    setComposeMode('new');
    setComposeOriginalEmail(undefined);
  }, []);

  const handleReply = useCallback(
    (messageId: string) => {
      const msg = threadQuery.data?.emails?.find((e) => e.id === messageId);
      setComposeOriginalEmail(msg);
      setComposeMode('reply');
    },
    [threadQuery.data]
  );

  const handleReplyAll = useCallback(
    (messageId: string) => {
      const msg = threadQuery.data?.emails?.find((e) => e.id === messageId);
      setComposeOriginalEmail(msg);
      setComposeMode('replyAll');
    },
    [threadQuery.data]
  );

  const handleForward = useCallback(
    (messageId: string) => {
      const msg = threadQuery.data?.emails?.find((e) => e.id === messageId);
      setComposeOriginalEmail(msg);
      setComposeMode('forward');
    },
    [threadQuery.data]
  );

  const handleDiscardCompose = useCallback(() => {
    setComposeMode(null);
    setComposeOriginalEmail(undefined);
  }, []);

  return (
    <div
      className={cn(
        'flex h-[calc(100vh-4rem)] md:flex dark:bg-background',
        className
      )}
    >
      {/* Left: Folder sidebar */}
      <FolderSidebar
        activeFolder={selectedFolder}
        onFolderSelect={setSelectedFolder}
        onCompose={handleCompose}
        unreadCounts={unreadQuery.data ?? {}}
      />

      {/* Middle: Email list */}
      <EmailList
        emails={(emailsQuery.data?.emails ?? []).map((e) => ({
          ...e,
          isRead: e.isRead ?? false,
          attachments: e.attachments.map((a) => ({ ...a, checksum: '' })),
        }))}
        isLoading={emailsQuery.isLoading}
        isError={emailsQuery.isError}
        error={emailsQuery.error as Error | null}
        selectedEmailId={selectedEmailId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onEmailSelect={setSelectedEmailId}
        onFilterChange={setFilters}
        onRetry={() => emailsQuery.refetch()}
        filters={filters}
      />

      {/* Right: Thread view */}
      <EmailThread
        thread={
          threadQuery.data
            ? {
                ...threadQuery.data,
                emails: threadQuery.data.emails.map((e) => ({
                  ...e,
                  attachments: e.attachments.map((a) => ({ ...a, checksum: '' })),
                })),
              }
            : null
        }
        isLoading={threadQuery.isLoading}
        onReply={handleReply}
        onReplyAll={handleReplyAll}
        onForward={handleForward}
      />

      {/* Compose: Sheet panel from bottom — keeps thread fully visible */}
      <Sheet open={!!composeMode} onOpenChange={(open) => { if (!open) handleDiscardCompose(); }}>
        <SheetContent
          side="bottom"
          className="h-[55vh] flex flex-col p-0 gap-0"
          aria-label="Compose email"
        >
          {composeMode && (
            <EmailCompose
              mode={composeMode}
              originalEmail={composeOriginalEmail}
              onDiscard={handleDiscardCompose}
              onSent={handleDiscardCompose}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
