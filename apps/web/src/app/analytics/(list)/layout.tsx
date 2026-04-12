'use client';

import { useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarWithSuspense,
  createAnalyticsSidebarConfig,
  createAnalyticsSettingsSidebarConfig,
  isReportSettingsPage,
} from '@/components/sidebar';
import { ModuleGate } from '@/components/ModuleGate';
import { AnalyticsSettingsPanel } from '@/components/analytics/AnalyticsSettingsPanel';
import { AnalyticsSettingsSidebarNav } from '@/components/analytics/AnalyticsSettingsSidebarNav';

export default function AnalyticsListLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const onSettingsPage = isReportSettingsPage(pathname);

  const sidebarConfig = useMemo(() => {
    if (onSettingsPage) {
      return createAnalyticsSettingsSidebarConfig(({ isExpanded }) => (
        <AnalyticsSettingsSidebarNav isExpanded={isExpanded} />
      ));
    }
    return createAnalyticsSidebarConfig(() => setSettingsOpen((prev) => !prev));
  }, [onSettingsPage]);

  return (
    <ModuleGate moduleId="ANALYTICS">
      <SidebarProvider>
        <div className="flex min-h-[calc(100vh-4rem)]">
          <SidebarWithSuspense config={sidebarConfig} />

          {/* Panel only needed in list mode */}
          {!onSettingsPage && (
            <AnalyticsSettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
          )}

          {/* Main Content */}
          <SidebarInset>
            <main
              className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background relative"
              id="main-content"
            >
              {/* Mobile header with sidebar trigger */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border lg:hidden">
                <SidebarTrigger />
                <span className="text-sm font-medium text-foreground">Analytics</span>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4">
                <div className="mx-auto flex flex-col gap-6">{children}</div>
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </ModuleGate>
  );
}
