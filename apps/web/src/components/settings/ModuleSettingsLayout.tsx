'use client';

import { useState } from 'react';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import Link from 'next/link';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Card,
  Button,
  ConfirmationDialog,
} from '@intelliflow/ui';

export interface ModuleSettingsTab {
  value: string;
  label: string;
  content: React.ReactNode;
}

export interface ModuleSettingsBreadcrumb {
  label: string;
  href?: string;
}

export interface ModuleSettingsLayoutProps {
  title: string;
  description: string;
  breadcrumbs: ModuleSettingsBreadcrumb[];
  tabs: ModuleSettingsTab[];
  onSave: () => Promise<void>;
  onReset: () => Promise<void>;
  isSaving?: boolean;
  isDirty?: boolean;
  lastUpdated?: Date | null;
  extraSidebarContent?: React.ReactNode;
  /** Fixed-position detail panel that slides in from the right (e.g., ComplementarySidebar) */
  complementarySidebar?: React.ReactNode;
}

export function ModuleSettingsLayout({
  title,
  description,
  breadcrumbs,
  tabs,
  onSave,
  onReset,
  isSaving = false,
  isDirty = false,
  lastUpdated,
  extraSidebarContent,
  complementarySidebar,
}: Readonly<ModuleSettingsLayoutProps>) {
  const { timezone } = useTimezoneContext();
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const handleReset = async () => {
    await onReset();
    setResetDialogOpen(false);
  };

  return (
    <div className="max-w-7xl">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {breadcrumbs.map((crumb, index) => (
            <li key={crumb.label} className="flex items-center gap-1.5">
              {index > 0 && (
                <span className="material-symbols-outlined text-xs" aria-hidden="true">
                  chevron_right
                </span>
              )}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-foreground transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-foreground font-medium">{crumb.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Tabs — 2/3 width */}
        <div className="lg:col-span-2">
          {tabs.length > 0 && (
            <Tabs defaultValue={tabs[0].value}>
              <TabsList>
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {tabs.map((tab) => (
                <TabsContent key={tab.value} value={tab.value} className="mt-4">
                  {tab.content}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>

        {/* Sidebar — 1/3 width */}
        <div className="lg:col-span-1">
          <div className="sticky top-4 space-y-4">
            <Card className="p-4 space-y-4">
              <Button onClick={onSave} disabled={!isDirty || isSaving} className="w-full">
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <span
                      className="material-symbols-outlined animate-spin text-sm"
                      aria-hidden="true"
                    >
                      progress_activity
                    </span>
                    {' '}Saving...
                  </span>
                ) : (
                  'Save Changes'
                )}
              </Button>

              <Button variant="outline" onClick={() => setResetDialogOpen(true)} className="w-full">
                Reset to Defaults
              </Button>

              {lastUpdated && (
                <p className="text-xs text-muted-foreground text-center">
                  Last updated{' '}
                  {lastUpdated.toLocaleDateString('en-GB', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: timezone,
                  })}
                </p>
              )}
            </Card>

            {extraSidebarContent}
          </div>
        </div>
      </div>

      <ConfirmationDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        title="Reset to Defaults"
        description="This will restore all settings to their factory defaults. This action cannot be undone."
        confirmLabel="Reset"
        variant="destructive"
        onConfirm={handleReset}
      />

      {complementarySidebar}
    </div>
  );
}
