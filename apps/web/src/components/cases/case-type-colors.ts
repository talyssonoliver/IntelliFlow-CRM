/**
 * Case type colour swatches (PG-204). Static class strings keyed by the 8-token
 * case colour allowlist (same as PG-190 case tags) so Tailwind keeps them; an
 * unknown stored token falls back to slate (the column is `string` in the API).
 */
import { CASE_TAG_COLOR_TOKENS, type CaseTagColorToken } from '@intelliflow/validators';

// The slate-500 outline keeps every swatch at >= 3:1 against the surface (SC 1.4.11):
// amber, green and teal fills alone fall below that on the light background.
const SWATCH_OUTLINE = 'ring-1 ring-inset ring-slate-500';

export const CASE_TYPE_SWATCH_CLASSES: Record<CaseTagColorToken, string> = {
  slate: `bg-slate-500 ${SWATCH_OUTLINE}`,
  blue: `bg-blue-500 ${SWATCH_OUTLINE}`,
  red: `bg-red-500 ${SWATCH_OUTLINE}`,
  amber: `bg-amber-500 ${SWATCH_OUTLINE}`,
  green: `bg-green-500 ${SWATCH_OUTLINE}`,
  violet: `bg-violet-500 ${SWATCH_OUTLINE}`,
  rose: `bg-rose-500 ${SWATCH_OUTLINE}`,
  teal: `bg-teal-500 ${SWATCH_OUTLINE}`,
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
