'use client';

export default function AnalyticsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <a href="/dashboard" className="text-xl font-bold text-gray-900 dark:text-white">
              IntelliFlow CRM
            </a>
            <div className="flex items-center space-x-4">
              <a href="/leads" className="text-gray-600 dark:text-gray-300">
                Leads
              </a>
              <a href="/contacts" className="text-gray-600 dark:text-gray-300">
                Contacts
              </a>
              <a href="/analytics" className="text-primary font-medium">
                Analytics
              </a>
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Analytics</h2>
          <p className="text-gray-600 dark:text-gray-300">
            AI-powered insights and sales pipeline analytics
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          <MetricCard
            title="Lead Conversion Rate"
            value="32%"
            trend="+5.2%"
            description="Conversion from qualified to closed"
          />
          <MetricCard
            title="Average Deal Size"
            value="$24,500"
            trend="+12%"
            description="Mean opportunity value"
          />
          <MetricCard
            title="Sales Cycle"
            value="28 days"
            trend="-3 days"
            description="Average time to close"
          />
          <MetricCard
            title="AI Score Accuracy"
            value="94%"
            trend="+2%"
            description="Lead scoring prediction accuracy"
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Pipeline Overview
            </h3>
            <div className="h-64 flex items-center justify-center text-gray-400">
              <p>Chart visualization will be integrated here</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Top AI Recommendations
            </h3>
            <div className="space-y-4">
              <RecommendationItem
                title="Follow up with TechCorp"
                description="High-value opportunity showing engagement signals"
                priority="high"
              />
              <RecommendationItem
                title="Re-engage Startup.io"
                description="Lead score increased by 15 points"
                priority="medium"
              />
              <RecommendationItem
                title="Schedule demo for DataCo"
                description="Optimal time window detected"
                priority="low"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function MetricCard({
  title,
  value,
  trend,
  description,
}: {
  title: string;
  value: string;
  trend: string;
  description: string;
}) {
  const isPositive = trend.startsWith('+') || (trend.startsWith('-') && title.includes('Cycle'));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{title}</p>
      <div className="flex items-baseline space-x-2 mb-2">
        <p className="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
        <span className={`text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {trend}
        </span>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );
}

function RecommendationItem({
  title,
  description,
  priority,
}: {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}) {
  const priorityColors = {
    high: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200',
    medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200',
    low: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200',
  };

  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
      <div className="flex items-center justify-between mb-1">
        <h4 className="font-medium text-gray-900 dark:text-white text-sm">{title}</h4>
        <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[priority]}`}>
          {priority}
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );
}
