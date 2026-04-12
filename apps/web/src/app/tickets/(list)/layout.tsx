'use client';

import { useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarWithSuspense,
  createTicketsSidebarConfig,
  createTicketsSettingsSidebarConfig,
  isTicketSettingsPage,
  SidebarPortalProvider,
  SidebarPortalTarget,
} from '@/components/sidebar';
import { ModuleGate } from '@/components/ModuleGate';
import { TicketSettingsPanel } from '@/components/tickets/TicketSettingsPanel';
import { TicketSettingsSidebarNav } from '@/components/tickets/TicketSettingsSidebarNav';

export default function TicketsListLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const onSettingsPage = isTicketSettingsPage(pathname);

  const sidebarConfig = useMemo(() => {
    if (onSettingsPage) {
      return createTicketsSettingsSidebarConfig(({ isExpanded }) => (
        <TicketSettingsSidebarNav isExpanded={isExpanded} />
      ));
    }
    return createTicketsSidebarConfig(() => setSettingsOpen((prev) => !prev));
  }, [onSettingsPage]);

  return (
    <ModuleGate moduleId="SUPPORT">
      <SidebarPortalProvider>
        <SidebarProvider>
          <div className="flex min-h-[calc(100vh-4rem)]">
            <SidebarWithSuspense config={sidebarConfig} />

            {/* Complementary settings panel — slides in next to the sidebar */}
            {!onSettingsPage && (
              <TicketSettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
            )}

            {/* Portal target for page-injected sidebar content */}
            <SidebarPortalTarget />

            {/* Main Content */}
            <SidebarInset>
              <main
                className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background relative"
                id="main-content"
              >
                {/* Mobile header with sidebar trigger */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border lg:hidden">
                  <SidebarTrigger />
                  <span className="text-sm font-medium text-foreground">Tickets</span>
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4">
                  <div className="mx-auto flex flex-col gap-6">{children}</div>
                </div>
              </main>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </SidebarPortalProvider>
    </ModuleGate>
  );
}
