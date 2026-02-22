'use client';

/**
 * Settings Layout
 *
 * Uses unified AppSidebar pattern with settingsSidebarConfig.
 * Updated for PG-128 to follow design system guidelines.
 */

import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarWithSuspense,
  settingsSidebarConfig,
} from '@/components/sidebar';

export default function SettingsLayout({ children }: { readonly children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <SidebarWithSuspense config={settingsSidebarConfig} />

        <SidebarInset>
          <main
            className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background relative"
            id="main-content"
          >
            {/* Mobile header with sidebar trigger */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border lg:hidden">
              <SidebarTrigger />
              <span className="text-sm font-medium text-foreground">Settings</span>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4">
              {children}
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
