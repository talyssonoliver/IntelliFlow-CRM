'use client';

import { useState } from 'react';
import { getTypeConfig, getStatusConfig, formatTimeRange, formatDuration, formatRecurrence, getInitials } from '@/lib/appointments/appointment-utils';
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

const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

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
  const [isActionLoading, setIsActionLoading] = useState(false);

  const typeConfig = getTypeConfig(appointment.appointmentType);
  const statusConfig = getStatusConfig(appointment.status);
  const isTerminal = TERMINAL_STATUSES.includes(appointment.status);

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
        <div className="h-8 bg-gray-200 rounded w-64" />
        <div className="grid xl:grid-cols-12 gap-6">
          <div className="xl:col-span-3 h-48 bg-gray-100 rounded-lg" />
          <div className="xl:col-span-6 h-64 bg-gray-100 rounded-lg" />
          <div className="xl:col-span-3 h-48 bg-gray-100 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="appointment-detail">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className={`material-symbols-outlined text-2xl ${typeConfig.color}`}>{typeConfig.icon}</span>
          <h1 className="text-xl font-bold text-gray-900">{appointment.title}</h1>
          <span className={`text-xs px-2 py-1 rounded ${statusConfig.bgColor} ${statusConfig.color} font-medium`}>
            {statusConfig.label}
          </span>
        </div>
      </div>

      <div className="grid xl:grid-cols-12 gap-6">
        {/* Left: Info Card */}
        <div className="xl:col-span-3">
          <div className="rounded-lg border bg-white p-4 space-y-4">
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Type</h3>
              <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined text-base ${typeConfig.color}`}>{typeConfig.icon}</span>
                <span className={`text-sm ${typeConfig.color} font-medium`}>{typeConfig.label}</span>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Time</h3>
              <p className="text-sm text-gray-900">{formatTimeRange(appointment.startTime, appointment.endTime)}</p>
              <p className="text-xs text-gray-600">{formatDuration(appointment.startTime, appointment.endTime)}</p>
            </div>

            {appointment.location && (
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Location</h3>
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base text-gray-400">location_on</span>
                  <span className="text-sm text-gray-900">{appointment.location}</span>
                </div>
              </div>
            )}

            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Organizer</h3>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-800">
                  {getInitials(appointment.organizer.name)}
                </div>
                <span className="text-sm text-gray-900">{appointment.organizer.name}</span>
              </div>
            </div>

            {(appointment.bufferMinutesBefore > 0 || appointment.bufferMinutesAfter > 0) && (
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Buffer Time</h3>
                <div className="text-sm text-gray-700 space-y-0.5">
                  {appointment.bufferMinutesBefore > 0 && (
                    <p>{appointment.bufferMinutesBefore} min before</p>
                  )}
                  {appointment.bufferMinutesAfter > 0 && (
                    <p>{appointment.bufferMinutesAfter} min after</p>
                  )}
                </div>
              </div>
            )}

            {appointment.recurrence && (
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Recurrence</h3>
                <p className="text-sm text-gray-700">{formatRecurrence(appointment.recurrence)}</p>
              </div>
            )}

            {appointment.reminderMinutes && (
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-1">Reminder</h3>
                <p className="text-sm text-gray-700">
                  {appointment.reminderMinutes < 60
                    ? `${appointment.reminderMinutes} min before`
                    : appointment.reminderMinutes === 60
                      ? '1 hour before'
                      : appointment.reminderMinutes === 1440
                        ? '1 day before'
                        : `${Math.round(appointment.reminderMinutes / 60)} hours before`}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Center: Tabs */}
        <div className="xl:col-span-6">
          <div className="rounded-lg border bg-white">
            {/* Tab headers */}
            <div className="flex border-b" role="tablist">
              {(['overview', 'attendees', 'cases'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${
                    activeTab === tab
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'cases' ? 'Linked Cases' : tab}
                  {tab === 'attendees' && ` (${appointment.attendees.length})`}
                  {tab === 'cases' && ` (${appointment.linkedCases.length})`}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="p-4" role="tabpanel">
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  {appointment.description && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-1">Description</h3>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{appointment.description}</p>
                    </div>
                  )}
                  {appointment.notes && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-1">Notes</h3>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{appointment.notes}</p>
                    </div>
                  )}
                  {!appointment.description && !appointment.notes && (
                    <p className="text-sm text-gray-400 italic">No description or notes.</p>
                  )}
                </div>
              )}

              {activeTab === 'attendees' && (
                <div className="space-y-3">
                  {appointment.attendees.map((att) => (
                    <div key={att.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-800">
                          {getInitials(att.name)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{att.name}</p>
                          {att.email && <p className="text-xs text-gray-500">{att.email}</p>}
                        </div>
                      </div>
                      {!isTerminal && (
                        <button
                          type="button"
                          onClick={() => onRemoveAttendee(att.userId)}
                          className="text-sm text-red-600 hover:text-red-800"
                          aria-label={`Remove ${att.name}`}
                        >
                          <span className="material-symbols-outlined text-base">close</span>
                        </button>
                      )}
                    </div>
                  ))}
                  {!isTerminal && (
                    <button
                      type="button"
                      onClick={() => { setActiveDialog('addAttendee'); setSearchInput(''); }}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                    >
                      <span className="material-symbols-outlined text-base">person_add</span>
                      Add Attendee
                    </button>
                  )}
                </div>
              )}

              {activeTab === 'cases' && (
                <div className="space-y-3">
                  {appointment.linkedCases.map((lc) => (
                    <div key={lc.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{lc.title}</p>
                        {lc.caseNumber && <p className="text-xs text-gray-500">{lc.caseNumber}</p>}
                      </div>
                      {!isTerminal && (
                        <button
                          type="button"
                          onClick={() => onUnlinkCase(lc.caseId)}
                          className="text-sm text-red-600 hover:text-red-800"
                          aria-label={`Unlink ${lc.title}`}
                        >
                          <span className="material-symbols-outlined text-base">link_off</span>
                        </button>
                      )}
                    </div>
                  ))}
                  {appointment.linkedCases.length === 0 && (
                    <p className="text-sm text-gray-400 italic">No linked cases.</p>
                  )}
                  {!isTerminal && (
                    <button
                      type="button"
                      onClick={() => { setActiveDialog('linkCase'); setSearchInput(''); }}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                    >
                      <span className="material-symbols-outlined text-base">add_link</span>
                      Link Case
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Quick Actions */}
        <div className="xl:col-span-3">
          <div className="rounded-lg border bg-white p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Quick Actions</h3>

            {!isTerminal && (
              <div className="space-y-2">
                {appointment.status === 'SCHEDULED' && (
                  <button
                    type="button"
                    onClick={() => handleAction(onConfirm)}
                    disabled={isActionLoading}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-base">check_circle</span>
                    Confirm
                  </button>
                )}

                {(appointment.status === 'CONFIRMED' || appointment.status === 'IN_PROGRESS') && (
                  <button
                    type="button"
                    onClick={() => { setActiveDialog('complete'); setDialogInput(''); }}
                    disabled={isActionLoading}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-700 bg-green-50 rounded-md hover:bg-green-100 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-base">task_alt</span>
                    Complete
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => { setActiveDialog('cancel'); setDialogInput(''); }}
                  disabled={isActionLoading}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-700 bg-red-50 rounded-md hover:bg-red-100 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-base">cancel</span>
                  Cancel
                </button>

                {appointment.status === 'CONFIRMED' && (
                  <button
                    type="button"
                    onClick={() => handleAction(onMarkNoShow)}
                    disabled={isActionLoading}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-orange-700 bg-orange-50 rounded-md hover:bg-orange-100 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-base">person_off</span>
                    No Show
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setActiveDialog('reschedule');
                    setRescheduleStart('');
                    setRescheduleEnd('');
                    setDialogInput('');
                  }}
                  disabled={isActionLoading}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-amber-700 bg-amber-50 rounded-md hover:bg-amber-100 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-base">schedule</span>
                  Reschedule
                </button>
              </div>
            )}

            {isTerminal && (
              <p className="text-sm text-gray-400 italic">No actions available for {statusConfig.label.toLowerCase()} appointments.</p>
            )}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {activeDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            {activeDialog === 'complete' && (
              <>
                <h3 className="text-lg font-semibold mb-4">Complete Appointment</h3>
                <label htmlFor="complete-notes" className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  id="complete-notes"
                  value={dialogInput}
                  onChange={(e) => setDialogInput(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm mb-4"
                />
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setActiveDialog(null)} className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">Cancel</button>
                  <button type="button" onClick={() => handleAction(() => onComplete(dialogInput || undefined))} className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700">Complete</button>
                </div>
              </>
            )}

            {activeDialog === 'cancel' && (
              <>
                <h3 className="text-lg font-semibold mb-4">Cancel Appointment</h3>
                <label htmlFor="cancel-reason" className="block text-sm font-medium text-gray-700 mb-1">
                  Reason (optional)
                </label>
                <textarea
                  id="cancel-reason"
                  value={dialogInput}
                  onChange={(e) => setDialogInput(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm mb-4"
                />
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setActiveDialog(null)} className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">Close</button>
                  <button type="button" onClick={() => handleAction(() => onCancel(dialogInput || undefined))} className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700">Cancel Appointment</button>
                </div>
              </>
            )}

            {activeDialog === 'reschedule' && (
              <>
                <h3 className="text-lg font-semibold mb-4">Reschedule Appointment</h3>
                <div className="space-y-3 mb-4">
                  <div>
                    <label htmlFor="reschedule-start" className="block text-sm font-medium text-gray-700 mb-1">New Start Time</label>
                    <input id="reschedule-start" type="datetime-local" value={rescheduleStart} onChange={(e) => setRescheduleStart(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label htmlFor="reschedule-end" className="block text-sm font-medium text-gray-700 mb-1">New End Time</label>
                    <input id="reschedule-end" type="datetime-local" value={rescheduleEnd} onChange={(e) => setRescheduleEnd(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label htmlFor="reschedule-reason" className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
                    <textarea id="reschedule-reason" value={dialogInput} onChange={(e) => setDialogInput(e.target.value)} rows={2} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setActiveDialog(null)} className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">Cancel</button>
                  <button
                    type="button"
                    disabled={!rescheduleStart || !rescheduleEnd}
                    onClick={() => handleAction(() => onReschedule(new Date(rescheduleStart), new Date(rescheduleEnd), dialogInput || undefined))}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Reschedule
                  </button>
                </div>
              </>
            )}

            {activeDialog === 'addAttendee' && (
              <>
                <h3 className="text-lg font-semibold mb-4">Add Attendee</h3>
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm mb-4"
                />
                <p className="text-sm text-gray-500 mb-4">Enter a user ID to add as attendee.</p>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setActiveDialog(null)} className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">Cancel</button>
                  <button
                    type="button"
                    disabled={!searchInput.trim()}
                    onClick={() => handleAction(() => onAddAttendee(searchInput.trim()))}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </>
            )}

            {activeDialog === 'linkCase' && (
              <>
                <h3 className="text-lg font-semibold mb-4">Link Case</h3>
                <input
                  type="text"
                  placeholder="Search cases..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm mb-4"
                />
                <p className="text-sm text-gray-500 mb-4">Enter a case ID to link.</p>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setActiveDialog(null)} className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">Cancel</button>
                  <button
                    type="button"
                    disabled={!searchInput.trim()}
                    onClick={() => handleAction(() => onLinkCase(searchInput.trim()))}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
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
