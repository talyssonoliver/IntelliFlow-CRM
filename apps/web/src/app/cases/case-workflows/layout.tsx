'use client';

/**
 * Case Workflows layout
 *
 * Two modes, switched by pathname:
 *
 *  /cases/case-workflows            → list view → Cases sidebar + padded main
 *  /cases/case-workflows/new        → canvas   → fullscreen, no sidebar
 *  /cases/case-workflows/{id}       → canvas   → fullscreen, no sidebar
 *
 * The list-view branch mirrors `apps/web/src/app/cases/(list)/layout.tsx` so
 * Workflows feels like a first-class Cases sub-section. The canvas branch
 * skips the sidebar shell so the ReactFlow canvas can fill the viewport
 * edge-to-edge while the app-level top nav (owned by a higher layout) stays
 * visible for back-out.
 */

import { useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import '@xyflow/react/dist/style.css';
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

const LIST_ROUTE = '/cases/case-workflows';

export default function CaseWorkflowsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  // Canvas mode = any route deeper than the list root (e.g. /new, /{id}).
  const isCanvasMode = pathname !== LIST_ROUTE && pathname.startsWith(LIST_ROUTE + '/');

  if (isCanvasMode) {
    // Fullscreen canvas — no module sidebar, no padded container. The child
    // page owns its own PageHeader + the ReactFlow canvas filling the rest.
    return (
      <div className="flex flex-col min-h-[calc(100vh-4rem)] bg-background">{children}</div>
    );
  }

  return <WorkflowsListShell pathname={pathname}>{children}</WorkflowsListShell>;
}

// ---------------------------------------------------------------------------
// List shell — mirrors /cases/(list)/layout.tsx
// ---------------------------------------------------------------------------

function WorkflowsListShell({
  pathname,
  children,
}: {
  pathname: string;
  children: React.ReactNode;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const onSettingsPage = isCaseSettingsPage(pathname);

  const sidebarConfig = useMemo(() => {
    if (onSettingsPage) {
      return createCasesSettingsSidebarConfig(({ isExpanded }) => (
        <CaseSettingsSidebarNav isExpanded={isExpanded} />
      ));
    }
    return createCasesSidebarConfig(() => setSettingsOpen((prev) => !prev));
  }, [onSettingsPage]);

  return (
    <SidebarPortalProvider>
      <SidebarProvider>
        <div className="flex min-h-[calc(100vh-4rem)]">
          <SidebarWithSuspense config={sidebarConfig} />

          {!onSettingsPage && (
            <CaseSettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
          )}

          <SidebarPortalTarget />

          <SidebarInset>
            <main
              className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background relative"
              id="main-content"
            >
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border lg:hidden">
                <SidebarTrigger />
                <span className="text-sm font-medium text-foreground">Cases</span>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4">
                <div className="mx-auto flex flex-col gap-6 w-full">{children}</div>
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </SidebarPortalProvider>
  );
}
