'use client';

/**
 * One dialog for every action an admin takes on a data request (PG-203 DSAR, spec Addendum A).
 *
 * The server owns every rule (deadlines, the second-admin rule for staff-logged erasure, the
 * no-hold confirmation, the marketing stop); this dialog collects what each action needs and
 * shows the server's answer inside the dialog, so a refusal is never lost to a toast.
 */
import { useEffect, useState } from 'react';
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
  Textarea,
} from '@intelliflow/ui';
import type {
  DsarErasureResultDto,
  DsarExportDto,
  DsarRequestDto,
} from '@intelliflow/validators/dsar';

export type RequestAction =
  | 'complete'
  | 'completeAccess'
  | 'extend'
  | 'reject'
  | 'cancelErasure'
  | 'revokeExport';

export interface ActionInput {
  note?: string;
  reason?: string;
  months?: 1 | 2;
  noHoldConfirmed?: true;
  marketingStoppedConfirmed?: true;
  marketingStopMethod?: string;
  withheld?: Array<{ category: WithheldCategory; count: number; reason: string }>;
}

export type WithheldCategory = DsarExportDto['withheld'][number]['category'];
type WithheldRows = Partial<Record<WithheldCategory, { count: string; reason: string }>>;

export const WITHHELD_LABELS: Record<WithheldCategory, string> = {
  NOTES: 'Staff notes',
  ACTIVITY_TEXT: 'Contact history text',
  TICKET_SUBJECTS: 'Ticket subjects',
  MESSAGE_BODIES: 'Email and chat messages',
  DOCUMENTS: 'Documents',
  DESCRIPTIONS: 'Deal and task descriptions',
  AI_TEXT: 'AI-written text',
  STAFF_TEXT: 'Staff tags, qualification notes and booking answers',
  OTHER_RECORDS: 'Calendar events, notifications and experiment records',
  EXCESS_ROWS: 'Records beyond the automatic file limit',
};

export const CHECKLIST_LABELS: Record<string, string> = {
  emailRecords: 'Email records',
  tickets: 'Support tickets',
  chats: 'Chats',
  feedbackSurveys: 'Feedback surveys',
  notifications: 'Notifications',
  autoResponseDrafts: 'AI reply drafts',
  contactReplyDrafts: 'Contact reply drafts',
  calendarEvents: 'Calendar events',
  experimentAssignments: 'Experiment assignments',
  storedLeadFiles: 'Stored files',
  deals: 'Deals',
  tasks: 'Tasks',
};

// Minimum lengths the server enforces (packages/validators/src/dsar.ts): reasons are 10
// characters, the marketing stop method is DSAR_LIMITS.marketingStopMethodMin (10).
const REASON_MIN = 10;
const STOP_METHOD_MIN = 10;

type ProblemField = 'text' | 'stop' | 'confirm' | 'withheld';

interface Problem {
  field: ProblemField;
  message: string;
  /** The exact control to focus, when the field is one of several (a withheld category). */
  targetId?: string;
}

const FIELD_IDS: Record<ProblemField, string> = {
  text: 'request-action-text',
  stop: 'request-action-stop',
  confirm: 'request-action-confirm',
  withheld: 'request-action-withheld',
};

const ERROR_ID = 'request-action-error';

/** The free-text field each action asks for (null: none), and what happens to the text. */
const TEXT_FIELD: Record<RequestAction, { label: string; hint: string; min: number } | null> = {
  complete: {
    label: 'Note for the record',
    hint: 'Kept on the request; not sent to the person.',
    min: 1,
  },
  completeAccess: {
    label: 'Note for the record',
    hint: 'Kept on the request; not sent to the person.',
    min: 1,
  },
  extend: { label: 'Reason', hint: 'Sent to the person with the new date.', min: REASON_MIN },
  reject: {
    label: 'Reason',
    hint: 'Sent to the person, with their right to complain to the ICO.',
    min: REASON_MIN,
  },
  cancelErasure: { label: 'Reason', hint: 'Sent to the person.', min: REASON_MIN },
  revokeExport: null,
};

const TITLES: Record<RequestAction, string> = {
  complete: 'Complete request',
  completeAccess: 'Complete access request',
  extend: 'Extend the deadline',
  reject: 'Refuse request',
  cancelErasure: 'Cancel erasure',
  revokeExport: 'Revoke download link',
};

const DESTRUCTIVE: ReadonlySet<RequestAction> = new Set(['reject', 'revokeExport']);

export interface RequestActionDialogProps {
  action: RequestAction | null;
  request: DsarRequestDto | null;
  /** Counts for an erasure, loaded when the complete dialog opens for one. */
  erasurePreview?: DsarErasureResultDto | null;
  pending: boolean;
  error: string | null;
  onSubmit: (input: ActionInput) => void;
  onClose: () => void;
  /** Lets the page decide where focus goes when the dialog closes. */
  onCloseAutoFocus?: (event: Event) => void;
}

/** The first thing the admin must fix before the action can be sent, or null. */
function actionProblem(input: {
  action: RequestAction;
  text: string;
  isErasure: boolean;
  isMarketing: boolean;
  confirmed: boolean;
  stopMethod: string;
  withheld: WithheldRows;
}): Problem | null {
  const field = TEXT_FIELD[input.action];
  if (field && input.text.trim().length < field.min) {
    return {
      field: 'text',
      message:
        field.min === 1 ? 'Add a note.' : `Give a reason of at least ${field.min} characters.`,
    };
  }
  if (input.isErasure && !input.confirmed) {
    return { field: 'confirm', message: 'Confirm that no legal hold or retention duty applies.' };
  }
  if (input.isMarketing && input.stopMethod.trim().length < STOP_METHOD_MIN) {
    return {
      field: 'stop',
      message: `Say how marketing was stopped (at least ${STOP_METHOD_MIN} characters).`,
    };
  }
  if (input.isMarketing && !input.confirmed) {
    return { field: 'confirm', message: 'Confirm that marketing to this person has stopped.' };
  }
  if (input.action === 'completeAccess') {
    // Every count needs the admin's own reason: it is emailed to the person (codex).
    const missing = (
      Object.entries(input.withheld) as Array<[WithheldCategory, { count: string; reason: string }]>
    ).find(([, row]) => Number(row.count) > 0 && row.reason.trim() === '');
    if (missing) {
      return {
        field: 'withheld',
        targetId: `withheld-reason-${missing[0]}`,
        message: 'Give a reason for each category you withhold.',
      };
    }
  }
  return null;
}

function CountList({
  counts,
  labels,
}: Readonly<{ counts: Record<string, number>; labels?: Record<string, string> }>) {
  const entries = Object.entries(counts).filter(([, n]) => n > 0);
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">None.</p>;
  return (
    <ul className="list-disc pl-5 text-sm text-foreground">
      {entries.map(([key, n]) => (
        <li key={key}>{`${labels?.[key] ?? key}: ${n}`}</li>
      ))}
    </ul>
  );
}

export function RequestActionDialog({
  action,
  request,
  erasurePreview,
  pending,
  error,
  onSubmit,
  onClose,
  onCloseAutoFocus,
}: Readonly<RequestActionDialogProps>) {
  const [text, setText] = useState('');
  const [months, setMonths] = useState<1 | 2>(1);
  const [confirmed, setConfirmed] = useState(false);
  const [stopMethod, setStopMethod] = useState('');
  const [withheld, setWithheld] = useState<WithheldRows>({});
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    // A fresh form each time the dialog opens.
    setText('');
    setMonths(1);
    setConfirmed(false);
    setStopMethod('');
    setWithheld({});
    setProblem(null);
  }, [action, request?.id]);

  // Move focus to the field that needs fixing (WCAG 3.3.1, 2.4.3); a new object per
  // attempt, so pressing the button again with the same problem focuses it again.
  useEffect(() => {
    if (problem) document.getElementById(problem.targetId ?? FIELD_IDS[problem.field])?.focus();
  }, [problem]);

  if (!action || !request) return null;

  const isErasure = action === 'complete' && request.type === 'ERASURE';
  const isMarketing =
    action === 'complete' && request.type === 'OBJECTION' && request.objectionScope === 'MARKETING';
  const field = TEXT_FIELD[action];

  const invalid = (name: ProblemField) => (problem?.field === name ? true : undefined);
  const describedBy = (name: ProblemField, ...ids: string[]) =>
    [...ids, ...(problem?.field === name ? [ERROR_ID] : [])].join(' ') || undefined;

  const submit = () => {
    const found = actionProblem({
      action,
      text,
      isErasure,
      isMarketing,
      confirmed,
      stopMethod,
      withheld,
    });
    setProblem(found);
    if (found) return;
    switch (action) {
      case 'extend':
        onSubmit({ months, reason: text.trim() });
        return;
      case 'reject':
      case 'cancelErasure':
        onSubmit({ reason: text.trim() });
        return;
      case 'revokeExport':
        onSubmit({});
        return;
      case 'completeAccess':
        onSubmit({
          note: text.trim(),
          withheld: (
            Object.entries(withheld) as Array<[WithheldCategory, { count: string; reason: string }]>
          )
            .filter(([, row]) => Number(row.count) > 0)
            .map(([category, row]) => ({
              category,
              count: Number(row.count),
              reason: row.reason.trim(),
            })),
        });
        return;
      case 'complete':
        onSubmit({
          note: text.trim(),
          ...(isErasure ? { noHoldConfirmed: true as const } : {}),
          ...(isMarketing
            ? { marketingStoppedConfirmed: true as const, marketingStopMethod: stopMethod.trim() }
            : {}),
        });
    }
  };

  const shownError = problem?.message ?? error;
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{TITLES[action]}</DialogTitle>
          <DialogDescription>{`${request.subjectEmail}, received ${request.receivedOn}`}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {action === 'revokeExport' && (
            <p className="text-sm text-foreground">
              The download link stops working at once. Use this if it went to the wrong address.
            </p>
          )}

          {action === 'extend' && (
            <div role="radiogroup" aria-labelledby="extend-months-label" className="space-y-1">
              <p id="extend-months-label" className="text-sm font-medium text-foreground">
                Extend by
              </p>
              {([1, 2] as const).map((value) => (
                <label
                  key={value}
                  htmlFor={`extend-${value}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    id={`extend-${value}`}
                    type="radio"
                    name="extend-months"
                    checked={months === value}
                    onChange={() => setMonths(value)}
                  />
                  {value === 1 ? 'One month' : 'Two months'}
                </label>
              ))}
              <p className="text-xs text-muted-foreground">
                Allowed once, before the original deadline, when the request is complex or there are
                many requests.
              </p>
            </div>
          )}

          {isErasure && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">This erases, in one step:</p>
              {erasurePreview ? (
                <CountList counts={erasurePreview.counts} />
              ) : (
                <output className="text-sm text-muted-foreground">Counting records</output>
              )}
              <p className="text-sm font-medium text-foreground">
                Handle these by hand afterwards (not erased automatically):
              </p>
              {erasurePreview && (
                <CountList counts={erasurePreview.checklist} labels={CHECKLIST_LABELS} />
              )}
            </div>
          )}

          {action === 'completeAccess' && (
            <div className="space-y-3">
              <p className="text-sm text-foreground">
                Record what you send separately or withhold (for example, privileged notes). Give a
                count and a reason for every category the export withholds; the request cannot be
                completed until each one is covered.
              </p>
              {(Object.keys(WITHHELD_LABELS) as WithheldCategory[]).map((category) => (
                <div key={category} className="grid grid-cols-[1fr_5rem] gap-2">
                  <Label htmlFor={`withheld-${category}`} className="self-center text-sm">
                    {WITHHELD_LABELS[category]}
                  </Label>
                  <Input
                    id={`withheld-${category}`}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    aria-label={`${WITHHELD_LABELS[category]} withheld`}
                    value={withheld[category]?.count ?? ''}
                    onChange={(e) =>
                      setWithheld((rows) => ({
                        ...rows,
                        [category]: { count: e.target.value, reason: rows[category]?.reason ?? '' },
                      }))
                    }
                  />
                  {Number(withheld[category]?.count) > 0 && (
                    <Input
                      id={`withheld-reason-${category}`}
                      className="col-span-2"
                      aria-label={`Why ${WITHHELD_LABELS[category].toLowerCase()} are withheld`}
                      aria-invalid={
                        problem?.field === 'withheld' && !withheld[category]?.reason.trim()
                          ? true
                          : undefined
                      }
                      aria-describedby={
                        problem?.field === 'withheld' && !withheld[category]?.reason.trim()
                          ? ERROR_ID
                          : undefined
                      }
                      placeholder="Why (for example, legal professional privilege)"
                      maxLength={500}
                      value={withheld[category]?.reason ?? ''}
                      onChange={(e) =>
                        setWithheld((rows) => ({
                          ...rows,
                          [category]: {
                            count: rows[category]?.count ?? '',
                            reason: e.target.value,
                          },
                        }))
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {field && (
            <div className="space-y-1.5">
              <Label htmlFor="request-action-text">{field.label}</Label>
              <p id="request-action-hint" className="text-xs text-muted-foreground">
                {field.hint}
                {field.min > 1 && ` At least ${field.min} characters.`}
              </p>
              <Textarea
                id="request-action-text"
                rows={3}
                maxLength={2000}
                value={text}
                aria-invalid={invalid('text')}
                aria-describedby={describedBy('text', 'request-action-hint')}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          )}

          {isMarketing && (
            <div className="space-y-1.5">
              <Label htmlFor="request-action-stop">How marketing was stopped</Label>
              <p id="request-action-stop-hint" className="text-xs text-muted-foreground">
                {`At least ${STOP_METHOD_MIN} characters`}
              </p>
              <Input
                id="request-action-stop"
                maxLength={500}
                aria-invalid={invalid('stop')}
                aria-describedby={describedBy('stop', 'request-action-stop-hint')}
                placeholder="For example: removed from the newsletter list"
                value={stopMethod}
                onChange={(e) => setStopMethod(e.target.value)}
              />
            </div>
          )}

          {(isErasure || isMarketing) && (
            <div className="flex items-start gap-2">
              <Checkbox
                id="request-action-confirm"
                aria-invalid={invalid('confirm')}
                aria-describedby={describedBy('confirm')}
                checked={confirmed}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
              />
              <Label htmlFor="request-action-confirm" className="text-sm font-normal leading-snug">
                {isErasure
                  ? 'No legal hold or retention duty applies to this data (SRA record-keeping, anti-money-laundering checks, or a possible legal claim).'
                  : 'Marketing to this person has stopped.'}
              </Label>
            </div>
          )}

          {shownError && (
            <p id={ERROR_ID} role="alert" className="text-sm text-red-700 dark:text-red-300">
              {shownError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={DESTRUCTIVE.has(action) || isErasure ? 'destructive' : 'default'}
            onClick={submit}
            disabled={pending}
          >
            {pending ? 'Working…' : TITLES[action]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
