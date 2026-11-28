'use client';

import {
  SidebarProvider,
  SidebarInset,
  SidebarWithSuspense,
  dealsSidebarConfig,
  SectionMobileBar,
} from '@/components/sidebar';

export default function DealsForecastLayout({
  children,
}: Readonly<{ readonly children: React.ReactNode }>) {
  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-4rem)] w-full overflow-hidden">
        <SidebarWithSuspense config={dealsSidebarConfig} />

        {/* Main Content */}
        <SidebarInset>
          <main
            className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background relative"
            id="main-content"
          >
            <SectionMobileBar title="Deals" />
            {/* Mobile header with sidebar trigger */}

            <div className="flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
