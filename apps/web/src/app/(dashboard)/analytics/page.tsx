import { PageHeader } from '@/components/shared/page-header';

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="AI-powered insights and sales pipeline analytics"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Analytics' }]}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <MetricCard title="Lead Conversion Rate" value="32%" trend="+5.2%" description="Conversion from qualified to closed" />
        <MetricCard title="Average Deal Size" value="$24,500" trend="+12%" description="Mean opportunity value" />
        <MetricCard title="Sales Cycle" value="28 days" trend="-3 days" description="Average time to close" />
        <MetricCard title="AI Score Accuracy" value="94%" trend="+2%" description="Lead scoring prediction accuracy" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg border bg-card p-6">
          <h3 className="text-lg font-semibold mb-4">Pipeline Overview</h3>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            <p>Chart visualization will be integrated here</p>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <h3 className="text-lg font-semibold mb-4">Top AI Recommendations</h3>
          <div className="space-y-3">
            <Rec title="Follow up with TechCorp" desc="High-value opportunity" priority="high" />
            <Rec title="Re-engage Startup.io" desc="Score increased +15" priority="medium" />
            <Rec title="Schedule demo for DataCo" desc="Optimal window detected" priority="low" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, trend, description }: { title: string; value: string; trend: string; description: string }) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <p className="text-sm text-muted-foreground">{title}</p>
      <div className="flex items-baseline space-x-2 mt-2 mb-1">
        <p className="text-3xl font-bold">{value}</p>
        <span className="text-sm font-medium text-green-600">{trend}</span>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Rec({ title, desc, priority }: { title: string; desc: string; priority: string }) {
  const colors: Record<string, string> = { high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' };
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium">{title}</p>
        <span className={`text-xs px-2 py-0.5 rounded-full ${colors[priority]}`}>{priority}</span>
      </div>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}
