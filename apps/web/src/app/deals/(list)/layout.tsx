'use client';

import { useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarWithSuspense,
  createDealsSidebarConfig,
  createDealsSettingsSidebarConfig,
  isDealSettingsPage,
} from '@/components/sidebar';
import { DealSettingsPanel } from '@/components/deals/DealSettingsPanel';
import { DealSettingsSidebarNav } from '@/components/deals/DealSettingsSidebarNav';

export default function DealsListLayout({ children }: Readonly<{ readonly children: React.ReactNode }>) {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const onSettingsPage = isDealSettingsPage(pathname);

  const sidebarConfig = useMemo(() => {
    if (onSettingsPage) {
      return createDealsSettingsSidebarConfig(
        ({ isExpanded }) => (
          <DealSettingsSidebarNav isExpanded={isExpanded} />
        ),
      );
    }
    return createDealsSidebarConfig(() => setSettingsOpen((prev) => !prev));
  }, [onSettingsPage]);

  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-4rem)] w-full overflow-hidden">
        <SidebarWithSuspense config={sidebarConfig} />

        {/* Panel only needed in list mode */}
        {!onSettingsPage && (
          <DealSettingsPanel
            isOpen={settingsOpen}
            onClose={() => setSettingsOpen(false)}
          />
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
              <span className="text-sm font-medium text-foreground">Deals</span>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4">
              <div className="w-full max-w-full overflow-hidden flex flex-col gap-4 sm:gap-6">
                {children}
              </div>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
