'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { toast } from '@intelliflow/ui';
import { EMAIL_LABELS } from '@/components/sidebar/configs/EmailSidebarContent';
import { EmailList } from './EmailList';
import { EmailThread } from './EmailThread';

interface EmailFilters {
  unread: boolean;
  hasAttachments: boolean;
}

interface EmailPageProps {
  initialEmailId?: string;
  className?: string;
}

export function EmailPage({ initialEmailId, className }: Readonly<EmailPageProps>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedFolder = searchParams.get('folder') ?? 'inbox';
  const selectedLabel = searchParams.get('label') ?? undefined;

  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(initialEmailId ?? null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<EmailFilters>({
    unread: false,
    hasAttachments: false,
  });

  // Clear selection and search when folder or label changes (skip initial mount)
  const prevFolderRef = useRef(selectedFolder);
  const prevLabelRef = useRef(selectedLabel);
  useEffect(() => {
    if (prevFolderRef.current !== selectedFolder || prevLabelRef.current !== selectedLabel) {
      prevFolderRef.current = selectedFolder;
      prevLabelRef.current = selectedLabel;
      setSelectedEmailId(null);
      setSearchQuery('');
      setFilters({ unread: false, hasAttachments: false });
    }
  }, [selectedFolder, selectedLabel]);

  const debouncedSearch = useDebounce(searchQuery, 300);

  // Fetch emails for current folder/label
  const emailsQuery = trpc.email.listEmails.useQuery({
    folder: selectedLabel ? undefined : selectedFolder,
    label: selectedLabel,
    search: debouncedSearch || undefined,
  });

  // Apply client-side filters (unread / has attachments)
  const allEmails = useMemo(
    () =>
      (emailsQuery.data?.emails ?? []).map((e) => ({
        ...e,
        isRead: e.isRead ?? false,
        attachments: e.attachments.map((a) => ({ ...a, checksum: '' })),
      })),
    [emailsQuery.data?.emails]
  );

  const filteredEmails = useMemo(() => {
    let result = allEmails;
    if (filters.unread) {
      result = result.filter((e) => !e.isRead);
    }
    if (filters.hasAttachments) {
      result = result.filter((e) => e.attachments.length > 0);
    }
    return result;
  }, [allEmails, filters]);

  // Fetch thread for selected email
  const selectedEmail = emailsQuery.data?.emails?.find((e) => e.id === selectedEmailId);
  const realThreadId = selectedEmail?.threadId;
  const threadId = realThreadId || selectedEmailId;

  const threadQuery = trpc.email.getThread.useQuery(
    { threadId: threadId! },
    { enabled: !!threadId }
  );

  // Mutations
  const utils = trpc.useUtils();
  const markAsReadMutation = trpc.email.markAsRead.useMutation({
    onSuccess: () => {
      void utils.email.listEmails.invalidate();
      void utils.email.getUnreadCounts.invalidate();
    },
  });

  const processEmailMutation = trpc.email.processEmail.useMutation({
    onSuccess: (_data, variables) => {
      setSelectedEmailId(null);
      void utils.email.listEmails.invalidate();
      void utils.email.getUnreadCounts.invalidate();
      const actionLabels: Record<string, string> = {
        archive: 'Email archived',
        delete: 'Email moved to trash',
        permanentDelete: 'Email permanently deleted',
        spam: 'Email marked as spam',
      };
      toast({ title: actionLabels[variables.action] ?? 'Email processed' });
    },
    onError: () => {
      toast({ title: 'Failed to process email', variant: 'destructive' });
    },
  });

  const setLabelsMutation = trpc.email.setLabels.useMutation({
    onSuccess: () => {
      void utils.email.listEmails.invalidate();
      toast({ title: 'Labels updated' });
    },
    onError: () => {
      toast({ title: 'Failed to update labels', variant: 'destructive' });
    },
  });

  const markAsUnreadMutation = trpc.email.markAsUnread.useMutation({
    onSuccess: () => {
      setSelectedEmailId(null);
      void utils.email.listEmails.invalidate();
      void utils.email.getUnreadCounts.invalidate();
      toast({ title: 'Email marked as unread' });
    },
    onError: () => {
      toast({ title: 'Failed to mark email as unread', variant: 'destructive' });
    },
  });

  useEffect(() => {
    if (!selectedEmailId) return;
    const timer = setTimeout(() => {
      markAsReadMutation.mutate({
        emailId: selectedEmailId,
        threadId: realThreadId ?? undefined,
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [selectedEmailId]);

  // Keyboard shortcut: 'c' to compose
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
        router.push('/email/compose');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [router]);

  const handleReply = useCallback(
    (messageId: string) => {
      router.push(`/email/compose?mode=reply&emailId=${messageId}`);
    },
    [router]
  );

  const handleReplyAll = useCallback(
    (messageId: string) => {
      router.push(`/email/compose?mode=replyAll&emailId=${messageId}`);
    },
    [router]
  );

  const handleForward = useCallback(
    (messageId: string) => {
      router.push(`/email/compose?mode=forward&emailId=${messageId}`);
    },
    [router]
  );

  const handleArchive = useCallback(() => {
    if (!selectedEmailId) return;
    processEmailMutation.mutate({ emailId: selectedEmailId, action: 'archive' });
  }, [selectedEmailId, processEmailMutation]);

  const handleDelete = useCallback(() => {
    if (!selectedEmailId) return;
    const action = selectedFolder === 'trash' ? 'permanentDelete' : 'delete';
    processEmailMutation.mutate({ emailId: selectedEmailId, action });
  }, [selectedEmailId, selectedFolder, processEmailMutation]);

  const handleMarkUnread = useCallback(() => {
    if (!selectedEmailId) return;
    markAsUnreadMutation.mutate({
      emailId: selectedEmailId,
      threadId: realThreadId ?? undefined,
    });
  }, [selectedEmailId, realThreadId, markAsUnreadMutation]);

  const handleSetLabels = useCallback(
    (labels: string[]) => {
      if (!selectedEmailId) return;
      setLabelsMutation.mutate({ emailId: selectedEmailId, labels });
    },
    [selectedEmailId, setLabelsMutation]
  );

  const handleInlineSent = useCallback(() => {
    void utils.email.listEmails.invalidate();
    void threadQuery.refetch();
    toast({ title: 'Reply sent' });
  }, [utils, threadQuery]);

  return (
    <div className={cn('flex h-full dark:bg-background', className)}>
      {/* Email list */}
      <EmailList
        emails={filteredEmails}
        totalUnfilteredCount={allEmails.length}
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

      {/* Thread view */}
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
        labels={selectedEmail?.labels ?? []}
        onLabelsChange={handleSetLabels}
        onReply={handleReply}
        onReplyAll={handleReplyAll}
        onForward={handleForward}
        onArchive={handleArchive}
        onDelete={handleDelete}
        onMarkUnread={handleMarkUnread}
        onInlineSent={handleInlineSent}
      />
    </div>
  );
}
