'use client';

import Link from 'next/link';
import { Card } from '@intelliflow/ui';

const integrations = [
  { name: 'Slack', description: 'Team communication', icon: 'chat', connected: true },
  { name: 'Google Calendar', description: 'Calendar sync', icon: 'calendar_today', connected: true },
  { name: 'Salesforce', description: 'CRM sync', icon: 'cloud', connected: false },
  { name: 'HubSpot', description: 'Marketing automation', icon: 'hub', connected: false },
  { name: 'Mailchimp', description: 'Email campaigns', icon: 'mail', connected: false },
  { name: 'Zapier', description: 'Workflow automation', icon: 'bolt', connected: true },
];

export default function IntegrationsPage() {
  return (
    <div className="p-8">
      <div className="max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <Link href="/settings" className="hover:text-primary">
              Settings
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">Integrations</span>
          </nav>
          <h1 className="text-2xl font-bold text-foreground">Integrations</h1>
          <p className="text-muted-foreground mt-1">
            Connect third-party apps and services
          </p>
        </div>

        {/* Integrations Grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {integrations.map((integration) => (
            <Card key={integration.name} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                    <span className="material-symbols-outlined text-2xl text-muted-foreground">
                      {integration.icon}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">{integration.name}</h3>
                    <p className="text-sm text-muted-foreground">{integration.description}</p>
                  </div>
                </div>
                <button
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    integration.connected
                      ? 'bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  }`}
                >
                  {integration.connected ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
