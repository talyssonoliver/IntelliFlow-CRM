'use client';

import { useCallback, useRef, useState } from 'react';
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

/** Stops all interactive events from propagating through the portal */
function stopAllPropagation(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function resolveEntityType(type: string | undefined): 'contact' | 'lead' | 'none' {
  if (type === 'contact') return 'contact';
  if (type === 'lead') return 'lead';
  return 'none';
}

function buildEmailHref(messageId: string, currentFolder: string | null): string {
  const folderParam = currentFolder ? `?folder=${encodeURIComponent(currentFolder)}` : '';
  return `/email/${messageId}${folderParam}`;
}

interface RelatedMessagesProps {
  isLoading: boolean;
  shouldFetch: boolean;
  messages: Array<{ id: string; subject: string; receivedAt: string; preview: string }>;
  currentFolder: string | null;
}

function RelatedMessagesList({
  isLoading,
  shouldFetch,
  messages,
  currentFolder,
}: Readonly<RelatedMessagesProps>) {
  if (isLoading && shouldFetch) {
    return (
      <div className="space-y-1.5">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-1">
            <div className="h-3 w-3/4 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
            <div className="h-2.5 w-1/2 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }
  if (messages.length > 0) {
    return (
      <ul className="space-y-1">
        {messages.map((msg) => (
          <li key={msg.id}>
            <a
              href={buildEmailHref(msg.id, currentFolder)}
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
            </a>
          </li>
        ))}
      </ul>
    );
  }
  return <p className="text-xs text-slate-400 dark:text-slate-500 italic">No messages yet</p>;
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
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isTaskSheetOpen, setIsTaskSheetOpen] = useState(false);

  // Cache entity data so TaskCreateSheet can use it after hover card closes
  const entityCacheRef = useRef<{ type?: string; id?: string; name: string }>({ name: '' });

  const handleHoverOpenChange = useCallback(
    (open: boolean) => {
      // Don't let HoverCard close while the DropdownMenu is open — its
      // portal content lives outside the card, so pointer-leave would
      // otherwise unmount the trigger mid-click.
      if (!open && isMoreMenuOpen) return;
      setIsHoverOpen(open);
      if (open) setShouldFetch(true);
    },
    [isMoreMenuOpen]
  );

  // Close hover card first, then open task sheet — fully decoupled
  const handleOpenTaskSheet = useCallback(() => {
    setIsHoverOpen(false);
    // Open sheet after card unmounts so focus restoration doesn't hit the row
    requestAnimationFrame(() => setIsTaskSheetOpen(true));
  }, []);

  const handleTaskSheetChange = useCallback((open: boolean) => {
    setIsTaskSheetOpen(open);
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
  let entityHref: string | null = null;
  if (entity) {
    entityHref = entity.type === 'contact' ? `/contacts/${entity.id}` : `/leads/${entity.id}`;
  }

  // Keep entity data cached for the TaskCreateSheet (which lives outside the card)
  entityCacheRef.current = { type: entity?.type, id: entity?.id, name: cardName };

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

  return (
    <>
      <HoverCard
        open={isHoverOpen}
        openDelay={600}
        closeDelay={250}
        onOpenChange={handleHoverOpenChange}
      >
        <HoverCardTrigger asChild>{children}</HoverCardTrigger>
        <HoverCardContent
          side={side}
          align={align}
          className={cn(
            'w-72 p-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg rounded-lg',
            className
          )}
        >
          {/* Defensive wrapper: stop all events from leaking through the portal to underlying elements (e.g. table rows) */}
          <div
            role="none"
            onPointerDown={stopAllPropagation}
            onPointerUp={stopAllPropagation}
            onClick={stopAllPropagation}
            onMouseDown={stopAllPropagation}
            onMouseUp={stopAllPropagation}
            onKeyDown={stopAllPropagation}
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
                    <a
                      href={entityHref}
                      className="text-sm font-semibold text-slate-900 dark:text-white hover:underline truncate block"
                    >
                      {cardName}
                    </a>
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
                      <a
                        href={entityHref}
                        className="shrink-0 p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                        aria-label="Open profile"
                      >
                        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                          open_in_new
                        </span>
                      </a>
                    ) : (
                      <a
                        href={addLeadHref}
                        className="shrink-0 p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                        aria-label="Add as lead"
                      >
                        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                          person_add
                        </span>
                      </a>
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {entityHref ? 'Open profile' : 'Add as lead'}
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Actions — primary CTA + icon buttons */}
              <div className="flex items-center gap-1.5 px-4 pb-3">
                <a
                  href={`/email/compose?to=${encodeURIComponent(cardEmail)}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-medium rounded hover:bg-ds-primary-hover transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                    mail
                  </span>{' '}
                  Send Email
                </a>

                <div className="flex items-center gap-0.5 ml-auto">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={
                          entityHref
                            ? `${entityHref}?tab=deals&action=new`
                            : `/deals/new?email=${encodeURIComponent(email)}&name=${encodeURIComponent(displayName || '')}`
                        }
                        className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                        aria-label="New deal"
                      >
                        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                          handshake
                        </span>
                      </a>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      New deal
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleOpenTaskSheet}
                        className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                        aria-label="Add task"
                      >
                        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                          add_task
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      Add task
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={
                          entityHref
                            ? `${entityHref}?tab=activities&action=schedule`
                            : `/calendar/new?email=${encodeURIComponent(email)}&name=${encodeURIComponent(displayName || '')}`
                        }
                        className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                        aria-label="Schedule meeting"
                      >
                        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                          calendar_month
                        </span>
                      </a>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      Schedule meeting
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenu open={isMoreMenuOpen} onOpenChange={setIsMoreMenuOpen}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
                            aria-label="More actions"
                          >
                            <span
                              className="material-symbols-outlined text-[20px]"
                              aria-hidden="true"
                            >
                              more_horiz
                            </span>
                          </button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        More actions
                      </TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="end" className="w-48">
                      {entity && (
                        <DropdownMenuItem onSelect={togglePin}>
                          <span
                            className="material-symbols-outlined text-[16px] mr-2"
                            aria-hidden="true"
                          >
                            {isPinned ? 'keep_off' : 'push_pin'}
                          </span>
                          {isPinned ? 'Unpin from Home' : 'Pin to Home'}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem asChild>
                        <a href={`/email/compose?to=${encodeURIComponent(cardEmail)}`}>
                          <span
                            className="material-symbols-outlined text-[16px] mr-2"
                            aria-hidden="true"
                          >
                            forward_to_inbox
                          </span>{' '}
                          Send Message
                        </a>
                      </DropdownMenuItem>
                      {entity?.phone && (
                        <DropdownMenuItem asChild>
                          <a href={`tel:${entity.phone}`}>
                            <span
                              className="material-symbols-outlined text-[16px] mr-2"
                              aria-hidden="true"
                            >
                              call
                            </span>
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
                  <a
                    href={entityHref}
                    className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    Open detailed view{' '}
                    <span className="material-symbols-outlined text-xs" aria-hidden="true">
                      arrow_outward
                    </span>
                  </a>
                </div>
              )}

              {/* Related messages */}
              <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-2.5">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium mb-1.5">
                  Related Messages
                </p>
                <RelatedMessagesList
                  isLoading={messagesQuery.isLoading}
                  shouldFetch={shouldFetch}
                  messages={messages}
                  currentFolder={currentFolder}
                />
              </div>
            </TooltipProvider>
          </div>
        </HoverCardContent>
      </HoverCard>

      {/* TaskCreateSheet lives OUTSIDE the HoverCard tree — fully decoupled.
          The card closes before the sheet opens, so no focus/event leakage. */}
      <TaskCreateSheet
        open={isTaskSheetOpen}
        onOpenChange={handleTaskSheetChange}
        defaultEntityType={resolveEntityType(entityCacheRef.current.type)}
        defaultEntityId={entityCacheRef.current.id}
        defaultEntityName={entityCacheRef.current.name}
      />
    </>
  );
}
