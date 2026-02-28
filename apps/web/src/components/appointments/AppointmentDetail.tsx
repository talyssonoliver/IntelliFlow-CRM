'use client';

import { useEffect, useState } from 'react';
import {
  getTypeConfig,
  getStatusConfig,
  formatRecurrence,
  getInitials,
} from '@/lib/appointments/appointment-utils';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { AppointmentDetailData } from './types';

export interface AppointmentDetailProps {
  appointment: AppointmentDetailData;
  isLoading: boolean;
  onConfirm: () => Promise<void>;
  onComplete: (notes?: string) => Promise<void>;
  onCancel: (reason?: string) => Promise<void>;
  onMarkNoShow: () => Promise<void>;
  onReschedule: (newStart: Date, newEnd: Date, reason?: string) => Promise<void>;
  onAddAttendee: (userId: string) => Promise<void>;
  onRemoveAttendee: (userId: string) => Promise<void>;
  onLinkCase: (caseId: string) => Promise<void>;
  onUnlinkCase: (caseId: string) => Promise<void>;
}

type Tab = 'overview' | 'attendees' | 'cases';
type Dialog = 'complete' | 'cancel' | 'reschedule' | 'addAttendee' | 'linkCase' | null;

const TERMINAL_STATUSES: AppointmentDetailData['status'][] = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

function formatReminder(minutes?: number): string {
  if (!minutes || minutes <= 0) return 'None';
  if (minutes < 60) return `${minutes} min before`;
  if (minutes === 60) return '1 hour before';
  if (minutes === 1440) return '1 day before';
  return `${Math.round(minutes / 60)} hours before`;
}

function formatTimelineDate(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function AppointmentDetail({
  appointment,
  isLoading,
  onConfirm,
  onComplete,
  onCancel,
  onMarkNoShow,
  onReschedule,
  onAddAttendee,
  onRemoveAttendee,
  onLinkCase,
  onUnlinkCase,
}: AppointmentDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [activeDialog, setActiveDialog] = useState<Dialog>(null);
  const [dialogInput, setDialogInput] = useState('');
  const [rescheduleStart, setRescheduleStart] = useState('');
  const [rescheduleEnd, setRescheduleEnd] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [noteDraft, setNoteDraft] = useState(appointment.notes ?? '');
  const [isActionLoading, setIsActionLoading] = useState(false);

  const dialogRef = useFocusTrap<HTMLDivElement>(!!activeDialog);

  const typeConfig = getTypeConfig(appointment.appointmentType);
  const statusConfig = getStatusConfig(appointment.status);
  const isTerminal = TERMINAL_STATUSES.includes(appointment.status);
  const hasBuffer = appointment.bufferMinutesBefore > 0 || appointment.bufferMinutesAfter > 0;

  useEffect(() => {
    setNoteDraft(appointment.notes ?? '');
  }, [appointment.id, appointment.notes]);

  const handleAction = async (action: () => Promise<void>) => {
    setIsActionLoading(true);
    try {
      await action();
    } finally {
      setIsActionLoading(false);
      setActiveDialog(null);
      setDialogInput('');
    }
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4" data-testid="detail-skeleton">
        <div className="grid xl:grid-cols-12 gap-6">
          <div className="xl:col-span-3 h-72 bg-slate-100 rounded-xl" />
          <div className="xl:col-span-6 h-[32rem] bg-slate-100 rounded-xl" />
          <div className="xl:col-span-3 h-80 bg-slate-100 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="appointment-detail">
      <h2 className="sr-only">{appointment.title}</h2>

      <div className="grid xl:grid-cols-12 gap-6">
        <aside className="xl:col-span-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">Schedule Snapshot</h3>

            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Status</p>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusConfig.bgColor} ${statusConfig.color}`}>
                  {appointment.status === 'SCHEDULED' && <span className="size-1.5 rounded-full bg-primary animate-pulse" />}
                  {statusConfig.label}
                </span>
              </div>

              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-slate-400 mt-0.5">category</span>
                <div>
                  <p className="text-xs text-slate-500">Type</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{typeConfig.label}</p>
                </div>
              </div>

              {appointment.location && (
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-slate-400 mt-0.5">location_on</span>
                  <div>
                    <p className="text-xs text-slate-500">Location</p>
                    <p className="text-sm font-semibold text-primary">{appointment.location}</p>
                  </div>
                </div>
              )}

              {appointment.organizer && (
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-slate-400 mt-0.5">person</span>
                  <div>
                    <p className="text-xs text-slate-500">Organizer</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{appointment.organizer.name}</p>
                  </div>
                </div>
              )}

              <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Buffer Time</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {hasBuffer ? (
                      <>
                        {appointment.bufferMinutesBefore > 0 && `${appointment.bufferMinutesBefore} min before`}
                        {appointment.bufferMinutesBefore > 0 && appointment.bufferMinutesAfter > 0 && ' / '}
                        {appointment.bufferMinutesAfter > 0 && `${appointment.bufferMinutesAfter} min after`}
                      </>
                    ) : (
                      'None'
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Recurrence</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {appointment.recurrence ? formatRecurrence(appointment.recurrence) : 'None'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Reminder</span>
                  <span className="font-medium text-primary">{formatReminder(appointment.reminderMinutes)}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <section className="xl:col-span-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm min-h-[560px]">
            <div className="flex border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6" role="tablist">
              {(['overview', 'attendees', 'cases'] as const).map((tab) => {
                const isActive = activeTab === tab;
                const label = tab === 'overview' ? 'Overview' : tab === 'attendees' ? `Attendees (${appointment.attendees.length})` : `Linked Cases (${appointment.linkedCases.length})`;

                return (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-4 text-sm border-b-2 transition-colors ${
                      isActive
                        ? 'border-primary text-primary font-semibold'
                        : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="p-4 sm:p-6" role="tabpanel">
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Description</h4>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
                      <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                        {appointment.description || 'No description available.'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Internal Notes</h4>
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      rows={4}
                      placeholder="Add private notes for the team..."
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm text-slate-700 dark:text-slate-300 focus:border-primary focus:ring-primary"
                    />
                  </div>

                  <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {appointment.linkedCases[0] ? (
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="size-9 shrink-0 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                          <span className="material-symbols-outlined text-lg">folder_open</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{appointment.linkedCases[0].title}</p>
                          <p className="text-xs text-slate-500">{appointment.linkedCases[0].caseNumber ? `${appointment.linkedCases[0].caseNumber} - Linked Case` : 'Linked Case'}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No linked cases.</p>
                    )}

                    {!isTerminal && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveDialog('linkCase');
                          setSearchInput('');
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        <span className="material-symbols-outlined text-base">add_link</span>
                        Link Case
                      </button>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'attendees' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Attendees ({appointment.attendees.length})</h4>
                    {!isTerminal && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveDialog('addAttendee');
                          setSearchInput('');
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover"
                      >
                        <span className="material-symbols-outlined text-base">person_add</span>
                        Add Attendee
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {appointment.attendees.map((attendee) => (
                      <div key={attendee.id} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                            {getInitials(attendee.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{attendee.name}</p>
                            {attendee.email && <p className="text-xs text-slate-500 truncate">{attendee.email}</p>}
                          </div>
                        </div>

                        {!isTerminal && (
                          <button
                            type="button"
                            onClick={() => onRemoveAttendee(attendee.userId)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-destructive hover:text-destructive/80"
                            aria-label={`Remove ${attendee.name}`}
                          >
                            <span className="material-symbols-outlined text-base">close</span>
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'cases' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Linked Cases ({appointment.linkedCases.length})</h4>
                    {!isTerminal && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveDialog('linkCase');
                          setSearchInput('');
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover"
                      >
                        <span className="material-symbols-outlined text-base">add_link</span>
                        Link Case
                      </button>
                    )}
                  </div>

                  {appointment.linkedCases.length === 0 && (
                    <p className="text-sm text-slate-500">No linked cases.</p>
                  )}

                  <div className="space-y-3">
                    {appointment.linkedCases.map((linkedCase) => (
                      <div key={linkedCase.id} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{linkedCase.title}</p>
                          {linkedCase.caseNumber && <p className="text-xs text-slate-500">{linkedCase.caseNumber}</p>}
                        </div>

                        {!isTerminal && (
                          <button
                            type="button"
                            onClick={() => onUnlinkCase(linkedCase.caseId)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-destructive hover:text-destructive/80"
                            aria-label={`Unlink ${linkedCase.title}`}
                          >
                            <span className="material-symbols-outlined text-base">link_off</span>
                            Unlink
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="xl:col-span-3 space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">Quick Actions</h3>

            {!isTerminal && (
              <div className="space-y-3">
                {appointment.status === 'SCHEDULED' && (
                  <button
                    type="button"
                    onClick={() => handleAction(onConfirm)}
                    disabled={isActionLoading}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-base">check_circle</span>
                    Confirm
                  </button>
                )}

                {(appointment.status === 'CONFIRMED' || appointment.status === 'IN_PROGRESS') && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveDialog('complete');
                      setDialogInput('');
                    }}
                    disabled={isActionLoading}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-base">task_alt</span>
                    Complete
                  </button>
                )}

                <div className="h-px bg-slate-200 dark:bg-slate-700" />

                <button
                  type="button"
                  onClick={() => {
                    setActiveDialog('reschedule');
                    setRescheduleStart('');
                    setRescheduleEnd('');
                    setDialogInput('');
                  }}
                  disabled={isActionLoading}
                  className="w-full inline-flex items-center gap-3 rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-base text-slate-400">update</span>
                  Reschedule
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveDialog('cancel');
                    setDialogInput('');
                  }}
                  disabled={isActionLoading}
                  className="w-full inline-flex items-center gap-3 rounded-lg px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-base">cancel</span>
                  Cancel
                </button>

                {appointment.status === 'CONFIRMED' && (
                  <button
                    type="button"
                    onClick={() => handleAction(onMarkNoShow)}
                    disabled={isActionLoading}
                    className="w-full inline-flex items-center gap-3 rounded-lg px-4 py-2 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-base">person_off</span>
                    Mark No Show
                  </button>
                )}
              </div>
            )}

            {isTerminal && (
              <p className="text-sm text-slate-500">No actions available for {statusConfig.label.toLowerCase()} appointments.</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">Timeline</h3>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="relative">
                  <div className="size-2 rounded-full bg-primary mt-1.5" />
                  <div className="absolute top-4 left-[3px] h-8 w-px bg-slate-200 dark:bg-slate-700" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Appointment Created</p>
                  <p className="text-[11px] text-slate-500">{formatTimelineDate(appointment.createdAt)}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="size-2 rounded-full bg-slate-300 dark:bg-slate-600 mt-1.5" />
                <div>
                  <p className="text-xs font-semibold text-slate-500">Meeting Reminder</p>
                  <p className="text-[11px] text-slate-500">
                    {appointment.reminderMinutes && appointment.reminderMinutes > 0
                      ? `Reminder set (${appointment.reminderMinutes} min)`
                      : 'No reminder set'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {activeDialog && (
        <div ref={dialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" onKeyDown={(e) => { if (e.key === 'Escape') setActiveDialog(null); }}>
          <div className="mx-4 w-full max-w-md rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-xl">
            {activeDialog === 'complete' && (
              <>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Complete Appointment</h3>
                <label htmlFor="complete-notes" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Notes (optional)</label>
                <textarea
                  id="complete-notes"
                  value={dialogInput}
                  onChange={(e) => setDialogInput(e.target.value)}
                  rows={3}
                  className="mb-4 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setActiveDialog(null)} className="rounded-md border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                  <button type="button" onClick={() => handleAction(() => onComplete(dialogInput || undefined))} className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">Complete</button>
                </div>
              </>
            )}

            {activeDialog === 'cancel' && (
              <>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Cancel Appointment</h3>
                <label htmlFor="cancel-reason" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Reason (optional)</label>
                <textarea
                  id="cancel-reason"
                  value={dialogInput}
                  onChange={(e) => setDialogInput(e.target.value)}
                  rows={3}
                  className="mb-4 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setActiveDialog(null)} className="rounded-md border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">Close</button>
                  <button type="button" onClick={() => handleAction(() => onCancel(dialogInput || undefined))} className="rounded-md bg-rose-600 px-4 py-2 text-sm text-white hover:bg-rose-700">Cancel Appointment</button>
                </div>
              </>
            )}

            {activeDialog === 'reschedule' && (
              <>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Reschedule Appointment</h3>
                <div className="mb-4 space-y-3">
                  <div>
                    <label htmlFor="reschedule-start" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">New Start Time</label>
                    <input
                      id="reschedule-start"
                      type="datetime-local"
                      value={rescheduleStart}
                      onChange={(e) => setRescheduleStart(e.target.value)}
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="reschedule-end" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">New End Time</label>
                    <input
                      id="reschedule-end"
                      type="datetime-local"
                      value={rescheduleEnd}
                      onChange={(e) => setRescheduleEnd(e.target.value)}
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="reschedule-reason" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Reason (optional)</label>
                    <textarea
                      id="reschedule-reason"
                      value={dialogInput}
                      onChange={(e) => setDialogInput(e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setActiveDialog(null)} className="rounded-md border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                  <button
                    type="button"
                    disabled={!rescheduleStart || !rescheduleEnd}
                    onClick={() => handleAction(() => onReschedule(new Date(rescheduleStart), new Date(rescheduleEnd), dialogInput || undefined))}
                    className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                  >
                    Reschedule
                  </button>
                </div>
              </>
            )}

            {activeDialog === 'addAttendee' && (
              <>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Add Attendee</h3>
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="mb-4 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
                <p className="mb-4 text-sm text-slate-500">Enter a user ID to add as attendee.</p>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setActiveDialog(null)} className="rounded-md border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                  <button
                    type="button"
                    disabled={!searchInput.trim()}
                    onClick={() => handleAction(() => onAddAttendee(searchInput.trim()))}
                    className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </>
            )}

            {activeDialog === 'linkCase' && (
              <>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Link Case</h3>
                <input
                  type="text"
                  placeholder="Search cases..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="mb-4 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
                <p className="mb-4 text-sm text-slate-500">Enter a case ID to link.</p>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setActiveDialog(null)} className="rounded-md border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                  <button
                    type="button"
                    disabled={!searchInput.trim()}
                    onClick={() => handleAction(() => onLinkCase(searchInput.trim()))}
                    className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                  >
                    Link
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
