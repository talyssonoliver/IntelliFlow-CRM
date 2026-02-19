'use client';

import { useState, useCallback, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
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
  const [composeOriginalEmail, setComposeOriginalEmail] = useState<any>(null);

  const debouncedSearch = useDebounce(searchQuery, 300);

  // Fetch emails for current folder
  const emailsQuery = trpc.email.listEmails.useQuery({
    folder: selectedFolder,
    search: debouncedSearch || undefined,
  } as any);

  // Fetch thread for selected email
  const selectedEmail = (emailsQuery.data as any)?.emails?.find(
    (e: any) => e.id === selectedEmailId
  );
  const threadId = selectedEmail?.threadId || selectedEmailId;

  const threadQuery = trpc.email.getThread.useQuery(
    { threadId: threadId! } as any,
    { enabled: !!threadId }
  );

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
    setComposeOriginalEmail(null);
  }, []);

  const handleReply = useCallback(
    (messageId: string) => {
      const msg = (threadQuery.data as any)?.emails?.find((e: any) => e.id === messageId);
      setComposeOriginalEmail(msg || null);
      setComposeMode('reply');
    },
    [threadQuery.data]
  );

  const handleReplyAll = useCallback(
    (messageId: string) => {
      const msg = (threadQuery.data as any)?.emails?.find((e: any) => e.id === messageId);
      setComposeOriginalEmail(msg || null);
      setComposeMode('replyAll');
    },
    [threadQuery.data]
  );

  const handleForward = useCallback(
    (messageId: string) => {
      const msg = (threadQuery.data as any)?.emails?.find((e: any) => e.id === messageId);
      setComposeOriginalEmail(msg || null);
      setComposeMode('forward');
    },
    [threadQuery.data]
  );

  const handleDiscardCompose = useCallback(() => {
    setComposeMode(null);
    setComposeOriginalEmail(null);
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
        unreadCounts={{}} // TODO: get from API
      />

      {/* Middle: Email list */}
      <EmailList
        emails={(emailsQuery.data as any)?.emails ?? []}
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

      {/* Right: Thread view + Compose */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <EmailThread
          thread={(threadQuery.data as any) ?? null}
          isLoading={threadQuery.isLoading}
          onReply={handleReply}
          onReplyAll={handleReplyAll}
          onForward={handleForward}
        />

        {composeMode && (
          <EmailCompose
            mode={composeMode}
            originalEmail={composeOriginalEmail}
            onDiscard={handleDiscardCompose}
            onSent={handleDiscardCompose}
          />
        )}
      </div>
    </div>
  );
}
