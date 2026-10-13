/**
 * Case type colour swatches (PG-204). Static class strings keyed by the 8-token
 * case colour allowlist (same as PG-190 case tags) so Tailwind keeps them; an
 * unknown stored token falls back to slate (the column is `string` in the API).
 */
import { CASE_TAG_COLOR_TOKENS, type CaseTagColorToken } from '@intelliflow/validators';

export const CASE_TYPE_SWATCH_CLASSES: Record<CaseTagColorToken, string> = {
  slate: 'bg-slate-500',
  blue: 'bg-blue-500',
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  green: 'bg-green-500',
  violet: 'bg-violet-500',
  rose: 'bg-rose-500',
  teal: 'bg-teal-500',
};

/** Human names shown next to every swatch — colour is never the only signal. */
export const CASE_TYPE_COLOR_LABELS: Record<CaseTagColorToken, string> = {
  slate: 'Slate',
  blue: 'Blue',
  red: 'Red',
  amber: 'Amber',
  green: 'Green',
  violet: 'Violet',
  rose: 'Rose',
  teal: 'Teal',
};

/** Narrow a stored token to the allowlist; unknown → slate. */
export function toCaseTypeColorToken(token: string): CaseTagColorToken {
  return CASE_TAG_COLOR_TOKENS.find((known) => known === token) ?? 'slate';
}

export function swatchClass(token: string): string {
  return CASE_TYPE_SWATCH_CLASSES[toCaseTypeColorToken(token)];
}
