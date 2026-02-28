'use client';

import { useState } from 'react';
import { DocsSearch } from '@/components/shared/docs-search';
import { DocsNavigation } from '@/components/shared/docs-navigation';
import type { DocCategory } from '@/test/fixtures/docs-data';

const docCategories: DocCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    description:
      'Quick start guides, installation instructions, and first steps with IntelliFlow CRM',
    href: 'https://intelliflow-crm.dev/docs/guides/getting-started',
    icon: 'rocket_launch',
    color: 'bg-blue-500',
    docCount: 5,
    external: true,
  },
  {
    id: 'api-reference',
    title: 'API Reference',
    description: 'Complete tRPC API documentation with 25 routers and 235 typed procedures',
    href: '/docs/api',
    icon: 'api',
    color: 'bg-purple-500',
    docCount: 25,
  },
  {
    id: 'architecture',
    title: 'Architecture',
    description:
      'Hexagonal architecture, DDD bounded contexts, and 25 Architecture Decision Records',
    href: 'https://intelliflow-crm.dev/docs/architecture',
    icon: 'architecture',
    color: 'bg-indigo-500',
    docCount: 25,
    external: true,
  },
  {
    id: 'developer-guides',
    title: 'Developer Guides',
    description:
      'Step-by-step tutorials for building features, testing strategies, and best practices',
    href: 'https://intelliflow-crm.dev/docs/guides',
    icon: 'code',
    color: 'bg-emerald-500',
    docCount: 20,
    external: true,
  },
  {
    id: 'integration-resources',
    title: 'Integration Resources',
    description: 'Webhooks, SDK guides, CLI tools, and authentication integration documentation',
    href: '/docs/integrations',
    icon: 'integration_instructions',
    color: 'bg-amber-500',
    docCount: 16,
  },
  {
    id: 'changelog',
    title: 'Changelog & Updates',
    description: 'Release notes, breaking changes, migration guides, and version history',
    href: '/docs/changelog',
    icon: 'history',
    color: 'bg-violet-500',
    docCount: 7,
  },
];

export default function DocsPage() {
  const [filteredCategories, setFilteredCategories] = useState<DocCategory[]>(docCategories);

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Developer Documentation</h1>
          <p className="text-muted-foreground mt-1">
            Explore guides, API references, and architecture documentation for IntelliFlow CRM
          </p>
        </div>

        <div className="mb-6">
          <DocsSearch categories={docCategories} onFilter={setFilteredCategories} />
        </div>

        <DocsNavigation categories={filteredCategories} />
      </div>
    </div>
  );
}
