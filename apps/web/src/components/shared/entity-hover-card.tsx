'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { AppAvatar } from './app-avatar';
import { TaskCreateSheet } from '@/components/tasks/TaskCreateSheet';
import { useEntityPin } from '@/hooks/use-entity-pin';
import type { PinnableEntityType } from '@intelliflow/validators';

interface EntityHoverCardProps {
  /** Email address to look up the entity */
  email: string;
  /** Display name shown in the card header (sender name) */
  displayName?: string;
  children: React.ReactNode;
  /** Side of the trigger to show the card */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Alignment relative to trigger */
  align?: 'start' | 'center' | 'end';
  className?: string;
}

function formatRelativeDate(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function EntityHoverCard({
  email,
  displayName,
  children,
  side = 'bottom',
  align = 'start',
  className,
}: Readonly<EntityHoverCardProps>) {
  const currentSearchParams = useSearchParams();
  const [shouldFetch, setShouldFetch] = useState(false);
  const [isHoverOpen, setIsHoverOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isTaskSheetOpen, setIsTaskSheetOpen] = useState(false);

  const handleHoverOpenChange = useCallback((open: boolean) => {
    if (!open && (isDropdownOpen || isTaskSheetOpen)) return;
    setIsHoverOpen(open);
    if (open) setShouldFetch(true);
  }, [isDropdownOpen, isTaskSheetOpen]);

  const handleDropdownOpenChange = useCallback((open: boolean) => {
    setIsDropdownOpen(open);
    if (!open && !isTaskSheetOpen) setIsHoverOpen(false);
  }, [isTaskSheetOpen]);

  const handleTaskSheetChange = useCallback((open: boolean) => {
    setIsTaskSheetOpen(open);
    if (!open) setIsHoverOpen(false);
  }, []);

  const entityQuery = trpc.email.lookupByEmail.useQuery(
    { email },
    {
      enabled: shouldFetch,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  ) ?? { data: null, isLoading: false };

  const messagesQuery = trpc.email.getRelatedMessages.useQuery(
    { email, limit: 3 },
    {
      enabled: shouldFetch,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    }
  ) ?? { data: null, isLoading: false };

  const entity = entityQuery.data ?? null;
  const messages = messagesQuery.data ?? [];

  const cardName = entity?.name || displayName || email.split('@')[0];
  const cardEmail = entity?.email || email;
  const entityHref = entity
    ? entity.type === 'contact'
      ? `/contacts/${entity.id}`
      : `/leads/${entity.id}`
    : null;

  const addLeadHref = `/leads/new?email=${encodeURIComponent(email)}&name=${encodeURIComponent(displayName || '')}`;
  const currentFolder = currentSearchParams.get('folder');

  const pinEntityType = (entity?.type ?? 'lead') as PinnableEntityType;
  const { isPinned, togglePin } = useEntityPin({
    entityType: pinEntityType,
    entityId: entity?.id ?? '',
    title: cardName,
    subtitle: cardEmail,
    url: entityHref ?? '',
  });

  function emailHref(messageId: string): string {
    const folderParam = currentFolder ? `?folder=${encodeURIComponent(currentFolder)}` : '';
    return `/email/${messageId}${folderParam}`;
  }

  return (
    <HoverCard open={isHoverOpen} openDelay={600} closeDelay={250} onOpenChange={handleHoverOpenChange}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side={side}
        align={align}
        className={cn(
          'w-72 p-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg rounded-lg',
          className,
        )}
      >
      <TooltipProvider delayDuration={400}>
        {/* Header — horizontal layout like Gmail/Outlook */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <AppAvatar
            name={cardName}
            src={entity?.avatarUrl}
            className="h-10 w-10 text-sm shrink-0"
          />
          <div className="flex-1 min-w-0">
            {entityHref ? (
              <Link
                href={entityHref}
                className="text-sm font-semibold text-slate-900 dark:text-white hover:underline truncate block"
              >
                {cardName}
              </Link>
            ) : (
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {cardName}
              </p>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{cardEmail}</p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              {entityHref ? (
                <Link
                  href={entityHref}
                  className="shrink-0 p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                  aria-label="Open profile"
                >
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">open_in_new</span>
                </Link>
              ) : (
                <Link
                  href={addLeadHref}
                  className="shrink-0 p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                  aria-label="Add as lead"
                >
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">person_add</span>
                </Link>
              )}
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {entityHref ? 'Open profile' : 'Add as lead'}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Actions — primary CTA + icon buttons */}
        <div className="flex items-center gap-1.5 px-4 pb-3">
          <Link
            href={`/email/compose?to=${encodeURIComponent(cardEmail)}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-medium rounded hover:bg-[#0e6ac7] transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">mail</span>
            Send Email
          </Link>

          <div className="flex items-center gap-0.5 ml-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={entityHref ? `${entityHref}?tab=deals&action=new` : `/deals/new?email=${encodeURIComponent(email)}&name=${encodeURIComponent(displayName || '')}`}
                  className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                  aria-label="New deal"
                >
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">handshake</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">New deal</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setIsTaskSheetOpen(true)}
                  className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                  aria-label="Add task"
                >
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">add_task</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Add task</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={entityHref ? `${entityHref}?tab=activities&action=schedule` : `/calendar/new?email=${encodeURIComponent(email)}&name=${encodeURIComponent(displayName || '')}`}
                  className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                  aria-label="Schedule meeting"
                >
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">calendar_month</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Schedule meeting</TooltipContent>
            </Tooltip>
            <DropdownMenu open={isDropdownOpen} onOpenChange={handleDropdownOpenChange}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <div
                      role="button"
                      tabIndex={0}
                      className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
                      aria-label="More actions"
                    >
                      <span className="material-symbols-outlined text-[20px]" aria-hidden="true">more_horiz</span>
                    </div>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">More actions</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-48">
                {entity && (
                  <DropdownMenuItem onSelect={togglePin}>
                    <span className="material-symbols-outlined text-[16px] mr-2" aria-hidden="true">
                      {isPinned ? 'push_pin' : 'push_pin'}
                    </span>
                    {isPinned ? 'Unpin from Home' : 'Pin to Home'}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href={`/email/compose?to=${encodeURIComponent(cardEmail)}`}>
                    <span className="material-symbols-outlined text-[16px] mr-2" aria-hidden="true">forward_to_inbox</span>
                    Send Message
                  </Link>
                </DropdownMenuItem>
                {entity?.phone && (
                  <DropdownMenuItem asChild>
                    <a href={`tel:${entity.phone}`}>
                      <span className="material-symbols-outlined text-[16px] mr-2" aria-hidden="true">call</span>
                      Call {entity.phone}
                    </a>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* "Open detailed view" link */}
        {entityHref && (
          <div className="px-4 pb-3">
            <Link
              href={entityHref}
              className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-0.5"
            >
              Open detailed view
              <span className="material-symbols-outlined text-xs" aria-hidden="true">arrow_outward</span>
            </Link>
          </div>
        )}

        {/* Related messages */}
        <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-2.5">
          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium mb-1.5">
            Related Messages
          </p>
          {messagesQuery.isLoading && shouldFetch ? (
            <div className="space-y-1.5">
              {[0, 1].map((i) => (
                <div key={i} className="space-y-1">
                  <div className="h-3 w-3/4 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                  <div className="h-2.5 w-1/2 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                </div>
              ))}
            </div>
          ) : messages.length > 0 ? (
            <ul className="space-y-1">
              {messages.map((msg) => (
                <li key={msg.id}>
                  <Link
                    href={emailHref(msg.id)}
                    className="block rounded px-1.5 py-1 -mx-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs text-slate-700 dark:text-slate-300 truncate flex-1">
                        {msg.subject}
                      </p>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                        {formatRelativeDate(msg.receivedAt)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {msg.preview}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic">No messages yet</p>
          )}
        </div>
      </TooltipProvider>
      </HoverCardContent>

      <TaskCreateSheet
        open={isTaskSheetOpen}
        onOpenChange={handleTaskSheetChange}
        defaultEntityType={entity?.type === 'contact' ? 'contact' : entity?.type === 'lead' ? 'lead' : 'none'}
        defaultEntityId={entity?.id}
        defaultEntityName={cardName}
      />
    </HoverCard>
  );
}
