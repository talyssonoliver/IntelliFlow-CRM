'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  APPOINTMENT_TYPE_OPTIONS,
  BUFFER_PRESETS,
  REMINDER_PRESETS,
  getReminderLabel,
} from '@/lib/appointments/appointment-utils';
import { ConflictWarning } from './ConflictWarning';
import { RecurrenceEditor } from './RecurrenceEditor';
import type {
  AppointmentDetailData,
  AppointmentFormInput,
  ConflictInfo,
  ConflictCheckParams,
  RecurrencePattern,
  AppointmentType,
} from './types';
import { useCalendarVisibility } from '@/hooks/useCalendarVisibility';

export interface AppointmentFormProps {
  appointment?: AppointmentDetailData;
  defaultStartTime?: Date;
  defaultEndTime?: Date;
  onSubmit: (data: AppointmentFormInput) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  conflicts?: ConflictInfo;
  onConflictCheck: (params: ConflictCheckParams) => void;
}

export function AppointmentForm({
  appointment,
  defaultStartTime,
  defaultEndTime,
  onSubmit,
  onCancel,
  isSubmitting,
  conflicts,
  onConflictCheck,
}: AppointmentFormProps) {
  const isEdit = !!appointment;
  const router = useRouter();
  const conflictCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { dbCalendars } = useCalendarVisibility();

  const [title, setTitle] = useState(appointment?.title || '');
  const [description, setDescription] = useState(appointment?.description || '');
  const [appointmentType, setAppointmentType] = useState<AppointmentType>(
    appointment?.appointmentType || 'MEETING'
  );
  const [startTime, setStartTime] = useState(
    appointment?.startTime
      ? toLocalDateTimeString(appointment.startTime)
      : defaultStartTime
        ? toLocalDateTimeString(defaultStartTime)
        : ''
  );
  const [endTime, setEndTime] = useState(
    appointment?.endTime
      ? toLocalDateTimeString(appointment.endTime)
      : defaultEndTime
        ? toLocalDateTimeString(defaultEndTime)
        : ''
  );
  const [location, setLocation] = useState(appointment?.location || '');
  const [attendeeIds] = useState<string[]>(appointment?.attendees?.map((a) => a.userId) || []);
  const [linkedCaseIds] = useState<string[]>(appointment?.linkedCases?.map((c) => c.caseId) || []);
  const [bufferMinutesBefore, setBufferMinutesBefore] = useState(
    appointment?.bufferMinutesBefore ?? 0
  );
  const [bufferMinutesAfter, setBufferMinutesAfter] = useState(
    appointment?.bufferMinutesAfter ?? 0
  );
  const [recurrence, setRecurrence] = useState<RecurrencePattern | null>(
    appointment?.recurrence ?? null
  );
  const [reminderMinutes, setReminderMinutes] = useState(appointment?.reminderMinutes ?? 60);
  const [forceOverrideConflicts, setForceOverrideConflicts] = useState(false);
  const [calendarId, setCalendarId] = useState(appointment?.calendarId || '');

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Debounced conflict check on time/attendee changes
  const scheduleConflictCheck = useCallback(() => {
    if (conflictCheckTimerRef.current) clearTimeout(conflictCheckTimerRef.current);
    conflictCheckTimerRef.current = setTimeout(() => {
      if (startTime && endTime) {
        onConflictCheck({
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          excludeId: appointment?.id,
          attendeeIds,
        });
      }
    }, 400);
  }, [startTime, endTime, attendeeIds, appointment?.id, onConflictCheck]);

  useEffect(() => {
    scheduleConflictCheck();
    return () => {
      if (conflictCheckTimerRef.current) clearTimeout(conflictCheckTimerRef.current);
    };
  }, [scheduleConflictCheck]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = 'Title is required';
    if (!startTime) newErrors.startTime = 'Start time is required';
    if (!endTime) newErrors.endTime = 'End time is required';
    if (startTime && endTime && new Date(endTime) <= new Date(startTime)) {
      newErrors.endTime = 'End time must be after start time';
    }
    if (!appointmentType) newErrors.appointmentType = 'Type is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    await onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      appointmentType,
      location: location.trim() || undefined,
      attendeeIds,
      linkedCaseIds,
      bufferMinutesBefore,
      bufferMinutesAfter,
      recurrence,
      reminderMinutes,
      forceOverrideConflicts,
      calendarId: calendarId || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Title */}
      <div>
        <label htmlFor="appt-title" className="block text-sm font-medium text-gray-700 mb-1">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          id="appt-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={255}
          disabled={isSubmitting}
          className={`w-full rounded-md border px-3 py-2 text-sm ${errors.title ? 'border-red-300' : 'border-gray-300'} disabled:opacity-50`}
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? 'title-error' : undefined}
        />
        {errors.title && (
          <p id="title-error" className="text-xs text-red-600 mt-1">
            {errors.title}
          </p>
        )}
      </div>

      {/* Description */}
      <div>
        <label htmlFor="appt-description" className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          id="appt-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={3}
          disabled={isSubmitting}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>

      {/* Type */}
      <div>
        <label htmlFor="appt-type" className="block text-sm font-medium text-gray-700 mb-1">
          Type <span className="text-red-500">*</span>
        </label>
        <select
          id="appt-type"
          value={appointmentType}
          onChange={(e) => setAppointmentType(e.target.value as AppointmentType)}
          disabled={isSubmitting}
          className={`w-full rounded-md border px-3 py-2 text-sm ${errors.appointmentType ? 'border-red-300' : 'border-gray-300'} disabled:opacity-50`}
          aria-invalid={!!errors.appointmentType}
        >
          {APPOINTMENT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {errors.appointmentType && (
          <p className="text-xs text-red-600 mt-1">{errors.appointmentType}</p>
        )}
      </div>

      {/* Start / End Time */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="appt-start" className="block text-sm font-medium text-gray-700 mb-1">
            Start Time <span className="text-red-500">*</span>
          </label>
          <input
            id="appt-start"
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={isSubmitting}
            className={`w-full rounded-md border px-3 py-2 text-sm ${errors.startTime ? 'border-red-300' : 'border-gray-300'} disabled:opacity-50`}
            aria-invalid={!!errors.startTime}
            aria-describedby={errors.startTime ? 'start-error' : undefined}
          />
          {errors.startTime && (
            <p id="start-error" className="text-xs text-red-600 mt-1">
              {errors.startTime}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="appt-end" className="block text-sm font-medium text-gray-700 mb-1">
            End Time <span className="text-red-500">*</span>
          </label>
          <input
            id="appt-end"
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            disabled={isSubmitting}
            className={`w-full rounded-md border px-3 py-2 text-sm ${errors.endTime ? 'border-red-300' : 'border-gray-300'} disabled:opacity-50`}
            aria-invalid={!!errors.endTime}
            aria-describedby={errors.endTime ? 'end-error' : undefined}
          />
          {errors.endTime && (
            <p id="end-error" className="text-xs text-red-600 mt-1">
              {errors.endTime}
            </p>
          )}
        </div>
      </div>

      {/* Location */}
      <div>
        <label htmlFor="appt-location" className="block text-sm font-medium text-gray-700 mb-1">
          Location
        </label>
        <input
          id="appt-location"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          maxLength={500}
          disabled={isSubmitting}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>

      {/* Calendar */}
      <div>
        <label htmlFor="appt-calendar" className="block text-sm font-medium text-gray-700 mb-1">
          Calendar
        </label>
        <select
          id="appt-calendar"
          value={calendarId}
          onChange={(e) => setCalendarId(e.target.value)}
          disabled={isSubmitting}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
        >
          <option value="">Personal (Default)</option>
          {dbCalendars.map((cal) => (
            <option key={cal.id} value={cal.id}>
              {cal.name}
            </option>
          ))}
        </select>
      </div>

      {/* Buffer Time */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="appt-buffer-before"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Buffer Before
          </label>
          <select
            id="appt-buffer-before"
            value={bufferMinutesBefore}
            onChange={(e) => setBufferMinutesBefore(parseInt(e.target.value, 10))}
            disabled={isSubmitting}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            {BUFFER_PRESETS.map((v) => (
              <option key={v} value={v}>
                {v === 0 ? 'None' : `${v} min`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="appt-buffer-after"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Buffer After
          </label>
          <select
            id="appt-buffer-after"
            value={bufferMinutesAfter}
            onChange={(e) => setBufferMinutesAfter(parseInt(e.target.value, 10))}
            disabled={isSubmitting}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            {BUFFER_PRESETS.map((v) => (
              <option key={v} value={v}>
                {v === 0 ? 'None' : `${v} min`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Reminder */}
      <div>
        <label htmlFor="appt-reminder" className="block text-sm font-medium text-gray-700 mb-1">
          Reminder
        </label>
        <select
          id="appt-reminder"
          value={reminderMinutes}
          onChange={(e) => setReminderMinutes(parseInt(e.target.value, 10))}
          disabled={isSubmitting}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
        >
          {REMINDER_PRESETS.map((v) => (
            <option key={v} value={v}>
              {getReminderLabel(v)}
            </option>
          ))}
        </select>
      </div>

      {/* Recurrence */}
      <RecurrenceEditor value={recurrence} onChange={setRecurrence} disabled={isSubmitting} />

      {/* Conflict Warning */}
      {conflicts?.hasConflicts && (
        <ConflictWarning
          conflicts={conflicts.conflicts}
          onViewConflict={(appointmentId) => router.push(`/calendar/${appointmentId}`)}
          onOverride={() => setForceOverrideConflicts(!forceOverrideConflicts)}
        />
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {isSubmitting && (
            <span className="material-symbols-outlined text-base animate-spin">
              progress_activity
            </span>
          )}
          {isEdit ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  );
}

function toLocalDateTimeString(date: Date | string): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
