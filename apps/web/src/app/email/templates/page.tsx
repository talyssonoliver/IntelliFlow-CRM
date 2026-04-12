'use client';

export default function EmailTemplatesPage() {
  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Templates</h1>
        <p className="text-muted-foreground mt-1">Create and manage reusable email templates.</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        <span className="material-symbols-outlined text-4xl mb-2 block">draft</span>
        <p>Email templates coming soon.</p>
      </div>
    </div>
  );
}
