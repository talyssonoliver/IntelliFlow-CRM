'use client';

import { useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarWithSuspense,
  createDocumentsSidebarConfig,
  createDocumentsSettingsSidebarConfig,
  isDocumentSettingsPage,
} from '@/components/sidebar';
import { DocumentSettingsPanel } from '@/components/documents/DocumentSettingsPanel';
import { DocumentSettingsSidebarNav } from '@/components/documents/DocumentSettingsSidebarNav';

export default function DocumentsListLayout({ children }: Readonly<{ readonly children: React.ReactNode }>) {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const onSettingsPage = isDocumentSettingsPage(pathname);

  const sidebarConfig = useMemo(() => {
    if (onSettingsPage) {
      return createDocumentsSettingsSidebarConfig(
        ({ isExpanded }) => (
          <DocumentSettingsSidebarNav isExpanded={isExpanded} />
        ),
      );
    }
    return createDocumentsSidebarConfig(() => setSettingsOpen((prev) => !prev));
  }, [onSettingsPage]);

  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <SidebarWithSuspense config={sidebarConfig} />

        {/* Panel only needed in list mode */}
        {!onSettingsPage && (
          <DocumentSettingsPanel
            isOpen={settingsOpen}
            onClose={() => setSettingsOpen(false)}
          />
        )}

        <SidebarInset>
          <main
            className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background relative"
            id="main-content"
          >
            {/* Mobile header with sidebar trigger */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border lg:hidden">
              <SidebarTrigger />
              <span className="text-sm font-medium text-foreground">Documents</span>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4">
              <div className="mx-auto flex flex-col gap-6">{children}</div>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
