'use client';

import {
  SidebarProvider,
  SidebarInset,
  SidebarWithSuspense,
  supportTicketsSidebarConfig,
  SidebarPortalProvider,
  SidebarPortalTarget,
} from '@/components/sidebar';
import { ModuleGate } from '@/components/ModuleGate';

export default function SupportTicketsListLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ModuleGate moduleId="SUPPORT">
      <SidebarPortalProvider>
        <SidebarProvider>
          <div className="flex min-h-[calc(100vh-4rem)]">
            <SidebarWithSuspense config={supportTicketsSidebarConfig} />

            {/* Portal target for page-injected sidebar content */}
            <SidebarPortalTarget />

            {/* Main Content */}
            <SidebarInset>
              <main
                className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background relative"
                id="main-content"
              >
                {/* Mobile header with sidebar trigger */}

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
