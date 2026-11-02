'use client';

/**
 * Public data request form (PG-203 DSAR, owner rulings Q16/Q17; spec Addendum A).
 *
 * The person chooses what they want, gives the email the firm knows them by and confirms the
 * request is about their own data. The answer is always the same "check your email" message,
 * whether or not the firm holds anything for that address; the request starts only when the
 * person uses the link in that email. Nothing typed here is ever put in an email.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, Checkbox, Input, Label, Textarea } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import {
  DSAR_TYPE_COPY,
  DsarNotice,
  DsarPage,
  FieldError,
  errorCode,
  type DsarRequestType,
} from '../dsar-shared';

const TYPES = Object.keys(DSAR_TYPE_COPY) as DsarRequestType[];
const DETAILS_MAX = 2000;
const GENERIC_ERROR = 'Something went wrong. Please try again.';

type Scope = 'MARKETING' | 'OTHER';

interface Draft {
  type: DsarRequestType | '';
  email: string;
  details: string;
  objectionScope: Scope | '';
  consent: boolean;
}

interface Errors {
  type?: string;
  email?: string;
  objectionScope?: string;
  consent?: string;
  form?: string;
}

/** A light shape check (the server validates properly): one "@", a dot in the domain. */
export function looksLikeEmail(value: string): boolean {
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@') || value.includes(' ')) return false;
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  return dot > 0 && dot < domain.length - 1;
}

export function validateRequest(draft: Draft): Errors {
  const errors: Errors = {};
  if (!draft.type) errors.type = 'Choose what you would like the firm to do.';
  if (!looksLikeEmail(draft.email.trim())) errors.email = 'Enter a valid email address.';
  if (draft.type === 'OBJECTION' && !draft.objectionScope) {
    errors.objectionScope = 'Choose what you object to.';
  }
  if (!draft.consent) errors.consent = 'Please confirm to continue.';
  return errors;
}

const FIRST_ERROR: Array<[keyof Errors, string]> = [
  ['type', '#dsar-type-ACCESS'],
  ['email', '#dsar-email'],
  ['objectionScope', '#dsar-scope-MARKETING'],
  ['consent', '#dsar-consent'],
];

/** What to tell the person when the request call fails. */
export function requestErrorMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === 'NOT_FOUND') return 'This page is no longer available.';
  if (code === 'TOO_MANY_REQUESTS') {
    return 'Too many requests from here just now. Please try again later.';
  }
  return GENERIC_ERROR;
}

function Sent({ firmName, message }: Readonly<{ firmName: string; message: string }>) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
    document.title = 'Check your email';
  }, []);
  return (
    <DsarPage>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-semibold text-foreground focus:outline-none"
      >
        Check your email
      </h1>
      <p className="mt-3 text-foreground">{message}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {`The link works for 24 hours. ${firmName} must respond within one month of your confirmation.`}
      </p>
    </DsarPage>
  );
}

export default function DsarRequestContent({ handle }: Readonly<{ handle: string }>) {
  const firmQuery = trpc.privacy.getFirm.useQuery({ handle }, { retry: false });
  const submitMutation = trpc.privacy.submit.useMutation();
  const [draft, setDraft] = useState<Draft>({
    type: '',
    email: '',
    details: '',
    objectionScope: '',
    consent: false,
  });
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  if (firmQuery.isLoading) {
    return (
      <DsarPage>
        <h1 className="sr-only">Make a data request</h1>
        <output>Loading</output>
      </DsarPage>
    );
  }
  const firm = firmQuery.data;
  if (!firm) {
    return (
      <DsarNotice title="This page is not available">
        <p>The link may be out of date. Please contact the firm that shared it with you.</p>
      </DsarNotice>
    );
  }
  if (sentMessage) return <Sent firmName={firm.firmName} message={sentMessage} />;

  const submit = async () => {
    const next = validateRequest(draft);
    setErrors(next);
    const first = FIRST_ERROR.find(([key]) => next[key]);
    if (first) {
      // Move focus to the first problem, in form order (WCAG 2.4.3 / 3.3.1).
      setTimeout(() => document.querySelector<HTMLElement>(first[1])?.focus(), 0);
      return;
    }
    try {
      const result = await submitMutation.mutateAsync({
        handle,
        type: draft.type as DsarRequestType,
        email: draft.email.trim(),
        ...(draft.details.trim() ? { details: draft.details.trim() } : {}),
        ...(draft.type === 'OBJECTION' ? { objectionScope: draft.objectionScope as Scope } : {}),
        consent: true,
        __honeypot: honeypot,
      });
      setSentMessage(result.message);
    } catch (error) {
      setErrors({ form: requestErrorMessage(error) });
    }
  };

  return (
    <DsarPage>
      <p className="text-sm font-medium text-muted-foreground">{firm.firmName}</p>
      <h1 className="mt-1 text-3xl font-semibold text-foreground">Make a data request</h1>
      <p className="mt-3 text-foreground">
        {`Ask ${firm.firmName} to act on the personal data it holds about you. We will email you a link to confirm the request; nothing happens until you use it.`}
      </p>

      <form
        aria-labelledby="dsar-form-title"
        className="mt-8 space-y-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (submitMutation.isPending) return;
          submit().catch(() => setErrors({ form: GENERIC_ERROR }));
        }}
      >
        <h2 id="dsar-form-title" className="sr-only">
          Your request
        </h2>
        <div
          role="radiogroup"
          aria-labelledby="dsar-type-label"
          aria-invalid={errors.type ? true : undefined}
          aria-describedby={errors.type ? 'dsar-type-error' : undefined}
          className="space-y-2"
        >
          <p id="dsar-type-label" className="mb-2 text-lg font-semibold text-foreground">
            What would you like the firm to do?
          </p>
          {TYPES.map((type) => (
            <label
              key={type}
              htmlFor={`dsar-type-${type}`}
              className={`grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-ring ${
                draft.type === type
                  ? 'border-2 border-primary bg-primary/10'
                  : 'border border-border bg-background'
              }`}
            >
              <input
                id={`dsar-type-${type}`}
                type="radio"
                name="dsar-type"
                value={type}
                checked={draft.type === type}
                onChange={() => update('type', type)}
                className="row-span-2 mt-1"
              />
              <span className="font-medium text-foreground">{DSAR_TYPE_COPY[type].label}</span>
              <span className="text-sm text-muted-foreground">{DSAR_TYPE_COPY[type].detail}</span>
            </label>
          ))}
          <FieldError id="dsar-type-error" message={errors.type} />
        </div>

        {draft.type === 'OBJECTION' && (
          <div
            role="radiogroup"
            aria-labelledby="dsar-scope-label"
            aria-invalid={errors.objectionScope ? true : undefined}
            aria-describedby={errors.objectionScope ? 'dsar-scope-error' : undefined}
            className="space-y-2"
          >
            <p id="dsar-scope-label" className="mb-2 font-semibold text-foreground">
              What do you object to?
            </p>
            {(
              [
                ['MARKETING', 'Marketing to me', 'The firm must stop.'],
                [
                  'OTHER',
                  'Another use of my data',
                  'The firm weighs your reasons against its own.',
                ],
              ] as const
            ).map(([value, label, detail]) => (
              <label
                key={value}
                htmlFor={`dsar-scope-${value}`}
                className="grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 rounded-lg border border-border px-3 py-2 focus-within:ring-2 focus-within:ring-ring"
              >
                <input
                  id={`dsar-scope-${value}`}
                  type="radio"
                  name="dsar-scope"
                  value={value}
                  checked={draft.objectionScope === value}
                  onChange={() => update('objectionScope', value)}
                  className="row-span-2 mt-1"
                />
                <span className="font-medium text-foreground">{label}</span>
                <span className="text-sm text-muted-foreground">{detail}</span>
              </label>
            ))}
            <FieldError id="dsar-scope-error" message={errors.objectionScope} />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="dsar-email">Your email address</Label>
          <p id="dsar-email-hint" className="text-xs text-muted-foreground">
            The address the firm knows you by. The confirmation link goes there.
          </p>
          <Input
            id="dsar-email"
            type="email"
            value={draft.email}
            maxLength={320}
            autoComplete="email"
            required
            onChange={(e) => update('email', e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'dsar-email-hint dsar-email-error' : 'dsar-email-hint'}
          />
          <FieldError id="dsar-email-error" message={errors.email} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dsar-details">Anything that helps the firm (optional)</Label>
          <p id="dsar-details-hint" className="text-xs text-muted-foreground">
            For example, what needs correcting. This is never included in an email.
          </p>
          <Textarea
            id="dsar-details"
            value={draft.details}
            maxLength={DETAILS_MAX}
            rows={4}
            onChange={(e) => update('details', e.target.value)}
            aria-describedby="dsar-details-hint"
          />
        </div>

        {/* Honeypot: off-screen, out of the tab order and hidden from assistive tech. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '-10000px',
            width: 1,
            height: 1,
            overflow: 'hidden',
          }}
        >
          <label htmlFor="dsar-website">Leave this field empty</label>
          <input
            id="dsar-website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id="dsar-consent"
            checked={draft.consent}
            onCheckedChange={(checked) => update('consent', checked === true)}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? 'dsar-consent-error' : undefined}
          />
          <Label htmlFor="dsar-consent" className="text-sm font-normal leading-snug">
            {`I confirm this request is about my own personal data. ${firm.firmName} will use my email address only to handle it, as described in its `}
            <a
              href={firm.privacyUrl ?? '/privacy'}
              className="underline underline-offset-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              privacy notice<span className="sr-only"> (opens in a new tab)</span>
            </a>
            {'.'}
          </Label>
        </div>
        <FieldError id="dsar-consent-error" message={errors.consent} />

        {errors.form && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {errors.form}
          </p>
        )}

        <Button type="submit" aria-disabled={submitMutation.isPending || undefined}>
          {submitMutation.isPending ? 'Sending…' : 'Send request'}
        </Button>
      </form>

      <p className="mt-10 text-sm text-muted-foreground">
        If you are not satisfied with how your request is handled, you can complain to the
        Information Commissioner’s Office (ico.org.uk).
      </p>
      <footer className="mt-8 text-xs text-muted-foreground">
        {'Powered by '}
        <Link href="/" className="underline underline-offset-2">
          Aurora
        </Link>
      </footer>
    </DsarPage>
  );
}
