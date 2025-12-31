'use client';

import Link from 'next/link';
import { Card } from '@intelliflow/ui';

const notificationSettings = [
  { category: 'Email Notifications', items: [
    { label: 'New lead assignments', description: 'Get notified when a lead is assigned to you', enabled: true },
    { label: 'Deal updates', description: 'Notifications about deal stage changes', enabled: true },
    { label: 'Task reminders', description: 'Daily digest of upcoming tasks', enabled: false },
    { label: 'Weekly reports', description: 'Summary of your weekly performance', enabled: true },
  ]},
  { category: 'Push Notifications', items: [
    { label: 'Urgent alerts', description: 'Critical notifications that need immediate attention', enabled: true },
    { label: 'Mentions', description: 'When someone mentions you in a comment', enabled: true },
    { label: 'AI insights', description: 'AI-generated insights and recommendations', enabled: false },
  ]},
];

export default function NotificationsPage() {
  return (
    <div className="p-8">
      <div className="max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <Link href="/settings" className="hover:text-primary">
              Settings
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">Notifications</span>
          </nav>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="text-muted-foreground mt-1">
            Configure your notification preferences
          </p>
        </div>

        {/* Notification Settings */}
        <div className="space-y-6">
          {notificationSettings.map((section) => (
            <Card key={section.category} className="p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">{section.category}</h2>
              <div className="space-y-4">
                {section.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-medium text-foreground">{item.label}</p>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                    <button
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        item.enabled ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                          item.enabled ? 'left-6' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
