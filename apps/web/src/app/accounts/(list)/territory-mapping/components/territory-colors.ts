/**
 * Territory colour swatches (PG-197). Static class strings keyed by the shared
 * 18-token allowlist so Tailwind keeps them; an unknown stored token falls
 * back to slate (the column is `string` in the API).
 */
import { ACCOUNT_TAG_COLOR_TOKENS, type AccountTagColorToken } from '@intelliflow/validators';

export const COLOR_SWATCH_CLASSES: Record<AccountTagColorToken, string> = {
  slate: 'bg-slate-500',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  yellow: 'bg-yellow-500',
  lime: 'bg-lime-500',
  green: 'bg-green-500',
  emerald: 'bg-emerald-500',
  teal: 'bg-teal-500',
  cyan: 'bg-cyan-500',
  sky: 'bg-sky-500',
  blue: 'bg-blue-500',
  indigo: 'bg-indigo-500',
  violet: 'bg-violet-500',
  purple: 'bg-purple-500',
  fuchsia: 'bg-fuchsia-500',
  pink: 'bg-pink-500',
  rose: 'bg-rose-500',
};

const COLOR_TOKENS: ReadonlySet<string> = new Set(ACCOUNT_TAG_COLOR_TOKENS);

/** Narrow a stored token to the allowlist; unknown → slate. */
export function toColorToken(token: string): AccountTagColorToken {
  return COLOR_TOKENS.has(token) ? (token as AccountTagColorToken) : 'slate';
}

export function swatchClass(token: string): string {
  return COLOR_SWATCH_CLASSES[toColorToken(token)];
}
