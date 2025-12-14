'use client';

import { trpc } from '@/lib/trpc';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              IntelliFlow CRM
            </h1>
            <div className="flex items-center space-x-4">
              <NavLink href="/leads">Leads</NavLink>
              <NavLink href="/contacts">Contacts</NavLink>
              <NavLink href="/analytics">Analytics</NavLink>
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Dashboard
          </h2>
          <p className="text-gray-600 dark:text-gray-300">
            Welcome to your AI-powered CRM dashboard
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <StatCard title="Total Leads" value="--" trend="+12%" />
          <StatCard title="Qualified" value="--" trend="+8%" />
          <StatCard title="Avg Score" value="--" trend="+5%" />
          <StatCard title="Converted" value="--" trend="+15%" />
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Recent Leads
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              Connect API to display recent leads...
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              AI Insights
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              AI-powered recommendations will appear here...
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="text-gray-600 dark:text-gray-300 hover:text-primary transition-colors"
    >
      {children}
    </a>
  );
}

function StatCard({
  title,
  value,
  trend,
}: {
  title: string;
  value: string;
  trend: string;
}) {
  const isPositive = trend.startsWith('+');

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{title}</p>
      <p className="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p
        className={`text-sm mt-2 ${
          isPositive ? 'text-green-600' : 'text-red-600'
        }`}
      >
        {trend} from last month
      </p>
    </div>
  );
}
