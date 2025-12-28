'use client';

import Link from 'next/link';
import { Card } from '@intelliflow/ui';

const features = [
  {
    title: 'AI Lead Scoring',
    description: 'Automatically score and prioritize leads using advanced machine learning models',
    href: '/leads',
    icon: 'auto_awesome',
    color: 'bg-[#137fec]',
  },
  {
    title: 'Smart Contacts',
    description: 'Manage contacts with AI-powered insights and relationship mapping',
    href: '/contacts',
    icon: 'contacts',
    color: 'bg-indigo-500',
  },
  {
    title: 'Pipeline Analytics',
    description: 'Real-time analytics and forecasting for your sales pipeline',
    href: '/analytics',
    icon: 'trending_up',
    color: 'bg-emerald-500',
  },
];

const quickStats = [
  { label: 'Active Leads', value: '1,248', icon: 'group', trend: '+12%' },
  { label: 'Open Deals', value: '42', icon: 'handshake', trend: '+8%' },
  { label: 'Revenue MTD', value: '$125K', icon: 'payments', trend: '+23%' },
  { label: 'Conversion Rate', value: '32%', icon: 'trending_up', trend: '+5%' },
];

export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f6f7f8] dark:bg-[#101922]">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-[#137fec]/10 to-indigo-500/10 dark:from-[#137fec]/20 dark:to-indigo-500/20">
        <div className="container mx-auto px-6 py-16 lg:py-24">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#137fec]/10 rounded-full mb-6">
              <span className="material-symbols-outlined text-[#137fec]">auto_awesome</span>
              <span className="text-sm font-medium text-[#137fec]">AI-Powered CRM</span>
            </div>

            <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-6">
              Welcome to <span className="text-[#137fec]">IntelliFlow CRM</span>
            </h1>

            <p className="text-lg text-slate-600 dark:text-slate-400 mb-8 max-w-2xl mx-auto">
              AI-powered customer relationship management for intelligent sales automation,
              lead scoring, and pipeline analytics.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#137fec] text-white font-medium rounded-lg hover:bg-[#0e6ac7] transition-colors focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:ring-offset-2"
              >
                <span className="material-symbols-outlined text-lg">dashboard</span>
                Go to Dashboard
              </Link>
              <Link
                href="/leads"
                className="inline-flex items-center gap-2 px-6 py-3 border border-border-light dark:border-border-dark text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-[#2d3a4a] transition-colors"
              >
                <span className="material-symbols-outlined text-lg">group</span>
                View Leads
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="container mx-auto px-6 -mt-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {quickStats.map((stat) => (
            <Card key={stat.label} className="p-6 bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-lg bg-[#137fec]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl text-[#137fec]">{stat.icon}</span>
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600">
                  <span className="material-symbols-outlined text-lg">trending_up</span>
                  {stat.trend}
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{stat.value}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Features Section */}
      <div className="container mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Powerful Features for Modern Sales Teams
          </h2>
          <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Everything you need to manage leads, close deals, and grow your business.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {features.map((feature) => (
            <Link
              key={feature.title}
              href={feature.href}
              className="group block"
            >
              <Card className="p-6 h-full bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark hover:border-ds-primary hover:shadow-lg transition-all">
                <div className={`w-12 h-12 ${feature.color} rounded-lg flex items-center justify-center mb-4`}>
                  <span className="material-symbols-outlined text-2xl text-white">{feature.icon}</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2 group-hover:text-[#137fec] transition-colors">
                  {feature.title}
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm">
                  {feature.description}
                </p>
                <div className="flex items-center gap-1 mt-4 text-[#137fec] text-sm font-medium">
                  <span>Learn more</span>
                  <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* CTA Section */}
      <div className="container mx-auto px-6 pb-16">
        <Card className="p-8 lg:p-12 bg-gradient-to-r from-[#137fec] to-indigo-600 border-0">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-2xl lg:text-3xl font-bold text-white mb-4">
              Ready to transform your sales process?
            </h2>
            <p className="text-white/80 mb-8">
              Start using AI-powered insights to close more deals and grow your business faster.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-[#137fec] font-semibold rounded-lg hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#137fec]"
            >
              <span className="material-symbols-outlined">rocket_launch</span>
              Get Started Now
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
