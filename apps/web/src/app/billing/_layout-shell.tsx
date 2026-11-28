'use client';

/**
 * Billing Layout Shell (Client Component)
 *
 * Layout wrapper for the billing portal pages with sidebar navigation.
 *
 * @implements PG-025 (Billing Portal)
 */

import {
  SidebarProvider,
  SidebarInset,
  SidebarWithSuspense,
  billingSidebarConfig,
  SectionMobileBar,
} from '@/components/sidebar';

export default function BillingLayoutShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <SidebarWithSuspense config={billingSidebarConfig} />

        <SidebarInset>
          <main
            className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background relative"
            id="main-content"
          >
            <SectionMobileBar title="Billing" />
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4">
              <div className="mx-auto flex flex-col gap-6">{children}</div>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
