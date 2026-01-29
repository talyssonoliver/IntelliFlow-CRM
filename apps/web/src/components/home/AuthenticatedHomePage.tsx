'use client';

import Link from 'next/link';

// =============================================================================
// Data
// =============================================================================

const aiInsights = [
  {
    id: 'insight-deal-risk',
    type: 'warning',
    icon: 'warning',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    title: 'Deal at Risk: TechCorp Enterprise',
    description:
      'Last interaction was 14 days ago. Sentiment analysis of recent emails suggests hesitation.',
    action: 'Suggested Action: Schedule a check-in call.',
  },
  {
    id: 'insight-opportunity',
    type: 'opportunity',
    icon: 'trending_up',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    title: 'Opportunity Detected',
    description: 'Contact "Sarah Jenkins" viewed pricing page 3 times today.',
    action: 'Suggested Action: Send personalized pricing breakdown.',
  },
];

const feedItems = [
  {
    id: 1,
    type: 'mention',
    initials: 'JD',
    initialsBg: 'bg-blue-100 dark:bg-blue-900',
    initialsText: 'text-blue-600 dark:text-blue-300',
    title: 'John Doe mentioned you in a note',
    time: '10m ago',
    description: '"@Alex could you review the contract terms for the Globex deal before I send it out?"',
    attachment: { name: 'Globex_Contract_Draft_v2.pdf', icon: 'picture_as_pdf' },
    showActions: true,
  },
  {
    id: 2,
    type: 'call',
    icon: 'call_received',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900',
    iconColor: 'text-emerald-600 dark:text-emerald-300',
    title: 'Inbound Call Logged',
    time: '1h ago',
    description: 'Call with Mike Ross (Pearson Specter). Duration: 12m 45s.',
    badges: [
      { id: 'badge-interested', label: 'Interested', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' },
      { id: 'badge-followup', label: 'Follow-up Required', color: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300' },
    ],
  },
  {
    id: 3,
    type: 'system',
    initials: 'AI',
    initialsBg: 'bg-purple-100 dark:bg-purple-900',
    initialsText: 'text-purple-600 dark:text-purple-300',
    title: 'System Notification',
    time: '2h ago',
    description: "Your weekly performance report is ready. You've achieved 108% of your target this week.",
    link: { label: 'View Report', href: '#' },
  },
];

const quickActions = [
  { id: 'action-call', icon: 'add_call', label: 'Log Call', color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' },
  { id: 'action-email', icon: 'mail', label: 'Email', color: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600' },
  { id: 'action-meeting', icon: 'event', label: 'Meeting', color: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600' },
  { id: 'action-task', icon: 'task', label: 'Task', color: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600' },
];

const pinnedItems = [
  { id: 'pinned-q4-strategy', icon: 'folder_special', iconBg: 'bg-orange-100 dark:bg-orange-900/30', iconColor: 'text-orange-600', title: 'Q4 Marketing Strategy', subtitle: 'Modified yesterday' },
  { id: 'pinned-vip-clients', icon: 'contacts', iconBg: 'bg-blue-100 dark:bg-blue-900/30', iconColor: 'text-blue-600', title: 'VIP Clients List', subtitle: '24 contacts' },
];

const navLinks = [
  { label: 'Dashboard', href: '/dashboard', active: true },
  { label: 'Leads', href: '/leads' },
  { label: 'Contacts', href: '/contacts' },
  { label: 'Deals', href: '/deals' },
  { label: 'Tickets', href: '/tickets' },
  { label: 'Documents', href: '/documents' },
  { label: 'Agent Actions', href: '/agent-approvals/preview' },
  { label: 'Reports', href: '/analytics' },
];

// =============================================================================
// Component
// =============================================================================

function getGreeting(hour: number): string {
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

function getGreetingIcon(hour: number): string {
  if (hour < 18) return 'wb_sunny';
  return 'nights_stay';
}

export function AuthenticatedHomePage() {
  // Get greeting based on time of day
  const hour = new Date().getHours();
  const greeting = getGreeting(hour);
  const greetingIcon = getGreetingIcon(hour);

  return (
    <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922]">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-[#e2e8f0] dark:border-[#334155] bg-white dark:bg-[#1e2936]">
        <div className="flex h-16 items-center px-4 lg:px-6">
          {/* Logo */}
          <div className="mr-8">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-[#137fec] flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-white text-xl">grid_view</span>
              </div>
              <span className="text-lg font-bold text-slate-900 dark:text-white hidden sm:inline">IntelliFlow CRM</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  link.active
                    ? 'bg-[#137fec]/10 text-[#137fec]'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Search */}
          <div className="hidden md:flex items-center mr-4">
            <div className="relative w-64">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400 dark:text-slate-500">
                search
              </span>
              <input
                type="search"
                placeholder="Search..."
                className="w-full pl-10 pr-4 py-2 text-sm border border-[#e2e8f0] dark:border-[#334155] rounded-lg bg-[#f6f7f8] dark:bg-[#101922] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent"
              />
            </div>
          </div>

          {/* Notifications */}
          <button
            className="relative p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Notifications (3 unread)"
          >
            <span className="material-symbols-outlined text-xl">notifications</span>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>

          {/* User Menu */}
          <div className="relative ml-2">
            <button
              className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-expanded="false"
              aria-haspopup="true"
            >
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center overflow-hidden">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">A</span>
              </div>
              <span className="hidden sm:inline text-sm font-medium text-slate-900 dark:text-white">Alex</span>
              <span className="material-symbols-outlined text-lg text-slate-400 dark:text-slate-500">expand_more</span>
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden ml-4 p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            aria-label="Toggle menu"
          >
            <span className="material-symbols-outlined text-xl">menu</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative">
        {/* Subtle grid background pattern */}
        <div
          className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='none' stroke='%23334155' stroke-width='0.5'/%3E%3C/svg%3E")`,
          }}
        />

        <div className="relative px-4 sm:px-6 lg:px-8 xl:px-12 py-6 max-w-[1800px] mx-auto">
          {/* Welcome Banner */}
          <div className="bg-gradient-to-r from-[#137fec] to-indigo-600 rounded-xl p-8 text-white shadow-lg relative overflow-hidden mb-6">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <span className="material-symbols-outlined text-9xl">waving_hand</span>
            </div>
            <div className="relative z-10 max-w-2xl">
              <div className="flex items-center gap-2 mb-2 text-blue-100">
                <span className="material-symbols-outlined text-sm">{greetingIcon}</span>
                <span className="text-sm font-medium uppercase tracking-wide">{greeting}</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-4">Welcome back, Alex!</h1>
              <p className="text-lg text-blue-50 mb-6 leading-relaxed">
                You have 3 high-priority tasks pending and 2 new leads assigned to you since yesterday. Your deal closing rate is up by 5% this week!
              </p>
              <div className="flex flex-wrap gap-3">
                <button className="bg-white text-[#137fec] hover:bg-blue-50 px-4 py-2 rounded-lg font-semibold text-sm transition-colors shadow-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">calendar_today</span>{' '}View Schedule
                </button>
                <Link
                  href="/dashboard"
                  className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors backdrop-blur-sm flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg">dashboard</span>{' '}Go to Dashboard
                </Link>
              </div>
            </div>
          </div>

          {/* Dashboard Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 auto-rows-min">
            {/* AI Daily Insights - colSpan: 3 */}
            <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm">
              <div className="p-4 border-b border-[#e2e8f0] dark:border-[#334155] flex justify-between items-center bg-indigo-50/50 dark:bg-indigo-900/10 rounded-t-xl">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400">auto_awesome</span>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100">AI Daily Insights</h3>
                </div>
                <button className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">View All</button>
              </div>
              <div className="p-4 grid gap-4">
                {aiInsights.map((insight) => (
                  <div
                    key={insight.id}
                    className="flex gap-4 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer border border-transparent hover:border-slate-100 dark:hover:border-slate-700"
                  >
                    <div className={`shrink-0 ${insight.iconBg} ${insight.iconColor} rounded-lg p-2 h-fit`}>
                      <span className="material-symbols-outlined">{insight.icon}</span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{insight.title}</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        {insight.description} <span className="font-medium text-[#137fec]">{insight.action}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions - colSpan: 1 */}
            <div className="col-span-1 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm p-5">
              <h3 className="font-bold text-slate-900 dark:text-white mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-3">
                {quickActions.map((action) => (
                  <button
                    key={action.id}
                    className="flex flex-col items-center justify-center p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors gap-2 group"
                  >
                    <div className={`p-2 ${action.color} rounded-full group-hover:scale-110 transition-transform`}>
                      <span className="material-symbols-outlined">{action.icon}</span>
                    </div>
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Your Feed - colSpan: 3, rowSpan: 2 */}
            <div className="col-span-1 md:col-span-2 lg:col-span-3 row-span-2 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm">
              <div className="p-5 border-b border-[#e2e8f0] dark:border-[#334155] flex justify-between items-center">
                <h3 className="font-bold text-slate-900 dark:text-white">Your Feed</h3>
                <button className="p-1 text-slate-400 hover:text-[#137fec] transition-colors rounded">
                  <span className="material-symbols-outlined text-[20px]">filter_list</span>
                </button>
              </div>
              <div className="divide-y divide-[#e2e8f0] dark:divide-[#334155]">
                {feedItems.map((item) => (
                  <div key={item.id} className="p-5 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <div className="flex gap-3">
                      {item.initials ? (
                        <div className={`size-10 rounded-full ${item.initialsBg} flex items-center justify-center ${item.initialsText} font-bold shrink-0`}>
                          {item.initials}
                        </div>
                      ) : (
                        <div className={`size-10 rounded-full ${item.iconBg} flex items-center justify-center ${item.iconColor} shrink-0`}>
                          <span className="material-symbols-outlined">{item.icon}</span>
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.title}</p>
                          <span className="text-xs text-slate-400 whitespace-nowrap">{item.time}</span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{item.description}</p>

                        {item.attachment && (
                          <div className="mt-3 bg-slate-50 dark:bg-slate-800 rounded border border-[#e2e8f0] dark:border-[#334155] p-2 flex items-center gap-3">
                            <div className="bg-white dark:bg-slate-700 p-1.5 rounded text-red-500">
                              <span className="material-symbols-outlined text-sm">{item.attachment.icon}</span>
                            </div>
                            <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">{item.attachment.name}</span>
                          </div>
                        )}

                        {item.badges && (
                          <div className="mt-2 flex gap-2">
                            {item.badges.map((badge) => (
                              <span
                                key={badge.id}
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.color}`}
                              >
                                {badge.label}
                              </span>
                            ))}
                          </div>
                        )}

                        {item.showActions && (
                          <div className="flex gap-3 mt-3">
                            <button className="text-xs font-semibold text-slate-500 hover:text-[#137fec] flex items-center gap-1">
                              <span className="material-symbols-outlined text-[16px]">reply</span> Reply
                            </button>
                            <button className="text-xs font-semibold text-slate-500 hover:text-[#137fec] flex items-center gap-1">
                              <span className="material-symbols-outlined text-[16px]">thumb_up</span> Like
                            </button>
                          </div>
                        )}

                        {item.link && (
                          <Link href={item.link.href} className="mt-2 text-sm text-[#137fec] font-medium hover:underline inline-block">
                            {item.link.label}
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-[#e2e8f0] dark:border-[#334155] text-center">
                <button className="text-sm font-medium text-slate-500 hover:text-[#137fec] transition-colors">Load More Updates</button>
              </div>
            </div>

            {/* Today's Focus - colSpan: 1 */}
            <div className="col-span-1 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-900 dark:text-white">Today&apos;s Focus</h3>
                <span className="text-xs font-medium bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-400">Sales</span>
              </div>
              <div className="relative w-32 h-32 mx-auto mb-4">
                <svg className="size-full -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-slate-100 dark:text-slate-800"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="text-[#137fec]"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeDasharray="75, 100"
                    strokeWidth="3"
                  />
                </svg>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">75%</span>
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">Goal Reached</p>
                </div>
              </div>
              <p className="text-sm text-center text-slate-600 dark:text-slate-400">
                You need <span className="font-bold text-slate-900 dark:text-white">$1,200</span> more to hit today&apos;s target.
              </p>
            </div>

            {/* Pinned - colSpan: 1 */}
            <div className="col-span-1 bg-white dark:bg-[#1e2936] rounded-xl border border-[#e2e8f0] dark:border-[#334155] shadow-sm p-5">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-slate-900 dark:text-white">Pinned</h3>
                <button className="text-slate-400 hover:text-[#137fec]">
                  <span className="material-symbols-outlined text-sm">edit</span>
                </button>
              </div>
              <div className="space-y-3">
                {pinnedItems.map((item) => (
                  <Link
                    key={item.id}
                    href="#"
                    className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors group"
                  >
                    <div className={`size-8 rounded ${item.iconBg} ${item.iconColor} flex items-center justify-center`}>
                      <span className="material-symbols-outlined text-lg">{item.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate group-hover:text-[#137fec]">{item.title}</p>
                      <p className="text-xs text-slate-400">{item.subtitle}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#e2e8f0] dark:border-[#334155] bg-white dark:bg-[#1e2936]">
        <div className="px-4 sm:px-6 lg:px-8 xl:px-12 py-12 max-w-[1800px] mx-auto">
          {/* Main Footer Content */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-8">
            {/* Brand Column */}
            <div className="col-span-2 md:col-span-4 lg:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded bg-[#137fec] flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-white text-xl">grid_view</span>
                </div>
                <span className="text-lg font-bold text-slate-900 dark:text-white">IntelliFlow CRM</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                AI-powered CRM with modern automation and governance-grade validation
              </p>
              {/* Social Links */}
              <div className="flex items-center gap-3">
                <a href="https://twitter.com/intelliflow" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors" aria-label="Twitter">
                  <span className="text-sm font-medium">X</span>
                </a>
                <a href="https://linkedin.com/company/intelliflow" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors" aria-label="LinkedIn">
                  <span className="text-sm font-medium">LinkedIn</span>
                </a>
                <a href="https://github.com/intelliflow" target="_blank" rel="noopener noreferrer" className="text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors" aria-label="GitHub">
                  <span className="text-sm font-medium">GitHub</span>
                </a>
              </div>
            </div>

            {/* Product */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Product</h3>
              <ul className="space-y-3">
                <li><Link href="/features" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Features</Link></li>
                <li><Link href="/pricing" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Pricing</Link></li>
                <li><Link href="/security" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Security</Link></li>
                <li><Link href="/integrations" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Integrations</Link></li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Company</h3>
              <ul className="space-y-3">
                <li><Link href="/about" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">About</Link></li>
                <li><Link href="/contact" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Contact</Link></li>
                <li><Link href="/partners" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Partners</Link></li>
                <li><Link href="/press" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Press</Link></li>
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Resources</h3>
              <ul className="space-y-3">
                <li><Link href="/docs" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Documentation</Link></li>
                <li><Link href="/api-docs" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">API Reference</Link></li>
                <li><Link href="/support" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Support</Link></li>
                <li><a href="https://status.intelliflow.ai" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Status</a></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Legal</h3>
              <ul className="space-y-3">
                <li><Link href="/privacy" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Terms of Service</Link></li>
                <li><Link href="/cookies" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Cookie Policy</Link></li>
                <li><Link href="/gdpr" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">GDPR</Link></li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="pt-8 border-t border-[#e2e8f0] dark:border-[#334155]">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">&copy; 2025 IntelliFlow CRM. All rights reserved.</p>
              <div className="flex items-center gap-6">
                <Link href="/privacy" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Privacy</Link>
                <Link href="/terms" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Terms</Link>
                <Link href="/cookies" className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] transition-colors">Cookies</Link>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
