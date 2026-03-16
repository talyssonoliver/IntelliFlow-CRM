'use client';

import { useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarWithSuspense,
  SidebarPortalProvider,
  SidebarPortalTarget,
} from '@/components/sidebar';
import {
  createAppointmentsSidebarConfig,
  createAppointmentsSettingsSidebarConfig,
  isCalendarSettingsPage,
} from '@/components/sidebar/configs/appointments';
import { CalendarVisibilityProvider } from '@/hooks/useCalendarVisibility';
import { CalendarSettingsPanel } from '@/components/calendar/CalendarSettingsPanel';
import { CalendarSettingsSidebarNav } from '@/components/calendar/CalendarSettingsSidebarNav';

export default function CalendarLayoutShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const onSettingsPage = isCalendarSettingsPage(pathname);

  const sidebarConfig = useMemo(() => {
    if (onSettingsPage) {
      return createAppointmentsSettingsSidebarConfig(
        ({ isExpanded }: { isExpanded: boolean }) => (
          <CalendarSettingsSidebarNav isExpanded={isExpanded} />
        ),
      );
    }
    return createAppointmentsSidebarConfig(() => setSettingsOpen((prev) => !prev));
  }, [onSettingsPage]);

  return (
    <CalendarVisibilityProvider>
      <SidebarPortalProvider>
        <SidebarProvider>
          <div className="flex min-h-[calc(100vh-4rem)]">
            <SidebarWithSuspense config={sidebarConfig} />

            {!onSettingsPage && (
              <CalendarSettingsPanel
                isOpen={settingsOpen}
                onClose={() => setSettingsOpen(false)}
              />
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
                  <span className="text-sm font-medium text-foreground">Calendar</span>
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4">
                  <div className="mx-auto flex flex-col gap-6">{children}</div>
                </div>
              </main>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </SidebarPortalProvider>
    </CalendarVisibilityProvider>
  );
}
