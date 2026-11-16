'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@intelliflow/ui';
import { useAuth } from '@/lib/auth';
import { isSidebarItemActive } from '@/components/sidebar/AppSidebar';
import { useModuleNav, visibleSections } from '@/components/sidebar/module-nav-store';

const ITEM_CLASS = 'flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors';
const IDLE_CLASS = 'text-muted-foreground hover:text-foreground hover:bg-accent';

/**
 * The open module's own menu inside the app's phone menu, listed under the module's link
 * (MVP-006). It shows what the module's phone drawer showed: its custom content, its sections
 * (role-filtered, the current one marked) and Module Settings. Renders nothing outside a module.
 */
export function ModuleNavGroup({ onNavigate }: Readonly<{ onNavigate: () => void }>) {
  const moduleNav = useModuleNav();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  if (!moduleNav) return null;
  const sections = visibleSections(moduleNav.sections, user?.role);
  const Before = moduleNav.beforeContent;
  const After = moduleNav.afterContent;
  const hasSettings =
    moduleNav.showSettings !== false && (!!moduleNav.settingsHref || !!moduleNav.onSettingsClick);
  if (sections.length === 0 && !Before && !After && !hasSettings) return null;

  return (
    <nav
      className="ml-6 mt-1 mb-2 space-y-3 border-l border-border pl-3"
      aria-label={`${moduleNav.moduleTitle} sections`}
    >
      {Before && <Before isExpanded={true} />}
      {sections.map((section) => (
        <div key={section.id}>
          <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {section.title}
          </p>
          {section.items.map((item) => {
            const active = isSidebarItemActive(item, pathname, searchParams);
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  ITEM_CLASS,
                  active ? 'bg-primary/10 text-primary font-medium' : IDLE_CLASS
                )}
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="text-xs text-muted-foreground">{item.badge}</span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
      {After && <After isExpanded={true} />}
      {hasSettings && <ModuleSettingsEntry nav={moduleNav} onNavigate={onNavigate} />}
    </nav>
  );
}

function ModuleSettingsEntry({
  nav,
  onNavigate,
}: Readonly<{
  nav: NonNullable<ReturnType<typeof useModuleNav>>;
  onNavigate: () => void;
}>) {
  const content = (
    <>
      <span className="material-symbols-outlined text-lg" aria-hidden="true">
        settings
      </span>
      <span>Module Settings</span>
    </>
  );
  if (nav.onSettingsClick) {
    const open = nav.onSettingsClick;
    return (
      <button
        type="button"
        onClick={() => {
          open();
          onNavigate();
        }}
        className={cn(ITEM_CLASS, IDLE_CLASS, 'w-full')}
      >
        {content}
      </button>
    );
  }
  return (
    <Link href={nav.settingsHref!} onClick={onNavigate} className={cn(ITEM_CLASS, IDLE_CLASS)}>
      {content}
    </Link>
  );
}
