'use client';

export default function CalendarSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Calendar Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage defaults, time zones, and display preferences.
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        <span className="material-symbols-outlined text-4xl mb-2 block">tune</span>
        <p>Calendar settings configuration coming soon.</p>
      </div>
    </div>
  );
}
