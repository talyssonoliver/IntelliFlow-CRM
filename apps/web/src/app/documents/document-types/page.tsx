'use client';

export default function DocumentTypesPage() {
  return (
    <div className="flex flex-1 flex-col p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Document Types</h1>
      <p className="text-muted-foreground mt-1">Manage document categories and classification.</p>
      <div className="mt-8 flex flex-1 items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-muted-foreground/40">
            category
          </span>
          <p className="mt-4 text-sm text-muted-foreground">
            Document types configuration coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
