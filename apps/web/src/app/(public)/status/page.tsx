import type { Metadata } from 'next';
import { Card } from '@intelliflow/ui';
import { StatusMonitor } from '@/components/status/status-monitor';

export const metadata: Metadata = {
  title: 'System Status | IntelliFlow CRM',
  description: 'Real-time system status and incident history for IntelliFlow CRM services.',
  openGraph: {
    title: 'IntelliFlow CRM System Status',
    description: 'Check the current operational status of all IntelliFlow services.',
    type: 'website',
  },
};

// Status type for services
type ServiceStatus = 'operational' | 'degraded' | 'partial_outage' | 'major_outage';

interface Service {
  id: string;
  name: string;
  description: string;
  status: ServiceStatus;
  uptime: number;
}

// Service definitions
const services: Service[] = [
  {
    id: 'api',
    name: 'API',
    description: 'Core tRPC API endpoints',
    status: 'operational',
    uptime: 99.99,
  },
  {
    id: 'web',
    name: 'Web Application',
    description: 'Next.js frontend application',
    status: 'operational',
    uptime: 99.98,
  },
  {
    id: 'ai-worker',
    name: 'AI Services',
    description: 'Lead scoring, predictions, and AI assistants',
    status: 'operational',
    uptime: 99.95,
  },
  {
    id: 'database',
    name: 'Database',
    description: 'PostgreSQL via Supabase',
    status: 'operational',
    uptime: 99.99,
  },
  {
    id: 'auth',
    name: 'Authentication',
    description: 'Supabase Auth services',
    status: 'operational',
    uptime: 99.99,
  },
  {
    id: 'webhooks',
    name: 'Webhooks',
    description: 'Outbound webhook delivery',
    status: 'operational',
    uptime: 99.90,
  },
  {
    id: 'email',
    name: 'Email Delivery',
    description: 'Transactional email services',
    status: 'operational',
    uptime: 99.95,
  },
  {
    id: 'storage',
    name: 'File Storage',
    description: 'Document and attachment storage',
    status: 'operational',
    uptime: 99.99,
  },
];

// Recent incidents
const incidents = [
  {
    id: 'inc-2025-12-28',
    title: 'Increased API latency',
    status: 'resolved',
    severity: 'minor',
    startedAt: '2025-12-28T14:30:00Z',
    resolvedAt: '2025-12-28T15:15:00Z',
    affectedServices: ['api'],
    updates: [
      { time: '2025-12-28T14:30:00Z', message: 'Investigating increased response times on API endpoints.' },
      { time: '2025-12-28T14:45:00Z', message: 'Identified root cause as database connection pool saturation.' },
      { time: '2025-12-28T15:00:00Z', message: 'Deployed fix to increase connection pool size.' },
      { time: '2025-12-28T15:15:00Z', message: 'Response times back to normal. Monitoring continues.' },
    ],
  },
  {
    id: 'inc-2025-12-20',
    title: 'Scheduled maintenance',
    status: 'completed',
    severity: 'maintenance',
    startedAt: '2025-12-20T02:00:00Z',
    resolvedAt: '2025-12-20T04:30:00Z',
    affectedServices: ['database', 'api'],
    updates: [
      { time: '2025-12-20T02:00:00Z', message: 'Beginning scheduled database migration.' },
      { time: '2025-12-20T04:30:00Z', message: 'Maintenance completed successfully.' },
    ],
  },
];

function getOverallStatus(serviceList: Service[]) {
  const hasOutage = serviceList.some((s) => s.status === 'major_outage');
  const hasDegraded = serviceList.some((s) => s.status === 'degraded' || s.status === 'partial_outage');

  if (hasOutage) return { status: 'major_outage', label: 'Major Outage', color: 'red' };
  if (hasDegraded) return { status: 'degraded', label: 'Partial Degradation', color: 'yellow' };
  return { status: 'operational', label: 'All Systems Operational', color: 'green' };
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export default function StatusPage() {
  const overall = getOverallStatus(services);

  return (
    <main id="main-content" className="bg-slate-50 dark:bg-slate-900 min-h-screen">
      {/* Hero Section */}
      <section className={`py-12 ${
        overall.color === 'green' ? 'bg-green-600' :
        overall.color === 'yellow' ? 'bg-yellow-500' : 'bg-red-600'
      }`}>
        <div className="container px-4 lg:px-6 mx-auto max-w-4xl text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className={`material-symbols-outlined text-4xl text-white`} aria-hidden="true">
              {overall.color === 'green' ? 'check_circle' :
               overall.color === 'yellow' ? 'warning' : 'error'}
            </span>
            <h1 className="text-3xl lg:text-4xl font-bold text-white">
              {overall.label}
            </h1>
          </div>
          <p className="text-white/90">
            Last updated: {formatDate(new Date().toISOString())}
          </p>
        </div>
      </section>

      {/* Real-time Monitor */}
      <section aria-labelledby="monitor-heading" className="py-12">
        <div className="container px-4 lg:px-6 mx-auto max-w-4xl">
          <h2 id="monitor-heading" className="sr-only">Service Status Monitor</h2>
          <StatusMonitor services={services} />
        </div>
      </section>

      {/* Service Details */}
      <section aria-labelledby="services-heading" className="py-12 bg-white dark:bg-slate-800">
        <div className="container px-4 lg:px-6 mx-auto max-w-4xl">
          <h2 id="services-heading" className="text-xl font-bold text-slate-900 dark:text-white mb-6">
            Service Status
          </h2>
          <div className="space-y-3">
            {services.map((service) => (
              <Card
                key={service.id}
                className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-3 h-3 rounded-full ${
                        service.status === 'operational' ? 'bg-green-500' :
                        service.status === 'degraded' ? 'bg-yellow-500' :
                        service.status === 'partial_outage' ? 'bg-orange-500' : 'bg-red-500'
                      }`}
                      aria-hidden="true"
                    />
                    <div>
                      <h3 className="font-medium text-slate-900 dark:text-white">
                        {service.name}
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {service.description}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-medium capitalize ${
                      service.status === 'operational' ? 'text-green-600 dark:text-green-400' :
                      service.status === 'degraded' ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {service.status.replace('_', ' ')}
                    </span>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {service.uptime}% uptime
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Incident History */}
      <section aria-labelledby="incidents-heading" className="py-12">
        <div className="container px-4 lg:px-6 mx-auto max-w-4xl">
          <h2 id="incidents-heading" className="text-xl font-bold text-slate-900 dark:text-white mb-6">
            Recent Incidents
          </h2>
          {incidents.length === 0 ? (
            <Card className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
              <p className="text-slate-600 dark:text-slate-300">
                No recent incidents. All systems have been stable.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {incidents.map((incident) => (
                <Card
                  key={incident.id}
                  className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          incident.severity === 'maintenance' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                          incident.severity === 'minor' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                          incident.severity === 'major' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                          'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {incident.severity}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          incident.status === 'resolved' || incident.status === 'completed' ?
                            'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                            'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        }`}>
                          {incident.status}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                        {incident.title}
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {formatDate(incident.startedAt)}
                        {incident.resolvedAt && ` - ${formatDate(incident.resolvedAt)}`}
                      </p>
                    </div>
                  </div>

                  <div className="border-l-2 border-slate-200 dark:border-slate-700 pl-4 space-y-3">
                    {incident.updates.map((update, idx) => (
                      <div key={idx} className="text-sm">
                        <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">
                          {formatDate(update.time)}
                        </p>
                        <p className="text-slate-700 dark:text-slate-300">
                          {update.message}
                        </p>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Subscribe Section */}
      <section className="py-12 bg-white dark:bg-slate-800">
        <div className="container px-4 lg:px-6 mx-auto max-w-4xl">
          <Card className="p-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              Stay Informed
            </h2>
            <p className="text-slate-600 dark:text-slate-300 mb-4">
              Subscribe to receive notifications about service incidents and maintenance windows.
            </p>
            <form className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <label htmlFor="status-email" className="sr-only">Email address</label>
              <input
                id="status-email"
                type="email"
                placeholder="Enter your email"
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec]"
              />
              <button
                type="submit"
                className="px-6 py-2.5 bg-[#137fec] text-white font-medium rounded-lg hover:bg-[#0e6ac7] transition-colors focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2"
              >
                Subscribe
              </button>
            </form>
          </Card>
        </div>
      </section>
    </main>
  );
}
