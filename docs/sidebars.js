/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */

// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  // Main documentation sidebar
  docsSidebar: [
    {
      type: 'doc',
      id: 'index',
      label: 'Introduction',
    },
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started',
        'guides/getting-started',
        'guides/quick-start',
        'guides/installation',
      ],
    },
    {
      type: 'category',
      label: 'Core Concepts',
      collapsed: true,
      items: [
        'concepts/domain-driven-design',
        'concepts/type-safety',
        'concepts/ai-integration',
        'concepts/event-driven-architecture',
      ],
    },
    {
      type: 'category',
      label: 'Implementation',
      collapsed: true,
      items: [
        'implementation/ENV-007-AI-tRPC-API-Setup',
      ],
    },
  ],

  // API documentation sidebar
  apiSidebar: [
    {
      type: 'doc',
      id: 'api/overview',
      label: 'API Overview',
    },
    {
      type: 'doc',
      id: 'api/trpc-routes',
      label: 'tRPC Routes',
    },
    {
      type: 'category',
      label: 'Endpoints',
      collapsed: true,
      items: [
        'api/endpoints/leads',
        'api/endpoints/contacts',
        'api/endpoints/accounts',
        'api/endpoints/opportunities',
        'api/endpoints/tasks',
      ],
    },
    {
      type: 'category',
      label: 'Authentication',
      collapsed: true,
      items: [
        'api/auth/overview',
        'api/auth/supabase',
        'api/auth/api-keys',
      ],
    },
    {
      type: 'category',
      label: 'AI Services',
      collapsed: true,
      items: [
        'api/ai/scoring',
        'api/ai/qualification',
        'api/ai/recommendations',
      ],
    },
  ],

  // Developer guides sidebar
  guidesSidebar: [
    {
      type: 'doc',
      id: 'guides/getting-started',
      label: 'Getting Started',
    },
    {
      type: 'category',
      label: 'Development',
      collapsed: false,
      items: [
        'guides/development',
        'guides/local-setup',
        'guides/environment-variables',
        'guides/database-management',
      ],
    },
    {
      type: 'category',
      label: 'Testing',
      collapsed: true,
      items: [
        'guides/testing',
        'guides/unit-testing',
        'guides/integration-testing',
        'guides/e2e-testing',
      ],
    },
    {
      type: 'category',
      label: 'AI Development',
      collapsed: true,
      items: [
        'guides/ai-development',
        'guides/langchain-setup',
        'guides/ollama-local',
        'guides/ai-testing',
      ],
    },
    {
      type: 'category',
      label: 'Deployment',
      collapsed: true,
      items: [
        'guides/deployment',
        'guides/docker',
        'guides/railway',
        'guides/vercel',
      ],
    },
    {
      type: 'category',
      label: 'Best Practices',
      collapsed: true,
      items: [
        'guides/code-style',
        'guides/git-workflow',
        'guides/security',
        'guides/performance',
      ],
    },
    {
      type: 'doc',
      id: 'guides/contributing',
      label: 'Contributing',
    },
  ],

  // Architecture documentation sidebar
  architectureSidebar: [
    {
      type: 'doc',
      id: 'architecture/overview',
      label: 'Architecture Overview',
    },
    {
      type: 'doc',
      id: 'architecture/repo-layout',
      label: 'Repository Layout',
    },
    {
      type: 'doc',
      id: 'architecture/artifact-conventions',
      label: 'Artifact Conventions',
    },
    {
      type: 'category',
      label: 'System Design',
      collapsed: false,
      items: [
        'architecture/system-design/monorepo',
        'architecture/system-design/hexagonal',
        'architecture/system-design/bounded-contexts',
        'architecture/system-design/event-driven',
      ],
    },
    {
      type: 'category',
      label: 'Domain Model',
      collapsed: true,
      items: [
        'architecture/domain/overview',
        'architecture/domain/entities',
        'architecture/domain/value-objects',
        'architecture/domain/aggregates',
        'architecture/domain/repositories',
      ],
    },
    {
      type: 'category',
      label: 'Technology Stack',
      collapsed: true,
      items: [
        'architecture/stack/frontend',
        'architecture/stack/backend',
        'architecture/stack/database',
        'architecture/stack/ai-ml',
        'architecture/stack/infrastructure',
      ],
    },
    {
      type: 'category',
      label: 'Architecture Decision Records',
      collapsed: true,
      link: {
        type: 'generated-index',
        title: 'Architecture Decision Records',
        description: 'A collection of Architecture Decision Records (ADRs) documenting key architectural decisions in the IntelliFlow CRM project.',
        slug: '/architecture/adr',
      },
      items: [
        'planning/adr/template',
      ],
    },
    {
      type: 'category',
      label: 'Patterns',
      collapsed: true,
      items: [
        'architecture/patterns/repository',
        'architecture/patterns/value-objects',
        'architecture/patterns/domain-events',
        'architecture/patterns/cqrs',
      ],
    },
    {
      type: 'category',
      label: 'Security',
      collapsed: true,
      items: [
        'security/overview',
        'security/authentication',
        'security/authorization',
        'security/data-protection',
      ],
    },
  ],

  // Planning and Sprint documentation
  planningSidebar: [
    {
      type: 'category',
      label: 'Planning',
      collapsed: false,
      items: [
        'planning/roadmap',
        'planning/sprint-overview',
      ],
    },
    {
      type: 'category',
      label: 'Architecture Decision Records',
      collapsed: false,
      items: [
        'planning/adr/template',
      ],
    },
  ],
};

module.exports = sidebars;
