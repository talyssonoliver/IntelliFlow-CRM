'use client';

import { useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import {
  SidebarProvider,
  SidebarInset,
  SidebarWithSuspense,
  createLeadsSidebarConfig,
  createLeadsSettingsSidebarConfig,
  isLeadSettingsPage,
  SectionMobileBar,
} from '@/components/sidebar';
import { LeadSettingsPanel } from '@/components/leads/LeadSettingsPanel';
import { LeadSettingsSidebarNav } from '@/components/leads/LeadSettingsSidebarNav';

export default function LeadsListLayout({
  children,
}: Readonly<{ readonly children: React.ReactNode }>) {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const onSettingsPage = isLeadSettingsPage(pathname);

  const sidebarConfig = useMemo(() => {
    if (onSettingsPage) {
      return createLeadsSettingsSidebarConfig(({ isExpanded }: { isExpanded: boolean }) => (
        <LeadSettingsSidebarNav isExpanded={isExpanded} />
      ));
    }
    return createLeadsSidebarConfig(() => setSettingsOpen((prev) => !prev));
  }, [onSettingsPage]);

  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <SidebarWithSuspense config={sidebarConfig} />

        {/* Panel only needed in list mode */}
        {!onSettingsPage && (
          <LeadSettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
        )}

        <SidebarInset>
          <main
            className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background relative"
            id="main-content"
          >
            <SectionMobileBar title="Leads" />
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4">
              <div className="mx-auto flex flex-col gap-6">{children}</div>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
