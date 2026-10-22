import {
  REPORT_SCHEDULE_COLOR_TOKENS,
  type ReportScheduleColorToken,
} from '@intelliflow/validators';

// Static swatch classes (module-settings-playbook §4): Tailwind's JIT purges
// dynamic names like `bg-${token}-500`, so every swatch is spelled out.
const COLOR_SWATCH_CLASSES: Record<ReportScheduleColorToken, string> = {
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

const PALETTE: ReadonlySet<string> = new Set(REPORT_SCHEDULE_COLOR_TOKENS);

function isColorToken(value: string): value is ReportScheduleColorToken {
  return PALETTE.has(value);
}

/** Narrow a stored token (typed `string`) to the palette; legacy values fall back to slate. */
export function normalizeColorToken(raw: string): ReportScheduleColorToken {
  return isColorToken(raw) ? raw : 'slate';
}

export function swatchClass(token: string): string {
  return COLOR_SWATCH_CLASSES[normalizeColorToken(token)];
}

export function colorLabel(token: string): string {
  const t = normalizeColorToken(token);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export { REPORT_SCHEDULE_COLOR_TOKENS };
