'use client';

import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarWithSuspense,
  tasksSidebarConfig,
} from '@/components/sidebar';

export function TasksShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <SidebarWithSuspense config={tasksSidebarConfig} />

        <SidebarInset>
          <main
            className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background"
            id="main-content"
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3 lg:hidden">
              <SidebarTrigger />
              <span className="text-sm font-medium text-foreground">Tasks</span>
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
