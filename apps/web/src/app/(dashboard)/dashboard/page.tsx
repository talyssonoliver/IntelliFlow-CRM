import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Welcome to your AI-powered CRM dashboard"
        actions={
          <Link
            href="/leads/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            + New Lead
          </Link>
        }
      />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Leads" value="--" change="+12%" />
        <StatCard title="Qualified Leads" value="--" change="+8%" />
        <StatCard title="Avg AI Score" value="--" change="+5%" />
        <StatCard title="Converted" value="--" change="+15%" />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Leads</h3>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Connect API to display recent leads...</p>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6">
          <h3 className="text-lg font-semibold mb-4">AI Insights</h3>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">AI-powered recommendations will appear here...</p>
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div className="rounded-lg border bg-card p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Activity feed will appear here...</p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, change }: { title: string; value: string; change: string }) {
  const isPositive = change.startsWith('+');
  return (
    <div className="rounded-lg border bg-card p-6">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      <p className={`mt-1 text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {change} from last month
      </p>
    </div>
  );
}
