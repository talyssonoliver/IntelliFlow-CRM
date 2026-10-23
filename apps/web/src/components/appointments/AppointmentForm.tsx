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
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { TimezoneSelector } from '@/components/settings/TimezoneSelector';
import type {
  AppointmentDetailData,
  AppointmentFormInput,
  ConflictInfo,
  ConflictCheckParams,
  RecurrencePattern,
  AppointmentType,
} from './types';
import { useCalendarVisibilityOptional } from '@/hooks/useCalendarVisibility';

export interface AppointmentFormProps {
  appointment?: AppointmentDetailData;
  defaultStartTime?: Date;
  defaultEndTime?: Date;
  onSubmit: (data: AppointmentFormInput) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  conflicts?: ConflictInfo;
  onConflictCheck: (params: ConflictCheckParams) => void;
  /** Firm default buffers (PG-202 owner Q7); used for new appointments only. */
  defaultBuffers?: { before: number; after: number };
  /** PG-203: the firm's active event types, offered as templates for new appointments. */
  eventTypes?: readonly EventTypeOption[];
}

/** The fields of an event type the form uses (calendar.eventTypes.listActive). */
export interface EventTypeOption {
  id: string;
  name: string;
  durationMinutes: number;
  description: string | null;
  locationDetails: string | null;
  appointmentType: AppointmentType;
}

/**
 * `datetime-local` value plus `minutes`, in the same wall-clock form. The value is read
 * as UTC so the sum and toLocalDateTimeString's UTC getters agree in every browser zone.
 */
export function addMinutesLocal(value: string, minutes: number): string {
  return toLocalDateTimeString(new Date(Date.parse(`${value}Z`) + minutes * 60_000));
}

const SUBMIT_ERROR_ID = 'form-submit-error';
const GENERIC_SUBMIT_ERROR = 'The appointment could not be saved. Please try again.';
const TIMEZONE_HELP_ID = 'appt-timezone-help';

/** The buffer presets, plus the current value when it is not one of them (e.g. a firm default of 10). */
function bufferOptions(current: number): number[] {
  const presets: readonly number[] = BUFFER_PRESETS;
  return presets.includes(current) ? [...presets] : [...presets, current].sort((a, b) => a - b);
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
  defaultBuffers,
  eventTypes,
}: Readonly<AppointmentFormProps>) {
  const isEdit = !!appointment;
  const router = useRouter();
  const conflictCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { dbCalendars } = useCalendarVisibilityOptional();

  const [title, setTitle] = useState(appointment?.title || '');
  const [description, setDescription] = useState(appointment?.description || '');
  const [appointmentType, setAppointmentType] = useState<AppointmentType>(
    appointment?.appointmentType || 'MEETING'
  );
  const [startTime, setStartTime] = useState(() => {
    if (appointment?.startTime) return toLocalDateTimeString(appointment.startTime);
    if (defaultStartTime) return toLocalDateTimeString(defaultStartTime);
    return '';
  });
  const [endTime, setEndTime] = useState(() => {
    if (appointment?.endTime) return toLocalDateTimeString(appointment.endTime);
    if (defaultEndTime) return toLocalDateTimeString(defaultEndTime);
    return '';
  });
  const [location, setLocation] = useState(appointment?.location || '');
  const { timezone: userTimezone } = useTimezoneContext();
  const [eventTimezone, setEventTimezone] = useState(
    (appointment as { timezone?: string } | undefined)?.timezone || userTimezone || 'Europe/London'
  );
  const [attendeeIds] = useState<string[]>(appointment?.attendees?.map((a) => a.userId) || []);
  const [linkedCaseIds] = useState<string[]>(appointment?.linkedCases?.map((c) => c.caseId) || []);
  const [bufferMinutesBefore, setBufferMinutesBefore] = useState(
    appointment?.bufferMinutesBefore ?? defaultBuffers?.before ?? 0
  );
  const [bufferMinutesAfter, setBufferMinutesAfter] = useState(
    appointment?.bufferMinutesAfter ?? defaultBuffers?.after ?? 0
  );
  const [recurrence, setRecurrence] = useState<RecurrencePattern | null>(
    appointment?.recurrence ?? null
  );
  const [reminderMinutes, setReminderMinutes] = useState(appointment?.reminderMinutes ?? 60);
  const [forceOverrideConflicts, setForceOverrideConflicts] = useState(false);
  const [calendarId, setCalendarId] = useState(appointment?.calendarId || '');
  const [eventTypeId, setEventTypeId] = useState('');
  // Once the user edits the end time, the event type's duration no longer drives it.
  const [endTouched, setEndTouched] = useState(false);
  const selectedEventType = eventTypes?.find((t) => t.id === eventTypeId);
  const showEventTypePicker = !isEdit && (eventTypes?.length ?? 0) > 0;

  const chooseEventType = (id: string) => {
    setEventTypeId(id);
    const chosen = eventTypes?.find((t) => t.id === id);
    if (!chosen) return; // clearing the choice keeps the values already filled
    setAppointmentType(chosen.appointmentType);
    if (!location.trim() && chosen.locationDetails) setLocation(chosen.locationDetails);
    if (!description.trim() && chosen.description) setDescription(chosen.description);
    if (startTime && !endTouched) setEndTime(addMinutesLocal(startTime, chosen.durationMinutes));
  };

  const changeStartTime = (value: string) => {
    setStartTime(value);
    if (value && selectedEventType && !endTouched) {
      setEndTime(addMinutesLocal(value, selectedEventType.durationMinutes));
    }
  };

  const [errors, setErrors] = useState<Record<string, string>>({});
  // A rejection from the server (e.g. outside firm hours, a closure, the daily limit).
  const [submitError, setSubmitError] = useState<string | null>(null);

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
    // Firm hours, closures and the daily limit are checked by the server in the
    // firm timezone (PG-202); a rejection is shown in the submit error below.
    if (!appointmentType) newErrors.appointmentType = 'Type is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        timezone: eventTimezone || undefined,
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
        eventTypeId: selectedEventType?.id,
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error && error.message ? error.message : GENERIC_SUBMIT_ERROR
      );
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      onChange={() => setSubmitError(null)}
      className="space-y-4"
      noValidate
    >
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

      {/* Event type (PG-203): a template for new appointments */}
      {showEventTypePicker && (
        <div>
          <label htmlFor="appt-event-type" className="block text-sm font-medium text-gray-700 mb-1">
            Event type
          </label>
          <select
            id="appt-event-type"
            value={eventTypeId}
            onChange={(e) => chooseEventType(e.target.value)}
            disabled={isSubmitting}
            aria-describedby="appt-event-type-help"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="">None</option>
            {eventTypes?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.durationMinutes} min)
              </option>
            ))}
          </select>
          <p id="appt-event-type-help" className="text-xs text-gray-500 mt-1">
            Sets the type and end time, and fills an empty location and description.
          </p>
        </div>
      )}

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
            onChange={(e) => changeStartTime(e.target.value)}
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
            onChange={(e) => {
              setEndTime(e.target.value);
              setEndTouched(true);
            }}
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

      {/* Timezone */}
      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-1">Event Timezone</legend>
        <TimezoneSelector
          value={eventTimezone}
          onChange={setEventTimezone}
          disabled={isSubmitting}
          describedBy={TIMEZONE_HELP_ID}
        />
        <p id={TIMEZONE_HELP_ID} className="text-xs text-gray-500 mt-1">
          Firm hours are checked in the firm timezone, set in Availability.
        </p>
      </fieldset>

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
            onChange={(e) => setBufferMinutesBefore(Number.parseInt(e.target.value, 10))}
            disabled={isSubmitting}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            {bufferOptions(bufferMinutesBefore).map((v) => (
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
            onChange={(e) => setBufferMinutesAfter(Number.parseInt(e.target.value, 10))}
            disabled={isSubmitting}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            {bufferOptions(bufferMinutesAfter).map((v) => (
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
          onChange={(e) => setReminderMinutes(Number.parseInt(e.target.value, 10))}
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
          onViewConflict={(appointmentId) => router.push(`/appointments/${appointmentId}`)}
          onOverride={() => setForceOverrideConflicts(!forceOverrideConflicts)}
        />
      )}

      {submitError && (
        <div
          id={SUBMIT_ERROR_ID}
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
        >
          {submitError}
        </div>
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
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
