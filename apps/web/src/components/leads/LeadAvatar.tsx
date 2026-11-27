import type { Lead } from '@/lib/leads/lead-types';
import { leadDisplayName } from '@/lib/leads/lead-format';
import { getInitials } from '@/components/shared/app-avatar';

export function LeadAvatar({ lead }: Readonly<{ lead: Lead }>) {
  // Same name and initials rule as the lead page's avatar: a company-only lead shows
  // the company's initials, not "?".
  const displayName = leadDisplayName(lead);
  const initials = getInitials(displayName);
  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-amber-200 text-amber-800 border-amber-300',
      'bg-indigo-100 text-indigo-700 border-indigo-200',
      'bg-emerald-100 text-emerald-700 border-emerald-200',
      'bg-rose-100 text-rose-700 border-rose-200',
      'bg-sky-100 text-sky-700 border-sky-200',
    ];
    const hash = name.split('').reduce((acc, char) => acc + (char.codePointAt(0) ?? 0), 0);
    return colors[hash % colors.length];
  };
  return (
    <span
      className={`size-10 rounded-full shrink-0 flex items-center justify-center font-bold text-sm border ${getAvatarColor(
        // Person leads keep their colour; company-only leads no longer all share one.
        `${lead.firstName ?? ''}${lead.lastName ?? ''}` || displayName
      )}`}
      aria-label={`Avatar for ${displayName}`}
    >
      {initials}
    </span>
  );
}
