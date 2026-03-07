'use client';

import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarWithSuspense,
  insightsSidebarConfig,
} from '@/components/sidebar';
import { ModuleGate } from '@/components/ModuleGate';

export default function InsightsLayoutShell({ children }: Readonly<{ readonly children: React.ReactNode }>) {
  return (
    <ModuleGate moduleId="AI_INTELLIGENCE">
      <SidebarProvider>
        <div className="flex min-h-[calc(100vh-4rem)]">
          <SidebarWithSuspense config={insightsSidebarConfig} />

          <SidebarInset>
            <main
              className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background relative"
              id="main-content"
            >
              {/* Mobile header with sidebar trigger */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border lg:hidden">
                <SidebarTrigger />
                <span className="text-sm font-medium text-foreground">AI Insights</span>
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
