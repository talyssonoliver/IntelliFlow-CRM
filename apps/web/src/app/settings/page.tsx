'use client';

import Link from 'next/link';
import { Card } from '@intelliflow/ui';

const settingsCards = [
  {
    title: 'Account',
    description: 'Manage your personal information, password, and security settings',
    href: '/settings/account',
    icon: 'person',
    color: 'bg-blue-500',
  },
  {
    title: 'Team',
    description: 'Invite team members, manage roles, and control access permissions',
    href: '/settings/team',
    icon: 'group',
    color: 'bg-indigo-500',
  },
  {
    title: 'Integrations',
    description: 'Connect third-party apps and services to enhance your workflow',
    href: '/settings/integrations',
    icon: 'extension',
    color: 'bg-purple-500',
  },
  {
    title: 'Notifications',
    description: 'Configure email, push, and in-app notification preferences',
    href: '/settings/notifications',
    icon: 'notifications',
    color: 'bg-amber-500',
  },
  {
    title: 'Governance',
    description: 'Compliance dashboards, ADR registry, and policy management',
    href: '/governance',
    icon: 'policy',
    color: 'bg-emerald-500',
    external: true,
  },
];

export default function SettingsPage() {
  return (
    <div className="p-8">
      <div className="max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your account, team, and application preferences
          </p>
        </div>

        {/* Settings Cards Grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {settingsCards.map((card) => (
            <Link key={card.href} href={card.href} className="group">
              <Card className="p-6 h-full hover:border-primary hover:shadow-md transition-all">
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 ${card.color} rounded-lg flex items-center justify-center flex-shrink-0`}
                  >
                    <span className="material-symbols-outlined text-2xl text-white">
                      {card.icon}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                      {card.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {card.description}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all">
                    chevron_right
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
