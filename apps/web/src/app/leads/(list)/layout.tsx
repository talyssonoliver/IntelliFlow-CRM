'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Lead Views - sidebar navigation items for different lead filters
 * Matches mockup design from docs/design/mockups/lead-list.html
 */
const leadViews = [
  { id: 'all', label: 'All Leads', icon: 'list', href: '/leads' },
  { id: 'my', label: 'My Leads', icon: 'person', href: '/leads?view=my' },
  { id: 'starred', label: 'Starred', icon: 'star', href: '/leads?view=starred' },
  { id: 'recent', label: 'Recently Viewed', icon: 'schedule', href: '/leads?view=recent' },
];

/**
 * Segments - color-coded lead segments matching mockup
 */
const segments = [
  { id: 'new-week', label: 'New This Week', color: 'text-green-500', href: '/leads?segment=new-week' },
  { id: 'hot', label: 'Hot Leads (>80)', color: 'text-amber-500', href: '/leads?segment=hot' },
  { id: 'followup', label: 'Needs Follow-up', color: 'text-red-500', href: '/leads?segment=followup' },
];

export default function LeadsListLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Determine active view from URL params
  const currentView = searchParams.get('view') || 'all';
  const currentSegment = searchParams.get('segment');
  const isAllLeadsActive = pathname === '/leads' && !searchParams.get('view') && !currentSegment;

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Left Sidebar - Lead Views & Segments */}
      <aside
        className="w-60 border-r border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark flex-shrink-0 hidden lg:flex flex-col transition-colors duration-300 z-20"
        role="navigation"
        aria-label="Lead navigation"
      >
        <div className="flex h-full flex-col py-6 px-3">
          <div className="flex flex-col gap-6">
            {/* Lead Views */}
            <div>
              <div className="px-3 mb-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Lead Views</span>
              </div>
              <nav className="flex flex-col gap-1" role="menu" aria-label="Lead views">
                {leadViews.map((view) => {
                  const isActive = view.id === 'all' ? isAllLeadsActive : currentView === view.id;
                  return (
                    <Link
                      key={view.id}
                      href={view.href}
                      role="menuitem"
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? 'bg-ds-primary/10 text-ds-primary font-medium'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                      } group`}
                    >
                      <span
                        className={`material-symbols-outlined text-[20px] ${isActive ? 'fill' : 'group-hover:text-ds-primary'} transition-colors`}
                        aria-hidden="true"
                      >
                        {view.icon}
                      </span>
                      <span>{view.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Segments */}
            <div>
              <div className="px-3 mb-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Segments</span>
              </div>
              <nav className="flex flex-col gap-1" role="menu" aria-label="Lead segments">
                {segments.map((segment) => {
                  const isActive = currentSegment === segment.id;
                  return (
                    <Link
                      key={segment.id}
                      href={segment.href}
                      role="menuitem"
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors group ${
                        isActive
                          ? 'bg-ds-primary/10 text-ds-primary font-medium'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined text-[20px] ${segment.color}`}
                        aria-hidden="true"
                      >
                        fiber_manual_record
                      </span>
                      <span>{segment.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Module Settings */}
          <div className="mt-auto pt-4 border-t border-border-light dark:border-border-dark">
            <Link
              href="/settings/leads"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm transition-colors group"
            >
              <span
                className="material-symbols-outlined text-slate-500 dark:text-slate-400 group-hover:text-ds-primary transition-colors"
                aria-hidden="true"
              >
                settings
              </span>
              <span className="font-medium leading-normal">Module Settings</span>
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background-light dark:bg-background-dark relative"
        id="main-content"
      >
        <div className="flex-1 overflow-y-auto p-6 md:p-8 lg:px-10 lg:py-8">
          <div className="mx-auto flex flex-col gap-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
