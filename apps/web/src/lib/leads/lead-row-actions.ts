import type { Lead } from '@/lib/leads/lead-types';

/**
 * The actions offered for one lead in the lead list, shared by the desktop table row and
 * the phone card so both show the same choices.
 */
export interface LeadRowActionHandlers {
  onEdit: (lead: Lead) => void;
  onConvert: (lead: Lead) => void;
  onQualify: (lead: Lead) => void;
  onScore: (lead: Lead) => void;
  onToggleStar: (lead: Lead) => void;
  onDelete: (lead: Lead) => void;
}

export interface LeadQuickAction {
  icon: string;
  label: string;
  onClick: () => void;
}

export interface LeadMenuAction {
  id?: string;
  icon: string;
  label: string;
  onClick: () => void;
  separator?: boolean;
  variant?: string;
}

export function emailComposeHref(email: string): string {
  return `/email/compose?to=${encodeURIComponent(email)}`;
}

export function leadQuickActions(lead: Lead): LeadQuickAction[] {
  return [
    {
      icon: 'phone',
      label: 'Call',
      onClick: () => {
        if (lead.phone) window.open(`tel:${lead.phone}`);
      },
    },
    {
      icon: 'mail',
      label: 'Send Email',
      onClick: () => {
        window.location.href = emailComposeHref(lead.email);
      },
    },
  ];
}

export function leadMenuActions(lead: Lead, handlers: LeadRowActionHandlers): LeadMenuAction[] {
  const canQualify = lead.status === 'NEW' || lead.status === 'CONTACTED';
  const canConvert = lead.status === 'QUALIFIED';
  const actions: LeadMenuAction[] = [
    {
      icon: lead.isStarred ? 'star' : 'star_outline',
      label: lead.isStarred ? 'Unstar' : 'Star',
      onClick: () => handlers.onToggleStar(lead),
    },
    { icon: 'edit', label: 'Edit Lead', onClick: () => handlers.onEdit(lead) },
  ];
  if (canQualify) {
    actions.push({
      icon: 'verified',
      label: 'Qualify Lead',
      onClick: () => handlers.onQualify(lead),
    });
  }
  if (canConvert) {
    actions.push({
      icon: 'person_add',
      label: 'Convert to Contact',
      onClick: () => handlers.onConvert(lead),
    });
  }
  actions.push(
    { icon: 'auto_awesome', label: 'Score with AI', onClick: () => handlers.onScore(lead) },
    { id: 'sep-1', icon: '', label: '', onClick: () => {}, separator: true },
    { icon: 'delete', label: 'Delete', variant: 'danger', onClick: () => handlers.onDelete(lead) }
  );
  return actions;
}

/** "Just now", "3 hours ago", "2 days ago", then a short date in the user's time zone. */
export function formatLeadListDate(
  date: Date | string,
  timezone: string = 'Europe/London',
  now: Date = new Date()
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return 'Invalid date';
  const diffMs = now.getTime() - d.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return d.toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  });
}
