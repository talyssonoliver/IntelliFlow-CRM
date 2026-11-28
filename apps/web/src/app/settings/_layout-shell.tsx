'use client';

/**
 * Settings Layout Shell (Client Component)
 *
 * Uses unified AppSidebar pattern with settingsSidebarConfig.
 * Updated for PG-128 to follow design system guidelines.
 */

import {
  SidebarProvider,
  SidebarInset,
  SidebarWithSuspense,
  settingsSidebarConfig,
  SectionMobileBar,
} from '@/components/sidebar';

export default function SettingsLayoutShell({
  children,
}: Readonly<{ readonly children: React.ReactNode }>) {
  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <SidebarWithSuspense config={settingsSidebarConfig} />

        <SidebarInset>
          <main
            className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background relative"
            id="main-content"
          >
            <SectionMobileBar title="Settings" />
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4">
              {children}
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
