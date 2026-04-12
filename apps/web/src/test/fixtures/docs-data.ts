/**
 * Documentation category type and fixture data for PG-032 Docs Index.
 * This is the canonical source for DocCategory — all components import from here.
 */

export interface DocCategory {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: string;
  color: string;
  docCount?: number;
  comingSoon?: boolean;
  external?: boolean;
}

export const mockDocsCategories: DocCategory[] = [
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
      'Hexagonal architecture, DDD bounded contexts, and 43 Architecture Decision Records',
    href: '/docs/architecture',
    icon: 'architecture',
    color: 'bg-indigo-500',
    docCount: 43,
  },
  {
    id: 'developer-guides',
    title: 'Developer Guides',
    description:
      'Step-by-step tutorials for building features, testing strategies, and best practices',
    href: '/docs/guides',
    icon: 'code',
    color: 'bg-emerald-500',
    docCount: 20,
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
  {
    id: 'video-tutorials',
    title: 'Video Tutorials',
    description: 'Step-by-step video guides for common CRM workflows and features',
    href: '/docs/videos',
    icon: 'play_circle',
    color: 'bg-rose-500',
    comingSoon: true,
  },
];
