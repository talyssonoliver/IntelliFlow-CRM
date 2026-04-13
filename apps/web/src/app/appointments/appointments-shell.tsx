'use client';

import { useMemo } from 'react';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarWithSuspense,
} from '@/components/sidebar';
import { createAppointmentsSidebarConfig } from '@/components/sidebar/configs/appointments';

export function AppointmentsShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const sidebarConfig = useMemo(() => createAppointmentsSidebarConfig(), []);

  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <SidebarWithSuspense config={sidebarConfig} />

        <SidebarInset>
          <main
            className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background"
            id="main-content"
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3 lg:hidden">
              <SidebarTrigger />
              <span className="text-sm font-medium text-foreground">Appointments</span>
            </div>
            <div className="flex-1 overflow-x-hidden overflow-y-auto p-2 sm:p-3 md:p-4">
              <div className="mx-auto flex flex-col gap-6">{children}</div>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
