'use client';

import { useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarWithSuspense,
  createCasesSidebarConfig,
  createCasesSettingsSidebarConfig,
  isCaseSettingsPage,
  SidebarPortalProvider,
  SidebarPortalTarget,
} from '@/components/sidebar';
import { CaseSettingsPanel } from '@/components/cases/CaseSettingsPanel';
import { CaseSettingsSidebarNav } from '@/components/cases/CaseSettingsSidebarNav';

export default function CasesListLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const onSettingsPage = isCaseSettingsPage(pathname);

  const sidebarConfig = useMemo(() => {
    if (onSettingsPage) {
      return createCasesSettingsSidebarConfig(
        ({ isExpanded }) => (
          <CaseSettingsSidebarNav isExpanded={isExpanded} />
        ),
      );
    }
    return createCasesSidebarConfig(() => setSettingsOpen((prev) => !prev));
  }, [onSettingsPage]);

  return (
    <SidebarPortalProvider>
      <SidebarProvider>
        <div className="flex min-h-[calc(100vh-4rem)]">
          <SidebarWithSuspense config={sidebarConfig} />

          {/* Panel only needed in list mode */}
          {!onSettingsPage && (
            <CaseSettingsPanel
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
                <span className="text-sm font-medium text-foreground">Cases</span>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4">
                <div className="mx-auto flex flex-col gap-6">{children}</div>
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </SidebarPortalProvider>
  );
}
