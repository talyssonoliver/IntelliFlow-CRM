'use client';

import { SidebarTrigger } from './AppSidebar';

/**
 * The phone and tablet bar that opens a section's side navigation (below lg the rail is hidden).
 * Owner 21/11: "The side navigation isn't showing here" on Leads; 17 of the 27 section layouts had
 * no way to reach their rail on a phone, and the 10 that did each copied this markup. Every section
 * layout renders this one component.
 */
export function SectionMobileBar({ title }: Readonly<{ title: string }>) {
  return (
    <div
      className="flex items-center gap-2 border-b border-border px-2 py-1 lg:hidden"
      data-testid="section-mobile-bar"
    >
      <SidebarTrigger
        className="inline-flex size-11 items-center justify-center"
        label={`${title} menu`}
      />
      <span className="text-sm font-medium text-foreground">{title}</span>
    </div>
  );
}
