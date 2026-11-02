'use client';

/**
 * The firm's public booking link (PG-203, owner rulings Q7, Q10, Q12).
 *
 * A booking handle (never the tenant slug, which embeds an auth id) plus an
 * optional privacy-policy URL. Public booking is on only when a handle is set
 * AND availability has been saved; the card says exactly which is missing.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Input, Label } from '@intelliflow/ui';
import {
  bookingLinkSchema,
  type BookingLinkDto,
  type BookingLinkInput,
} from '@intelliflow/validators';

export type BookingLinkSaveResult = { ok: true } | { ok: false; error?: string };

export interface BookingLinkCardProps {
  link: BookingLinkDto;
  canEdit: boolean;
  isSaving: boolean;
  /** Ids referenced by `aria-describedby` on disabled controls (read-only note). */
  describedBy?: string;
  onSave: (input: BookingLinkInput) => Promise<BookingLinkSaveResult>;
}

/** The page origin, read after mount so server and client render the same markup. */
export function useOrigin(): string {
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}

export function BookingLinkCard({
  link,
  canEdit,
  isSaving,
  describedBy,
  onSave,
}: Readonly<BookingLinkCardProps>) {
  const origin = useOrigin();
  const [handle, setHandle] = useState(link.handle ?? '');
  const [privacyUrl, setPrivacyUrl] = useState(link.privacyUrl ?? '');
  const [errors, setErrors] = useState<{ handle?: string; privacyUrl?: string; server?: string }>(
    {}
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setHandle(link.handle ?? '');
    setPrivacyUrl(link.privacyUrl ?? '');
  }, [link.handle, link.privacyUrl]);

  const isOn = Boolean(link.handle) && link.availabilityConfigured;
  const baseUrl = link.handle ? `${origin}/book/${link.handle}` : '';

  const save = async () => {
    const parsed = bookingLinkSchema.safeParse({
      handle: handle.trim() === '' ? null : handle,
      privacyUrl: privacyUrl.trim() === '' ? null : privacyUrl,
    });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as 'handle' | 'privacyUrl';
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    const result = await onSave(parsed.data);
    if (!result.ok && result.error) setErrors({ server: result.error });
  };

  const copy = async () => {
    await navigator.clipboard.writeText(baseUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div aria-live="polite">
        {isOn && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Booking is on.</p>
            <p className="break-all font-mono text-xs text-muted-foreground">{baseUrl}/…</p>
            <Button type="button" size="sm" variant="outline" onClick={copy}>
              Copy base link
            </Button>
            {copied && <span className="ml-2 text-xs text-muted-foreground">Copied</span>}
          </div>
        )}
        {!link.handle && (
          <p className="text-sm text-muted-foreground">Booking is off: choose a booking handle.</p>
        )}
        {link.handle && !link.availabilityConfigured && (
          <p className="text-sm text-muted-foreground">
            Booking is off: set your availability first.{' '}
            <Link href="/calendar/availability" className="underline underline-offset-2">
              Set availability
            </Link>
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="booking-handle">Booking handle</Label>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground" aria-hidden="true">
            /book/
          </span>
          <Input
            id="booking-handle"
            value={handle}
            maxLength={40}
            disabled={!canEdit || isSaving}
            onChange={(e) => setHandle(e.target.value)}
            aria-invalid={errors.handle ? true : undefined}
            aria-describedby={[
              'booking-handle-help',
              errors.handle ? 'booking-handle-error' : null,
              describedBy ?? null,
            ]
              .filter(Boolean)
              .join(' ')}
            className="font-mono"
          />
        </div>
        <p id="booking-handle-help" className="text-xs text-muted-foreground">
          Your firm&apos;s part of every booking link. Leave empty to turn public booking off.
        </p>
        {errors.handle && (
          <p
            id="booking-handle-error"
            role="alert"
            className="text-xs text-red-700 dark:text-red-300"
          >
            {errors.handle}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="booking-privacy-url">Privacy policy URL (optional)</Label>
        <Input
          id="booking-privacy-url"
          type="url"
          value={privacyUrl}
          maxLength={500}
          disabled={!canEdit || isSaving}
          onChange={(e) => setPrivacyUrl(e.target.value)}
          aria-invalid={errors.privacyUrl ? true : undefined}
          aria-describedby={[
            'booking-privacy-help',
            errors.privacyUrl ? 'booking-privacy-error' : null,
          ]
            .filter(Boolean)
            .join(' ')}
        />
        <p id="booking-privacy-help" className="text-xs text-muted-foreground">
          Shown on the booking form. Without it, bookers see the Aurora privacy notice.
        </p>
        {errors.privacyUrl && (
          <p
            id="booking-privacy-error"
            role="alert"
            className="text-xs text-red-700 dark:text-red-300"
          >
            {errors.privacyUrl}
          </p>
        )}
      </div>

      {errors.server && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {errors.server}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={save}
        disabled={!canEdit || isSaving}
        aria-describedby={describedBy}
      >
        {isSaving ? 'Saving…' : 'Save link'}
      </Button>
    </div>
  );
}
