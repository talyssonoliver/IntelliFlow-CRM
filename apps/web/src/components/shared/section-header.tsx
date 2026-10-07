/**
 * SectionHeader — icon tile + title + description, with an optional action
 * slot aligned to the title row (module-settings playbook §1).
 *
 * Hoisted from the Account Settings page so Account Tiers (PG-196) and Account
 * Settings share one implementation.
 */
import type { ReactNode } from 'react';

export interface SectionHeaderProps {
  icon: string;
  iconBg: string;
  iconFg: string;
  title: string;
  description: string;
  /** Right-aligned control on the title row (e.g. a "New Tier" button). */
  action?: ReactNode;
  /** Heading id, for `aria-labelledby` on the surrounding section. */
  titleId?: string;
}

export function SectionHeader({
  icon,
  iconBg,
  iconFg,
  title,
  description,
  action,
  titleId,
}: Readonly<SectionHeaderProps>) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <span className={`material-symbols-outlined text-[20px] ${iconFg}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <h3 id={titleId} className="text-base font-semibold text-foreground">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
