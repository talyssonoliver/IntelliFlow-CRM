/**
 * Account tier colour classes (PG-196).
 *
 * A tenant picks a tier colour from the 18-token palette shared with account
 * tags (`ACCOUNT_TIER_COLOR_TOKENS`). Every class string is written out in full
 * so Tailwind's scanner keeps it in the build.
 */
import { ACCOUNT_TIER_COLOR_TOKENS, type AccountTierColorToken } from '@intelliflow/validators';

export interface TierColorClasses {
  /** Badge background + text. */
  badge: string;
  /** Small status dot (list revenue cell, hierarchy tree, colour swatch). */
  dot: string;
  /** Initials avatar background + text. */
  avatarBg: string;
  /** Profile card header gradient stops (use with `bg-gradient-to-r`). */
  gradient: string;
  /** Sidebar tier item icon colour. */
  sidebarText: string;
}

export const TIER_COLOR_CLASSES: Record<AccountTierColorToken, TierColorClasses> = {
  slate: {
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400',
    dot: 'bg-slate-500',
    avatarBg: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
    gradient: 'from-slate-100 to-slate-50 dark:from-slate-900/40 dark:to-slate-800',
    sidebarText: 'text-slate-500',
  },
  red: {
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    dot: 'bg-red-500',
    avatarBg: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    gradient: 'from-red-100 to-red-50 dark:from-red-900/40 dark:to-slate-800',
    sidebarText: 'text-red-500',
  },
  orange: {
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    dot: 'bg-orange-500',
    avatarBg: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    gradient: 'from-orange-100 to-orange-50 dark:from-orange-900/40 dark:to-slate-800',
    sidebarText: 'text-orange-500',
  },
  amber: {
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    dot: 'bg-amber-500',
    avatarBg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    gradient: 'from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-slate-800',
    sidebarText: 'text-amber-500',
  },
  yellow: {
    badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    dot: 'bg-yellow-500',
    avatarBg: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    gradient: 'from-yellow-100 to-amber-50 dark:from-yellow-900/40 dark:to-slate-800',
    sidebarText: 'text-yellow-500',
  },
  lime: {
    badge: 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400',
    dot: 'bg-lime-500',
    avatarBg: 'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300',
    gradient: 'from-lime-100 to-lime-50 dark:from-lime-900/40 dark:to-slate-800',
    sidebarText: 'text-lime-500',
  },
  green: {
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    dot: 'bg-green-500',
    avatarBg: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    gradient: 'from-green-100 to-emerald-50 dark:from-green-900/40 dark:to-slate-800',
    sidebarText: 'text-green-500',
  },
  emerald: {
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    avatarBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    gradient: 'from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-slate-800',
    sidebarText: 'text-emerald-500',
  },
  teal: {
    badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
    dot: 'bg-teal-500',
    avatarBg: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    gradient: 'from-teal-100 to-teal-50 dark:from-teal-900/40 dark:to-slate-800',
    sidebarText: 'text-teal-500',
  },
  cyan: {
    badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
    dot: 'bg-cyan-500',
    avatarBg: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
    gradient: 'from-cyan-100 to-cyan-50 dark:from-cyan-900/40 dark:to-slate-800',
    sidebarText: 'text-cyan-500',
  },
  sky: {
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
    dot: 'bg-sky-500',
    avatarBg: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    gradient: 'from-sky-100 to-sky-50 dark:from-sky-900/40 dark:to-slate-800',
    sidebarText: 'text-sky-500',
  },
  blue: {
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    dot: 'bg-blue-500',
    avatarBg: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    gradient: 'from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-slate-800',
    sidebarText: 'text-blue-500',
  },
  indigo: {
    badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    dot: 'bg-indigo-500',
    avatarBg: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    gradient: 'from-indigo-100 to-indigo-50 dark:from-indigo-900/40 dark:to-slate-800',
    sidebarText: 'text-indigo-500',
  },
  violet: {
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    dot: 'bg-violet-500',
    avatarBg: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    gradient: 'from-violet-100 to-violet-50 dark:from-violet-900/40 dark:to-slate-800',
    sidebarText: 'text-violet-500',
  },
  purple: {
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    dot: 'bg-purple-500',
    avatarBg: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    gradient: 'from-purple-100 to-indigo-50 dark:from-purple-900/40 dark:to-slate-800',
    sidebarText: 'text-purple-500',
  },
  fuchsia: {
    badge: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
    dot: 'bg-fuchsia-500',
    avatarBg: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300',
    gradient: 'from-fuchsia-100 to-fuchsia-50 dark:from-fuchsia-900/40 dark:to-slate-800',
    sidebarText: 'text-fuchsia-500',
  },
  pink: {
    badge: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
    dot: 'bg-pink-500',
    avatarBg: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
    gradient: 'from-pink-100 to-pink-50 dark:from-pink-900/40 dark:to-slate-800',
    sidebarText: 'text-pink-500',
  },
  rose: {
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    dot: 'bg-rose-500',
    avatarBg: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    gradient: 'from-rose-100 to-rose-50 dark:from-rose-900/40 dark:to-slate-800',
    sidebarText: 'text-rose-500',
  },
};

/** Colours for accounts without a tier (no revenue and no default tier). */
export const UNKNOWN_TIER_COLORS: TierColorClasses = {
  badge: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  dot: 'bg-slate-400',
  avatarBg: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  gradient: 'from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-800',
  sidebarText: 'text-slate-400',
};

function isTierColorToken(token: string): token is AccountTierColorToken {
  return (ACCOUNT_TIER_COLOR_TOKENS as readonly string[]).includes(token);
}

/** Classes for a stored colour token; tokens outside the palette fall back to slate. */
export function tierColorClasses(token: string): TierColorClasses {
  return isTierColorToken(token) ? TIER_COLOR_CLASSES[token] : TIER_COLOR_CLASSES.slate;
}
