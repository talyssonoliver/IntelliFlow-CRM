/**
 * Contact type colours (PG-205). The 18-token swatch fills come from the shared
 * `@/lib/color-tokens` map (PG-197/PG-198); this module only adds the outline,
 * the text names and the badge classes. Classes are looked up from fixed maps
 * — a stored token is never interpolated into a class name.
 */
import { CONTACT_TYPE_COLOR_TOKENS } from '@intelliflow/validators';
import { swatchClass, toColorToken } from '@/lib/color-tokens';

export type ContactTypeColorToken = (typeof CONTACT_TYPE_COLOR_TOKENS)[number];

// The slate-500 outline keeps every swatch at >= 3:1 against the card in both themes
// (SC 1.4.11): light fills such as yellow or lime fall below that on their own.
export const CONTACT_TYPE_SWATCH_OUTLINE = 'ring-1 ring-inset ring-slate-500';

/** Human names shown next to every swatch — colour is never the only signal. */
export const CONTACT_TYPE_COLOR_LABELS: Record<ContactTypeColorToken, string> = {
  slate: 'Slate',
  red: 'Red',
  orange: 'Orange',
  amber: 'Amber',
  yellow: 'Yellow',
  lime: 'Lime',
  green: 'Green',
  emerald: 'Emerald',
  teal: 'Teal',
  cyan: 'Cyan',
  sky: 'Sky',
  blue: 'Blue',
  indigo: 'Indigo',
  violet: 'Violet',
  purple: 'Purple',
  fuchsia: 'Fuchsia',
  pink: 'Pink',
  rose: 'Rose',
};

/** Text badge classes: -900 text on a -200 fill in both themes (>= 4.5:1, SC 1.4.3). */
export const CONTACT_TYPE_BADGE_CLASSES: Record<ContactTypeColorToken, string> = {
  slate: 'bg-slate-200 text-slate-900',
  red: 'bg-red-200 text-red-900',
  orange: 'bg-orange-200 text-orange-900',
  amber: 'bg-amber-200 text-amber-900',
  yellow: 'bg-yellow-200 text-yellow-900',
  lime: 'bg-lime-200 text-lime-900',
  green: 'bg-green-200 text-green-900',
  emerald: 'bg-emerald-200 text-emerald-900',
  teal: 'bg-teal-200 text-teal-900',
  cyan: 'bg-cyan-200 text-cyan-900',
  sky: 'bg-sky-200 text-sky-900',
  blue: 'bg-blue-200 text-blue-900',
  indigo: 'bg-indigo-200 text-indigo-900',
  violet: 'bg-violet-200 text-violet-900',
  purple: 'bg-purple-200 text-purple-900',
  fuchsia: 'bg-fuchsia-200 text-fuchsia-900',
  pink: 'bg-pink-200 text-pink-900',
  rose: 'bg-rose-200 text-rose-900',
};

/** Narrow a stored token to the allowlist; unknown → slate. */
export function toContactTypeColorToken(token: string): ContactTypeColorToken {
  return toColorToken(token);
}

export function contactTypeSwatchClass(token: string): string {
  return `${swatchClass(token)} ${CONTACT_TYPE_SWATCH_OUTLINE}`;
}

export function contactTypeBadgeClass(token: string): string {
  return CONTACT_TYPE_BADGE_CLASSES[toContactTypeColorToken(token)];
}
