'use client';

/**
 * Create / edit an event type (PG-203, ADR-083).
 *
 * The shared validators own every rule (field limits, https meeting link,
 * in-person address, duplicate slugs and names via the catalogue superRefine);
 * the server stays authoritative and a CONFLICT it returns is shown inline.
 * There is no AI switch: booking leads are always AI-scored (owner Q8/Q9).
 */
import { useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Switch,
  Textarea,
} from '@intelliflow/ui';
import {
  EVENT_LOCATION_TYPES,
  EVENT_TYPE_LIMITS,
  EVENT_TYPE_REQUIRED_FIELDS,
  type EventLocationType,
  type EventTypeRequiredField,
} from '@intelliflow/domain';
import {
  EVENT_TYPE_COLOR_TOKENS,
  createEventTypeSchema,
  findDuplicateEventTypeField,
  type CreateEventTypeInput,
  type EventTypeDto,
} from '@intelliflow/validators';
import { EntitySearchField } from '@/components/tasks/EntitySearchField';
import {
  EVENT_TYPE_COLOR_LABELS,
  eventTypeSwatchClass,
  toEventTypeColorToken,
  type EventTypeColorToken,
} from '@/components/calendar/event-type-colors';
import { APPOINTMENT_TYPE_OPTIONS } from '@/lib/appointments/appointment-utils';

export const LOCATION_LABELS: Record<EventLocationType, string> = {
  VIDEO: 'Video call',
  PHONE: 'Phone call',
  IN_PERSON: 'In person',
  CUSTOM: 'Other',
};

const DETAILS_LABELS: Record<EventLocationType, string> = {
  VIDEO: 'Meeting link',
  PHONE: 'Phone number (optional)',
  IN_PERSON: 'Address',
  CUSTOM: 'Location details',
};

export const REQUIRED_FIELD_LABELS: Record<EventTypeRequiredField, string> = {
  phone: 'Phone',
  company: 'Company',
  notes: 'Notes',
};

const LEAD_SOURCE_OPTIONS = [
  { value: 'BOOKING', label: 'Booking page' },
  { value: 'WEBSITE', label: 'Website' },
] as const;

type LeadSource = (typeof LEAD_SOURCE_OPTIONS)[number]['value'];

interface Draft {
  name: string;
  slug: string;
  slugTouched: boolean;
  description: string;
  durationMinutes: string;
  colorToken: EventTypeColorToken;
  locationType: EventLocationType;
  locationDetails: string;
  appointmentType: string;
  hostUserId: string;
  hostName: string;
  requiredFields: EventTypeRequiredField[];
  leadSource: LeadSource;
  isActive: boolean;
}

export type EventTypeSaveResult = { ok: true } | { ok: false; error?: string };

export interface EventTypeDialogProps {
  open: boolean;
  /** null = create. */
  eventType: EventTypeDto | null;
  /** Stored types, for the duplicate slug / name check. */
  existing: readonly { id: string; name: string; slug: string }[];
  /** The signed-in user: the default host of a new type. */
  defaultHost: { id: string; name: string | null } | null;
  isSaving: boolean;
  onSave: (input: CreateEventTypeInput) => Promise<EventTypeSaveResult>;
  onClose: () => void;
}

/** "Initial Consultation!" → "initial-consultation" (the slug CHECK pattern). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .split('-')
    .filter(Boolean)
    .join('-')
    .slice(0, EVENT_TYPE_LIMITS.slugMax);
}

function draftFrom(type: EventTypeDto | null, host: EventTypeDialogProps['defaultHost']): Draft {
  if (!type) {
    return {
      name: '',
      slug: '',
      slugTouched: false,
      description: '',
      durationMinutes: '30',
      colorToken: 'blue',
      locationType: 'VIDEO',
      locationDetails: '',
      appointmentType: 'MEETING',
      hostUserId: host?.id ?? '',
      hostName: host?.name ?? '',
      requiredFields: [],
      leadSource: 'BOOKING',
      isActive: true,
    };
  }
  return {
    name: type.name,
    slug: type.slug,
    slugTouched: true,
    description: type.description ?? '',
    durationMinutes: String(type.durationMinutes),
    colorToken: toEventTypeColorToken(type.colorToken),
    locationType: type.locationType,
    locationDetails: type.locationDetails ?? '',
    appointmentType: type.appointmentType,
    hostUserId: type.hostUserId,
    hostName: type.hostName ?? '',
    requiredFields: [...type.requiredFields],
    leadSource: type.leadSource,
    isActive: type.isActive,
  };
}

function toInput(draft: Draft): Record<string, unknown> {
  return {
    name: draft.name,
    slug: draft.slug,
    description: draft.description,
    durationMinutes: Number(draft.durationMinutes),
    colorToken: draft.colorToken,
    locationType: draft.locationType,
    locationDetails: draft.locationDetails,
    appointmentType: draft.appointmentType,
    hostUserId: draft.hostUserId,
    // Field order follows the checkbox order so equal choices save equally.
    requiredFields: EVENT_TYPE_REQUIRED_FIELDS.filter((f) => draft.requiredFields.includes(f)),
    leadSource: draft.leadSource,
    isActive: draft.isActive,
  };
}

type FieldErrors = Partial<
  Record<'name' | 'slug' | 'durationMinutes' | 'locationDetails' | 'hostUserId', string>
>;

/** Where focus goes for each field error, in form order (WCAG 2.4.3 / 3.3.1). */
const ERROR_FOCUS_TARGETS: Array<[keyof FieldErrors, string]> = [
  ['name', '#event-type-name'],
  ['slug', '#event-type-slug'],
  ['durationMinutes', '#event-type-duration'],
  ['locationDetails', '#event-type-location-details'],
  ['hostUserId', '#event-type-host-group input'],
];

const FIELD_ERROR_KEYS = new Set<string>([
  'name',
  'slug',
  'durationMinutes',
  'locationDetails',
  'hostUserId',
]);

/**
 * Schema issues (first per field) plus the duplicate name / slug check. `data` is set
 * only when the draft is valid and clashes with no other stored type.
 */
export function validateDraft(
  draft: Draft,
  existing: EventTypeDialogProps['existing'],
  eventTypeId: string | undefined
): { data: CreateEventTypeInput | null; errors: FieldErrors } {
  const parsed = createEventTypeSchema.safeParse(toInput(draft));
  const errors: FieldErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]) as keyof FieldErrors;
      if (FIELD_ERROR_KEYS.has(key) && !errors[key]) {
        errors[key] = key === 'hostUserId' ? 'Choose a host.' : issue.message;
      }
    }
    return { data: null, errors };
  }
  const clash = findDuplicateEventTypeField(existing, parsed.data, eventTypeId);
  if (!clash) return { data: parsed.data, errors };
  errors[clash.field] =
    clash.field === 'slug'
      ? `That booking slug is already used by “${clash.clashWith}”.`
      : `An event type named “${clash.clashWith}” already exists.`;
  return { data: null, errors };
}

const FIELD_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function ErrorText({ id, message }: Readonly<{ id: string; message?: string }>) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs text-red-700 dark:text-red-300">
      {message}
    </p>
  );
}

export function EventTypeDialog({
  open,
  eventType,
  existing,
  defaultHost,
  isSaving,
  onSave,
  onClose,
}: Readonly<EventTypeDialogProps>) {
  const [draft, setDraft] = useState(() => draftFrom(eventType, defaultHost));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === 'name' && !current.slugTouched) next.slug = slugify(String(value));
      return next;
    });

  const toggleRequired = (field: EventTypeRequiredField, checked: boolean) =>
    set(
      'requiredFields',
      checked ? [...draft.requiredFields, field] : draft.requiredFields.filter((f) => f !== field)
    );

  const save = async () => {
    setServerError(null);
    const { data, errors: next } = validateDraft(draft, existing, eventType?.id);
    setErrors(next);
    if (!data) {
      const target = ERROR_FOCUS_TARGETS.find(([field]) => next[field])?.[1];
      const element = target ? document.querySelector<HTMLElement>(target) : null;
      (element ?? nameRef.current)?.focus();
      return;
    }
    const result = await onSave(data);
    if (!result.ok) {
      if (result.error) setServerError(result.error);
      return;
    }
    onClose();
  };

  const describe = (field: keyof FieldErrors) =>
    errors[field] ? `event-type-${field}-error` : undefined;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{eventType ? `Edit ${eventType.name}` : 'New Event Type'}</DialogTitle>
          <DialogDescription>
            A meeting template for the New Appointment form and your public booking page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {serverError && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {serverError}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="event-type-name">Name</Label>
              <Input
                id="event-type-name"
                ref={nameRef}
                value={draft.name}
                maxLength={EVENT_TYPE_LIMITS.nameMax}
                onChange={(e) => set('name', e.target.value)}
                aria-required="true"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={describe('name')}
              />
              <ErrorText id="event-type-name-error" message={errors.name} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-type-slug">Booking slug</Label>
              <Input
                id="event-type-slug"
                value={draft.slug}
                maxLength={EVENT_TYPE_LIMITS.slugMax}
                onChange={(e) => {
                  set('slug', e.target.value);
                  set('slugTouched', true);
                }}
                aria-required="true"
                aria-invalid={errors.slug ? true : undefined}
                aria-describedby={['event-type-slug-help', describe('slug')]
                  .filter(Boolean)
                  .join(' ')}
                className="font-mono"
              />
              <p id="event-type-slug-help" className="text-xs text-muted-foreground">
                The last part of the booking link. Lowercase letters, numbers and hyphens.
              </p>
              <ErrorText id="event-type-slug-error" message={errors.slug} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="event-type-duration">Duration (minutes)</Label>
              <Input
                id="event-type-duration"
                type="number"
                inputMode="numeric"
                min={EVENT_TYPE_LIMITS.minDurationMinutes}
                max={EVENT_TYPE_LIMITS.maxDurationMinutes}
                value={draft.durationMinutes}
                onChange={(e) => set('durationMinutes', e.target.value)}
                aria-invalid={errors.durationMinutes ? true : undefined}
                aria-describedby={describe('durationMinutes')}
              />
              <ErrorText id="event-type-durationMinutes-error" message={errors.durationMinutes} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-type-appointment-type">Appointment type</Label>
              <select
                id="event-type-appointment-type"
                className={FIELD_CLASS}
                value={draft.appointmentType}
                onChange={(e) => set('appointmentType', e.target.value)}
              >
                {APPOINTMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="event-type-location">Location</Label>
              <select
                id="event-type-location"
                className={FIELD_CLASS}
                value={draft.locationType}
                onChange={(e) => set('locationType', e.target.value as EventLocationType)}
              >
                {EVENT_LOCATION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {LOCATION_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-type-location-details">
                {DETAILS_LABELS[draft.locationType]}
              </Label>
              <Input
                id="event-type-location-details"
                value={draft.locationDetails}
                maxLength={EVENT_TYPE_LIMITS.locationDetailsMax}
                onChange={(e) => set('locationDetails', e.target.value)}
                aria-invalid={errors.locationDetails ? true : undefined}
                aria-describedby={describe('locationDetails')}
                aria-required={draft.locationType === 'IN_PERSON' ? 'true' : undefined}
              />
              <ErrorText id="event-type-locationDetails-error" message={errors.locationDetails} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event-type-description">Default description</Label>
            <Textarea
              id="event-type-description"
              value={draft.description}
              maxLength={EVENT_TYPE_LIMITS.descriptionMax}
              rows={3}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          <fieldset
            id="event-type-host-group"
            aria-describedby={
              errors.hostUserId
                ? 'event-type-host-help event-type-hostUserId-error'
                : 'event-type-host-help'
            }
            className="space-y-1.5"
          >
            <legend id="event-type-host-label" className="text-sm font-medium text-foreground">
              Host
            </legend>
            <p id="event-type-host-help" className="text-xs text-muted-foreground">
              Public bookings are scheduled with this person.
            </p>
            <EntitySearchField
              entityType="user"
              value={draft.hostUserId}
              valueName={draft.hostName}
              onChange={(id, name) => {
                set('hostUserId', id);
                set('hostName', name);
              }}
            />
            <ErrorText id="event-type-hostUserId-error" message={errors.hostUserId} />
          </fieldset>

          <fieldset className="space-y-2">
            <legend id="event-type-colour-legend" className="text-sm font-medium text-foreground">
              Colour
            </legend>
            <RadioGroup
              aria-labelledby="event-type-colour-legend"
              value={draft.colorToken}
              onValueChange={(value) => set('colorToken', toEventTypeColorToken(value))}
              className="grid grid-cols-2 sm:grid-cols-4 gap-2"
            >
              {EVENT_TYPE_COLOR_TOKENS.map((token) => (
                <label
                  key={token}
                  htmlFor={`event-type-color-${token}`}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 has-[[data-state=checked]]:ring-2 has-[[data-state=checked]]:ring-primary"
                >
                  <RadioGroupItem id={`event-type-color-${token}`} value={token} />
                  <span
                    className={`inline-block h-4 w-4 rounded-full ${eventTypeSwatchClass(token)}`}
                    aria-hidden="true"
                  />
                  <span className="text-sm">{EVENT_TYPE_COLOR_LABELS[token]}</span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">Ask bookers for</legend>
            <p className="text-xs text-muted-foreground">Name and email are always required.</p>
            <div className="flex flex-wrap gap-4">
              {EVENT_TYPE_REQUIRED_FIELDS.map((field) => (
                <div key={field} className="flex min-h-6 items-center gap-2">
                  <Checkbox
                    id={`event-type-required-${field}`}
                    checked={draft.requiredFields.includes(field)}
                    onCheckedChange={(checked) => toggleRequired(field, checked === true)}
                  />
                  <Label htmlFor={`event-type-required-${field}`}>
                    {REQUIRED_FIELD_LABELS[field]}
                  </Label>
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend id="event-type-source-legend" className="text-sm font-medium text-foreground">
              Lead source for new bookers
            </legend>
            <RadioGroup
              aria-labelledby="event-type-source-legend"
              value={draft.leadSource}
              onValueChange={(value) => set('leadSource', value as LeadSource)}
              className="flex flex-wrap gap-4"
            >
              {LEAD_SOURCE_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex min-h-6 items-center gap-2">
                  <RadioGroupItem id={`event-type-source-${opt.value}`} value={opt.value} />
                  <Label htmlFor={`event-type-source-${opt.value}`}>{opt.label}</Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>

          <div className="flex items-center gap-3">
            <Switch
              id="event-type-active"
              checked={draft.isActive}
              onCheckedChange={(checked) => set('isActive', checked)}
              aria-describedby="event-type-active-help"
            />
            <Label htmlFor="event-type-active">Active</Label>
            <span id="event-type-active-help" className="text-xs text-muted-foreground">
              Inactive types are hidden from the appointment form and the booking page.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
