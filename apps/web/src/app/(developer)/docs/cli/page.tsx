import type { Metadata } from 'next';
import { CliDocs } from '@/components/developer/cli-docs';

export const metadata: Metadata = {
  title: 'CLI Reference | IntelliFlow CRM',
  description:
    'CLI documentation for IntelliFlow CRM — monorepo development commands for setup, testing, database management, and AI development',
};

export default function CliDocsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">CLI Reference</h1>
          <p className="text-muted-foreground mt-1">
            Monorepo development commands for building, testing, and managing the IntelliFlow CRM
            codebase
          </p>
        </div>
        <CliDocs />
      </div>
    </div>
  );
}
