'use client';

import { Suspense, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AppSidebar, MobileSidebar } from './AppSidebar';
import { publishModuleNav, useMenuSlots } from './module-nav-store';
import type { SidebarConfig } from './sidebar-types';

function SidebarFallback() {
  return <div className="w-[var(--sidebar-width)] shrink-0" />;
}

/**
 * The module's custom sidebar content, shown in the app's phone menu. It is portalled from here,
 * inside the module's layout, so it keeps the module's providers (the calendar's toggles need
 * CalendarVisibilityProvider, which the root-level app menu is outside of).
 */
export function ModuleMenuContent({ config }: Readonly<{ config: SidebarConfig }>) {
  const slots = useMenuSlots();
  const Before = config.beforeContent;
  const After = config.afterContent;
  return (
    <>
      {Before && slots.before && createPortal(<Before isExpanded={true} />, slots.before)}
      {After && slots.after && createPortal(<After isExpanded={true} />, slots.after)}
    </>
  );
}

export function SidebarWithSuspense({ config }: Readonly<{ config: SidebarConfig }>) {
  // On a phone the app's ≡ menu lists this module's sections, so the page needs no second menu.
  useEffect(() => publishModuleNav(config), [config]);

  return (
    <>
      <Suspense fallback={<SidebarFallback />}>
        <AppSidebar config={config} />
      </Suspense>
      <Suspense fallback={null}>
        <MobileSidebar config={config} />
      </Suspense>
      <ModuleMenuContent config={config} />
    </>
  );
}
