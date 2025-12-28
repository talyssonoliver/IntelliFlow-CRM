'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const contactViews = [
  { id: 'all', label: 'All Contacts', icon: 'contacts', href: '/contacts' },
  { id: 'my', label: 'My Contacts', icon: 'person', href: '/contacts?view=my' },
  { id: 'recent-added', label: 'Recently Added', icon: 'schedule', href: '/contacts?view=recent-added' },
  { id: 'recent-viewed', label: 'Recently Viewed', icon: 'history', href: '/contacts?view=recent-viewed' },
];

const segments = [
  { id: 'vip', label: 'VIP Clients', icon: 'star', color: 'text-purple-500', href: '/contacts?segment=vip' },
  { id: 'partners', label: 'Partners', icon: 'handshake', color: 'text-blue-500', href: '/contacts?segment=partners' },
  { id: 'vendors', label: 'Vendors', icon: 'storefront', color: 'text-orange-500', href: '/contacts?segment=vendors' },
];

export default function ContactsListLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [activeView, setActiveView] = useState('all');

  const isAllContactsActive = pathname === '/contacts' && activeView === 'all';

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Left Sidebar - Contact Views & Segments */}
      <aside className="w-60 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-shrink-0 hidden lg:flex flex-col">
        <div className="flex-1 py-6 px-3">
          {/* Contact Views */}
          <div className="mb-6">
            <div className="px-3 mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Contact Views</span>
            </div>
            <nav className="flex flex-col gap-1">
              {contactViews.map((view) => {
                const isActive = view.id === 'all' ? isAllContactsActive : activeView === view.id;
                return (
                  <button
                    key={view.id}
                    onClick={() => setActiveView(view.id)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                      isActive
                        ? 'bg-[#137fec]/10 text-[#137fec] font-medium'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-[20px] ${isActive ? 'fill' : ''}`}>{view.icon}</span>
                    <span>{view.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Segments */}
          <div>
            <div className="px-3 mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Segments</span>
            </div>
            <nav className="flex flex-col gap-1">
              {segments.map((segment) => (
                <Link
                  key={segment.id}
                  href={segment.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm transition-colors"
                >
                  <span className={`material-symbols-outlined text-[20px] ${segment.color}`}>{segment.icon}</span>
                  <span>{segment.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>

        {/* Module Settings */}
        <div className="mt-auto pt-4 px-3 pb-6 border-t border-slate-200 dark:border-slate-700">
          <Link
            href="/settings/contacts"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm transition-colors"
          >
            <span className="material-symbols-outlined text-slate-500">settings</span>
            <span className="font-medium">Module Settings</span>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6 md:p-8 lg:px-10 lg:py-8 bg-[#f6f7f8] dark:bg-slate-950">
        {children}
      </main>
    </div>
  );
}
