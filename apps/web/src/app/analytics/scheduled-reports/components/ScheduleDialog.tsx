'use client';

// Create / edit a scheduled report — PG-201.
// Validates with the shared Zod schemas (+ the duplicate-name superRefine) before
// calling the API, shows inline errors (aria-invalid + aria-describedby) and moves
// focus to the first invalid field. The cadence preview is announced politely.

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from '@intelliflow/ui';
import {
  createScheduledReportSchema,
  describeSchedule,
  scheduleCadenceSchema,
  scheduleDeliveryFormatSchema,
  scheduleNameConflictSchema,
  updateScheduledReportSchema,
  type CreateScheduledReportInput,
  type ReportScheduleColorToken,
  type ReportScheduleTagView,
  type ScheduleCadence,
  type ScheduleDeliveryFormat,
  type UpdateScheduledReportInput,
} from '@intelliflow/validators';
import { TimezoneSelector } from '@/components/settings/TimezoneSelector';
import { formatLabel, type ScheduleItem } from './ScheduleList';
import { REPORT_SCHEDULE_COLOR_TOKENS, colorLabel, normalizeColorToken } from './schedule-colors';

export type ScheduleSubmit =
  | { kind: 'create'; input: CreateScheduledReportInput }
  | { kind: 'update'; input: UpdateScheduledReportInput };

export interface ScheduleDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The schedule being edited, or null to create one. */
  readonly schedule: ScheduleItem | null;
  readonly templates: ReadonlyArray<{ id: string; name: string }>;
  readonly tags: ReadonlyArray<ReportScheduleTagView>;
  readonly existingNames: ReadonlyArray<{ id: string; name: string }>;
  readonly isSaving: boolean;
  readonly onSubmit: (submit: ScheduleSubmit) => Promise<void>;
}

interface FormState {
  name: string;
  description: string;
  templateId: string;
  cadence: ScheduleCadence;
  dayOfWeek: string;
  dayOfMonth: string;
  timeOfDay: string;
  cronExpression: string;
  timezone: string;
  recipientsText: string;
  format: ScheduleDeliveryFormat;
  colorToken: ReportScheduleColorToken;
  tags: string[];
  isActive: boolean;
}

type FieldKey =
  | 'name'
  | 'description'
  | 'templateId'
  | 'dayOfWeek'
  | 'dayOfMonth'
  | 'timeOfDay'
  | 'cronExpression'
  | 'timezone'
  | 'recipients'
  | 'tags'
  | 'cadence'
  | 'form';

type FieldErrors = Partial<Record<FieldKey, string>>;

// DOM id of each field. Key order is the visual order: focus goes to the first invalid one.
const FIELD_ID: Record<FieldKey, string> = {
  name: 'schedule-name',
  description: 'schedule-description',
  templateId: 'schedule-template',
  cadence: 'schedule-cadence',
  dayOfWeek: 'schedule-day-of-week',
  dayOfMonth: 'schedule-day-of-month',
  timeOfDay: 'schedule-time',
  cronExpression: 'schedule-cron',
  timezone: 'schedule-timezone',
  recipients: 'schedule-recipients',
  tags: 'schedule-tags-legend',
  form: 'schedule-form-error',
};

const CADENCE_LABELS: Record<ScheduleCadence, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  custom: 'Custom (cron)',
};

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_OF_MONTH = Array.from({ length: 28 }, (_, i) => String(i + 1));

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London';
  } catch {
    return 'Europe/London';
  }
}

function initialState(schedule: ScheduleItem | null): FormState {
  if (!schedule) {
    return {
      name: '',
      description: '',
      templateId: '',
      cadence: 'weekly',
      dayOfWeek: '1',
      dayOfMonth: '1',
      timeOfDay: '09:00',
      cronExpression: '',
      timezone: browserTimezone(),
      recipientsText: '',
      format: 'pdf',
      colorToken: 'slate',
      tags: [],
      isActive: true,
    };
  }
  return {
    name: schedule.name,
    description: schedule.description ?? '',
    templateId: schedule.templateId ?? '',
    cadence: schedule.cadence,
    dayOfWeek: String(schedule.dayOfWeek ?? 1),
    dayOfMonth: String(schedule.dayOfMonth ?? 1),
    timeOfDay: schedule.timeOfDay ?? '09:00',
    cronExpression: schedule.cronExpression ?? '',
    timezone: schedule.timezone,
    recipientsText: schedule.recipients.join('\n'),
    format: schedule.format,
    colorToken: normalizeColorToken(schedule.colorToken),
    tags: schedule.tags,
    isActive: schedule.isActive,
  };
}

export function parseRecipients(text: string): string[] {
  return text
    .split(/[\n,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The cadence-specific part of the payload. */
function cadenceFields(f: FormState) {
  if (f.cadence === 'custom') return { cronExpression: f.cronExpression.trim() };
  const weekly = f.cadence === 'weekly' ? { dayOfWeek: Number(f.dayOfWeek) } : {};
  const monthly =
    f.cadence === 'monthly' || f.cadence === 'quarterly'
      ? { dayOfMonth: Number(f.dayOfMonth) }
      : {};
  return { timeOfDay: f.timeOfDay, ...weekly, ...monthly };
}

function commonFields(f: FormState, original: ScheduleItem | null) {
  const templateChanged = !original || f.templateId !== (original.templateId ?? '');
  return {
    name: f.name,
    cadence: f.cadence,
    ...cadenceFields(f),
    timezone: f.timezone,
    recipients: parseRecipients(f.recipientsText),
    format: f.format,
    colorToken: f.colorToken,
    tags: f.tags,
    isActive: f.isActive,
    // Re-sending an unchanged template would re-run the visibility check, which fails
    // for another user's private template; only a newly chosen template is sent.
    ...(f.templateId && templateChanged ? { templateId: f.templateId } : {}),
  };
}

function isFieldKey(value: string): value is FieldKey {
  return Object.hasOwn(FIELD_ID, value);
}

function toFieldKey(path: ReadonlyArray<PropertyKey>): FieldKey {
  const head = String(path[0] ?? 'form');
  return isFieldKey(head) ? head : 'form';
}

const FRIENDLY_MESSAGES: Partial<Record<FieldKey, string>> = {
  templateId: 'Choose a report template.',
  name: 'Enter a name of up to 100 characters.',
};

function collectErrors(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>
) {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = toFieldKey(issue.path);
    if (errors[key]) continue;
    errors[key] = FRIENDLY_MESSAGES[key] ?? issue.message;
  }
  return errors;
}

function focusFirstInvalid(errors: FieldErrors): void {
  const first = Object.entries(FIELD_ID).find(([key]) => isFieldKey(key) && errors[key]);
  if (first) document.getElementById(first[1])?.focus();
}

function FieldError({ id, message }: Readonly<{ id: string; message?: string }>) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

function Field({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="space-y-1.5">{children}</div>;
}

type SetField = <K extends keyof FormState>(key: K, value: FormState[K]) => void;
type ErrorProps = (key: FieldKey) => {
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
};

/** The cadence-specific inputs: day of week / day of month, then time of day or a custom cron. */
function CadenceFields({
  form,
  set,
  errors,
  errorProps,
}: Readonly<{ form: FormState; set: SetField; errors: FieldErrors; errorProps: ErrorProps }>) {
  const isWeekly = form.cadence === 'weekly';
  const needsDayOfMonth = form.cadence === 'monthly' || form.cadence === 'quarterly';
  const isCustom = form.cadence === 'custom';
  return (
    <>
      {isWeekly && (
        <Field>
          <Label htmlFor="schedule-day-of-week">Day of the week</Label>
          <Select value={form.dayOfWeek} onValueChange={(v) => set('dayOfWeek', v)}>
            <SelectTrigger id="schedule-day-of-week" {...errorProps('dayOfWeek')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS_OF_WEEK.map((day, i) => (
                <SelectItem key={day} value={String(i)}>
                  {day}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id="schedule-day-of-week-error" message={errors.dayOfWeek} />
        </Field>
      )}

      {needsDayOfMonth && (
        <Field>
          <Label htmlFor="schedule-day-of-month">Day of the month</Label>
          <Select value={form.dayOfMonth} onValueChange={(v) => set('dayOfMonth', v)}>
            <SelectTrigger id="schedule-day-of-month" {...errorProps('dayOfMonth')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS_OF_MONTH.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id="schedule-day-of-month-error" message={errors.dayOfMonth} />
        </Field>
      )}

      {isCustom ? (
        <div className="md:col-span-2">
          <Field>
            <Label htmlFor="schedule-cron">Cron expression</Label>
            <Input
              id="schedule-cron"
              value={form.cronExpression}
              maxLength={100}
              onChange={(e) => set('cronExpression', e.target.value)}
              placeholder="0 9 * * 1-5"
              aria-invalid={errors.cronExpression ? true : undefined}
              aria-describedby={
                errors.cronExpression
                  ? 'schedule-cron-hint schedule-cron-error'
                  : 'schedule-cron-hint'
              }
            />
            <p id="schedule-cron-hint" className="text-xs text-muted-foreground">
              Five fields: minute, hour, day of month, month, day of week. At most once an hour.
            </p>
            <FieldError id="schedule-cron-error" message={errors.cronExpression} />
          </Field>
        </div>
      ) : (
        <Field>
          <Label htmlFor="schedule-time">Time of day</Label>
          <Input
            id="schedule-time"
            type="time"
            value={form.timeOfDay}
            onChange={(e) => set('timeOfDay', e.target.value)}
            {...errorProps('timeOfDay')}
          />
          <FieldError id="schedule-time-error" message={errors.timeOfDay} />
        </Field>
      )}
    </>
  );
}

/** Plain-English preview of the cadence currently in the form. */
function previewFor(form: FormState): string {
  return describeSchedule({
    cadence: form.cadence,
    dayOfWeek: Number(form.dayOfWeek),
    dayOfMonth: Number(form.dayOfMonth),
    timeOfDay: form.timeOfDay,
    cronExpression: form.cronExpression.trim() || null,
    timezone: form.timezone,
  });
}

/** A template the caller cannot see (or that no longer exists) still shows as selected. */
function withCurrentTemplate(
  templates: ReadonlyArray<{ id: string; name: string }>,
  templateId: string
): ReadonlyArray<{ id: string; name: string }> {
  if (!templateId || templates.some((t) => t.id === templateId)) return templates;
  return [...templates, { id: templateId, name: 'Current template (not visible to you)' }];
}

export function ScheduleDialog({
  open,
  onOpenChange,
  schedule,
  templates,
  tags,
  existingNames,
  isSaving,
  onSubmit,
}: ScheduleDialogProps) {
  const [form, setForm] = useState<FormState>(() => initialState(schedule));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [focusRequest, setFocusRequest] = useState(0);

  useEffect(() => {
    if (focusRequest > 0) focusFirstInvalid(errors);
  }, [focusRequest, errors]);

  const set: SetField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const errorProps: ErrorProps = (key) => ({
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `${FIELD_ID[key]}-error` : undefined,
  });

  const preview = previewFor(form);
  const templateOptions = withCurrentTemplate(templates, form.templateId);

  /** Validate the form; returns the API payload, or null after showing the errors. */
  function validate(): ScheduleSubmit | null {
    const fields = commonFields(form, schedule);
    const description = form.description.trim();
    const nameCheck = scheduleNameConflictSchema(existingNames, schedule?.id).safeParse(form.name);
    let submit: ScheduleSubmit | null = null;
    let next: FieldErrors = {};
    if (schedule) {
      const parsed = updateScheduledReportSchema.safeParse({
        id: schedule.id,
        ...fields,
        description,
      });
      if (parsed.success) submit = { kind: 'update', input: parsed.data };
      else next = collectErrors(parsed.error.issues);
    } else {
      const parsed = createScheduledReportSchema.safeParse({
        ...fields,
        ...(description ? { description } : {}),
      });
      if (parsed.success) submit = { kind: 'create', input: parsed.data };
      else next = collectErrors(parsed.error.issues);
    }
    if (!nameCheck.success && !next.name) next.name = nameCheck.error.issues[0].message;
    setErrors(next);
    if (submit && nameCheck.success) return submit;
    setFocusRequest((n) => n + 1);
    return null;
  }

  function handleFormSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    const submit = validate();
    if (!submit) return;
    onSubmit(submit).catch((err: unknown) => {
      // The parent toasts API errors; keep the dialog open with the values intact.
      setErrors({ form: err instanceof Error ? err.message : 'The schedule could not be saved.' });
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSaving && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{schedule ? 'Edit Scheduled Report' : 'New Scheduled Report'}</DialogTitle>
          <DialogDescription>
            Choose what to send, when, and to whom. Fields marked * are required. Delivery starts
            once the report runner is enabled.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2"
          onSubmit={handleFormSubmit}
        >
          <div className="md:col-span-2">
            <Field>
              <Label htmlFor="schedule-name">
                Name <span aria-hidden="true">*</span>
              </Label>
              <Input
                id="schedule-name"
                value={form.name}
                maxLength={100}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Weekly pipeline summary"
                aria-required="true"
                {...errorProps('name')}
              />
              <FieldError id="schedule-name-error" message={errors.name} />
            </Field>
          </div>

          <div className="md:col-span-2">
            <Field>
              <Label htmlFor="schedule-description">Description (optional)</Label>
              <Input
                id="schedule-description"
                value={form.description}
                maxLength={500}
                onChange={(e) => set('description', e.target.value)}
                {...errorProps('description')}
              />
              <FieldError id="schedule-description-error" message={errors.description} />
            </Field>
          </div>

          <div className="md:col-span-2">
            <Field>
              <Label id="schedule-template-label" htmlFor="schedule-template">
                Report template <span aria-hidden="true">*</span>
              </Label>
              {templateOptions.length === 0 ? (
                <p
                  id="schedule-template"
                  tabIndex={-1}
                  aria-labelledby="schedule-template-label"
                  aria-describedby={errors.templateId ? 'schedule-template-error' : undefined}
                  className="text-sm text-muted-foreground"
                >
                  No report templates yet.{' '}
                  <Link
                    href="/analytics/report-templates"
                    className="text-blue-700 underline dark:text-blue-300"
                  >
                    Create a report template
                  </Link>{' '}
                  first.
                </p>
              ) : (
                <Select value={form.templateId} onValueChange={(v) => set('templateId', v)}>
                  <SelectTrigger
                    id="schedule-template"
                    aria-required="true"
                    {...errorProps('templateId')}
                  >
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templateOptions.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FieldError id="schedule-template-error" message={errors.templateId} />
            </Field>
          </div>

          <Field>
            <Label htmlFor="schedule-cadence">Cadence</Label>
            <Select
              value={form.cadence}
              onValueChange={(v) => {
                const parsed = scheduleCadenceSchema.safeParse(v);
                if (parsed.success) set('cadence', parsed.data);
              }}
            >
              <SelectTrigger id="schedule-cadence">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scheduleCadenceSchema.options.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CADENCE_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <CadenceFields form={form} set={set} errors={errors} errorProps={errorProps} />

          <div className="md:col-span-2">
            <Field>
              <Label htmlFor="schedule-timezone">Timezone</Label>
              <TimezoneSelector
                id="schedule-timezone"
                value={form.timezone}
                onChange={(tz) => set('timezone', tz)}
                disabled={isSaving}
                invalid={Boolean(errors.timezone)}
                describedBy={errors.timezone ? 'schedule-timezone-error' : undefined}
              />
              <FieldError id="schedule-timezone-error" message={errors.timezone} />
            </Field>
          </div>

          <p
            className="md:col-span-2 rounded-md bg-muted px-3 py-2 text-sm text-foreground"
            aria-live="polite"
            aria-atomic="true"
            data-testid="schedule-preview"
          >
            {preview}
          </p>

          <div className="md:col-span-2">
            <Field>
              <Label htmlFor="schedule-recipients">
                Recipients <span aria-hidden="true">*</span>
              </Label>
              <Textarea
                id="schedule-recipients"
                value={form.recipientsText}
                rows={3}
                onChange={(e) => set('recipientsText', e.target.value)}
                placeholder="lead@example.com"
                aria-required="true"
                aria-invalid={errors.recipients ? true : undefined}
                aria-describedby={
                  errors.recipients
                    ? 'schedule-recipients-hint schedule-recipients-error'
                    : 'schedule-recipients-hint'
                }
              />
              <p id="schedule-recipients-hint" className="text-xs text-muted-foreground">
                One email address per line, or separated by commas. Up to 50.
              </p>
              <FieldError id="schedule-recipients-error" message={errors.recipients} />
            </Field>
          </div>

          <fieldset className="md:col-span-2 space-y-2">
            <legend id="schedule-format-legend" className="text-sm font-medium">
              Delivery format
            </legend>
            <RadioGroup
              aria-labelledby="schedule-format-legend"
              value={form.format}
              onValueChange={(v) => {
                const parsed = scheduleDeliveryFormatSchema.safeParse(v);
                if (parsed.success) set('format', parsed.data);
              }}
              className="flex flex-wrap gap-4"
            >
              {scheduleDeliveryFormatSchema.options.map((f) => (
                <div key={f} className="flex items-center gap-2">
                  <RadioGroupItem id={`schedule-format-${f}`} value={f} />
                  <Label htmlFor={`schedule-format-${f}`} className="font-normal">
                    {formatLabel(f)}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>

          <Field>
            <Label htmlFor="schedule-color">Colour</Label>
            <Select
              value={form.colorToken}
              onValueChange={(v) => set('colorToken', normalizeColorToken(v))}
            >
              <SelectTrigger id="schedule-color">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_SCHEDULE_COLOR_TOKENS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {colorLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="flex items-center gap-3 self-end pb-2">
            <Switch
              id="schedule-active"
              checked={form.isActive}
              onCheckedChange={(checked) => set('isActive', checked)}
            />
            <Label htmlFor="schedule-active">Active</Label>
          </div>

          <fieldset
            className="md:col-span-2 space-y-2"
            aria-describedby={errors.tags ? 'schedule-tags-error' : undefined}
          >
            <legend id="schedule-tags-legend" tabIndex={-1} className="text-sm font-medium">
              Tags
            </legend>
            {tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No tags yet. Create tags in the Tags card.
              </p>
            ) : (
              <div className="flex flex-wrap gap-4">
                {tags.map((tag) => {
                  const id = `schedule-tag-${tag.id}`;
                  return (
                    <div key={tag.id} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={form.tags.includes(tag.name)}
                        onCheckedChange={(checked) =>
                          set(
                            'tags',
                            checked === true
                              ? [...form.tags, tag.name]
                              : form.tags.filter((t) => t !== tag.name)
                          )
                        }
                      />
                      <Label htmlFor={id} className="font-normal">
                        {tag.isActive ? tag.name : `${tag.name} (inactive)`}
                      </Label>
                    </div>
                  );
                })}
              </div>
            )}
            <FieldError id="schedule-tags-error" message={errors.tags} />
          </fieldset>

          {errors.form && (
            <p
              id="schedule-form-error"
              role="alert"
              className="md:col-span-2 text-sm text-red-600 dark:text-red-400"
            >
              {errors.form}
            </p>
          )}

          <DialogFooter className="md:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save Schedule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
