/**
 * Card section header for the territory page — a local copy of the private
 * SectionHeader in AccountSettingsContent (extraction is a separate refactor).
 */
import type { ReactNode } from 'react';

export interface SectionHeaderProps {
  icon: string;
  iconBg: string;
  iconFg: string;
  title: string;
  description: string;
  /** id for the heading, so a region can be labelled by it. */
  titleId?: string;
  action?: ReactNode;
}

export function SectionHeader({
  icon,
  iconBg,
  iconFg,
  title,
  description,
  titleId,
  action,
}: Readonly<SectionHeaderProps>) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <span className={`material-symbols-outlined text-[20px] ${iconFg}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="text-base font-semibold text-foreground">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
