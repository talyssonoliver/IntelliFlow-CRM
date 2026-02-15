'use client';

import { useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@intelliflow/ui';
import { AppAvatar } from '@/components/shared/app-avatar';
import type { TicketAssigneeOption } from './types';

interface TicketAssignSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketSubject: string;
  currentUserId?: string | null;
  currentUserName?: string | null;
  assignees?: TicketAssigneeOption[];
  isAssigning?: boolean;
  isLoadingOptions?: boolean;
  onAssign: (userId: string) => Promise<void>;
}

export function TicketAssignSidebar({
  open,
  onOpenChange,
  ticketSubject,
  currentUserId = null,
  currentUserName = null,
  assignees = [],
  isAssigning = false,
  isLoadingOptions = false,
  onAssign,
}: TicketAssignSidebarProps) {
  const uniqueAssignees = useMemo(() => {
    const seenIds = new Set<string>();
    return assignees.filter((assignee) => {
      const id = assignee.id.trim();
      if (!id || seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
  }, [assignees]);

  const handleAssign = async (assigneeId: string) => {
    if (!assigneeId || isAssigning) return;
    try {
      await onAssign(assigneeId);
      onOpenChange(false);
    } catch {
      // Mutation error feedback is surfaced by caller; keep sidebar open.
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md flex flex-col p-0 gap-0">
        <SheetHeader className="p-6 border-b border-slate-200 dark:border-slate-700">
          <SheetTitle className="text-xl font-bold text-slate-900 dark:text-white">
            Assign Ticket
          </SheetTitle>
          <SheetDescription className="text-sm text-slate-500 dark:text-slate-400">
            Select an owner for &quot;{ticketSubject}&quot;.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <section className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Quick Action
            </p>
            <button
              type="button"
              onClick={() => {
                if (currentUserId) {
                  void handleAssign(currentUserId);
                }
              }}
              disabled={isAssigning || !currentUserId}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-lg bg-[#137fec]/5 border border-[#137fec]/20 text-left hover:bg-[#137fec]/10 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="material-symbols-outlined text-[#137fec] text-[20px]">person</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Assign to me</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {currentUserName || 'Current user'}
                  </p>
                </div>
              </div>
              <span className="material-symbols-outlined text-slate-400 text-[18px]">chevron_right</span>
            </button>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-700">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Team Members
              </p>
            </div>

            {isLoadingOptions ? (
              <p className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">Loading team members...</p>
            ) : uniqueAssignees.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">No team members available.</p>
            ) : (
              <div className="p-2 space-y-1">
                {uniqueAssignees.map((assignee) => {
                  const isSelf = Boolean(currentUserId) && assignee.id === currentUserId;

                  return (
                    <button
                      key={assignee.id}
                      type="button"
                      onClick={() => {
                        void handleAssign(assignee.id);
                      }}
                      disabled={isAssigning}
                      className="w-full flex items-center justify-between gap-3 p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <AppAvatar
                          name={assignee.name}
                          src={assignee.avatar ?? null}
                          className="size-9"
                          fallbackClassName="text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-700"
                        />

                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {assignee.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {assignee.title}
                          </p>
                        </div>
                      </div>

                      {isSelf && (
                        <span className="text-[10px] font-semibold text-[#137fec] bg-[#137fec]/10 px-2 py-0.5 rounded-full">
                          You
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
