/**
 * Event type colours (PG-203). Event types use the same 18-token tag palette as
 * contact types (TAG_COLOR_TOKENS, `event_types_colorToken_check`), so the
 * swatch fills, outline and text names are the shared ones — nothing is
 * duplicated here. A stored token is never interpolated into a class name.
 */
import { EVENT_TYPE_COLOR_TOKENS } from '@intelliflow/validators';
import {
  CONTACT_TYPE_COLOR_LABELS,
  contactTypeSwatchClass,
  toContactTypeColorToken,
} from '@/components/contacts/contact-type-colors';

export type EventTypeColorToken = (typeof EVENT_TYPE_COLOR_TOKENS)[number];

/** Human names shown next to every swatch — colour is never the only signal. */
export const EVENT_TYPE_COLOR_LABELS: Record<EventTypeColorToken, string> =
  CONTACT_TYPE_COLOR_LABELS;

/** Narrow a stored token to the allowlist; unknown → slate (playbook §4). */
export function toEventTypeColorToken(token: string): EventTypeColorToken {
  return toContactTypeColorToken(token);
}

export function eventTypeSwatchClass(token: string): string {
  return contactTypeSwatchClass(token);
}
