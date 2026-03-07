'use client';

/**
 * Shared Assign Sheet — reusable right-side panel for assigning items to team members.
 *
 * Pattern extracted from TicketAssignSidebar for cross-module reuse.
 * Used by: Ticket assignment, Escalation, Lead routing, etc.
 */

import { useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@intelliflow/ui';
import { AppAvatar } from '@/components/shared/app-avatar';

export interface AssigneeOption {
  id: string;
  name: string;
  title: string;
  avatar?: string | null;
}

interface AssignSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sheet title, e.g. "Assign Ticket", "Escalate to Manager" */
  title: string;
  /** Description below the title, e.g. 'Select an owner for "Dashboard Issues"' */
  description?: string;
  /** Currently authenticated user ID (for "Assign to me" quick action) */
  currentUserId?: string | null;
  /** Currently authenticated user name */
  currentUserName?: string | null;
  /** List of available team members to assign to */
  assignees: AssigneeOption[];
  /** Whether an assignment is currently in progress */
  isAssigning?: boolean;
  /** Whether the assignee list is still loading */
  isLoadingOptions?: boolean;
  /** Callback when a team member is selected. Return a promise to keep sheet open on error. */
  onAssign: (userId: string) => void | Promise<void>;
  /** Optional: show "Assign to me" quick action. Default true */
  showSelfAssign?: boolean;
  /** Optional: label for the team section. Default "Team Members" */
  teamSectionLabel?: string;
  /** Optional: children rendered between header and team list (e.g. reason textarea) */
  children?: React.ReactNode;
  /** When false, team member buttons are disabled (e.g. reason field not filled). Default true */
  canAssign?: boolean;
}

export function AssignSheet({
  open,
  onOpenChange,
  title,
  description,
  currentUserId = null,
  currentUserName = null,
  assignees,
  isAssigning = false,
  isLoadingOptions = false,
  onAssign,
  showSelfAssign = true,
  teamSectionLabel = 'Team Members',
  children,
  canAssign = true,
}: Readonly<AssignSheetProps>) {
  const uniqueAssignees = useMemo(() => {
    const seenIds = new Set<string>();
    return assignees.filter((assignee) => {
      const id = assignee.id.trim();
      if (!id || seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
  }, [assignees]);

  const isDisabled = isAssigning || !canAssign;

  const handleAssign = async (assigneeId: string) => {
    if (!assigneeId || isDisabled) return;
    try {
      await onAssign(assigneeId);
      onOpenChange(false);
    } catch {
      // Keep sheet open on error — caller surfaces feedback
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md flex flex-col p-0 gap-0">
        <SheetHeader className="p-6 border-b border-slate-200 dark:border-slate-700">
          <SheetTitle className="text-xl font-bold text-slate-900 dark:text-white">
            {title}
          </SheetTitle>
          {description && (
            <SheetDescription className="text-sm text-slate-500 dark:text-slate-400">
              {description}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Quick Action: Assign to me */}
          {showSelfAssign && currentUserId && (
            <section className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Quick Action
              </p>
              <button
                type="button"
                onClick={() => handleAssign(currentUserId)}
                disabled={isDisabled}
                className="w-full flex items-center justify-between gap-3 p-3 rounded-lg bg-[#137fec]/5 border border-[#137fec]/20 text-left hover:bg-[#137fec]/10 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="material-symbols-outlined text-[#137fec] text-[20px]">
                    person
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Assign to me
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {currentUserName || 'Current user'}
                    </p>
                  </div>
                </div>
                <span className="material-symbols-outlined text-slate-400 text-[18px]">
                  chevron_right
                </span>
              </button>
            </section>
          )}

          {/* Extra content (e.g. reason textarea for escalation) */}
          {children}

          {/* Team Members */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-700">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {teamSectionLabel}
              </p>
            </div>

            {(() => {
              if (isLoadingOptions)
                return (
                  <p className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
                    Loading team members...
                  </p>
                );
              if (uniqueAssignees.length === 0)
                return (
                  <p className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
                    No team members available.
                  </p>
                );
              return (
                <div className="p-2 space-y-1">
                  {uniqueAssignees.map((assignee) => {
                    const isSelf = Boolean(currentUserId) && assignee.id === currentUserId;

                    return (
                      <button
                        key={assignee.id}
                        type="button"
                        onClick={() => handleAssign(assignee.id)}
                        disabled={isDisabled}
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
              );
            })()}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
