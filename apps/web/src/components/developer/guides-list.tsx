'use client';

import Link from 'next/link';
import { Card, Badge } from '@intelliflow/ui';

interface GuideCategory {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  items: GuideItem[];
}

interface GuideItem {
  id: string;
  title: string;
  description: string;
  href: string;
  status: 'available' | 'coming-soon';
  external?: boolean;
}

const GUIDE_CATEGORIES: GuideCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'Quick start guide and initial setup instructions',
    icon: 'rocket_launch',
    color: 'bg-blue-500',
    items: [
      {
        id: 'getting-started',
        title: 'Getting Started',
        description: 'Set up your development environment and build your first feature',
        href: 'https://intelliflow-crm.dev/guides/getting-started',
        status: 'available',
        external: true,
      },
    ],
  },
  {
    id: 'development',
    title: 'Development',
    description: 'Core development workflow and environment setup',
    icon: 'developer_mode',
    color: 'bg-emerald-500',
    items: [
      {
        id: 'development-overview',
        title: 'Development Overview',
        description: 'Architecture overview and development workflow',
        href: 'https://intelliflow-crm.dev/guides/development-overview',
        status: 'coming-soon',
        external: true,
      },
      {
        id: 'local-setup',
        title: 'Local Setup',
        description: 'Configure your local development environment',
        href: 'https://intelliflow-crm.dev/guides/local-setup',
        status: 'coming-soon',
        external: true,
      },
      {
        id: 'environment-variables',
        title: 'Environment Variables',
        description: 'Manage environment configuration across environments',
        href: 'https://intelliflow-crm.dev/guides/environment-variables',
        status: 'coming-soon',
        external: true,
      },
      {
        id: 'database-management',
        title: 'Database Management',
        description: 'Prisma migrations, seeding, and database operations',
        href: 'https://intelliflow-crm.dev/guides/database-management',
        status: 'coming-soon',
        external: true,
      },
    ],
  },
  {
    id: 'testing',
    title: 'Testing',
    description: 'Testing strategies and best practices',
    icon: 'science',
    color: 'bg-violet-500',
    items: [
      {
        id: 'testing-overview',
        title: 'Testing Overview',
        description: 'Testing philosophy and strategy overview',
        href: 'https://intelliflow-crm.dev/guides/testing-overview',
        status: 'coming-soon',
        external: true,
      },
      {
        id: 'unit-testing',
        title: 'Unit Testing',
        description: 'Write effective unit tests with Vitest',
        href: 'https://intelliflow-crm.dev/guides/unit-testing',
        status: 'coming-soon',
        external: true,
      },
      {
        id: 'integration-testing',
        title: 'Integration Testing',
        description: 'Test component interactions and API integrations',
        href: 'https://intelliflow-crm.dev/guides/integration-testing',
        status: 'coming-soon',
        external: true,
      },
      {
        id: 'e2e-testing',
        title: 'E2E Testing',
        description: 'End-to-end testing with Playwright',
        href: 'https://intelliflow-crm.dev/guides/e2e-testing',
        status: 'coming-soon',
        external: true,
      },
    ],
  },
  {
    id: 'ai-development',
    title: 'AI Development',
    description: 'AI integration and LLM development guides',
    icon: 'psychology',
    color: 'bg-amber-500',
    items: [
      {
        id: 'ai-development-guide',
        title: 'AI Development Guide',
        description: 'Build AI-powered features with LangChain and CrewAI',
        href: 'https://intelliflow-crm.dev/guides/ai-development',
        status: 'coming-soon',
        external: true,
      },
      {
        id: 'langchain-setup',
        title: 'LangChain Setup',
        description: 'Configure LangChain for AI agent development',
        href: 'https://intelliflow-crm.dev/guides/langchain-setup',
        status: 'coming-soon',
        external: true,
      },
      {
        id: 'ollama-local',
        title: 'Ollama Local',
        description: 'Run LLMs locally with Ollama for development',
        href: 'https://intelliflow-crm.dev/guides/ollama-local',
        status: 'coming-soon',
        external: true,
      },
    ],
  },
  {
    id: 'deployment',
    title: 'Deployment',
    description: 'Deploy and manage IntelliFlow CRM in production',
    icon: 'cloud_upload',
    color: 'bg-sky-500',
    items: [
      {
        id: 'deployment-overview',
        title: 'Deployment Overview',
        description: 'Deployment strategies and infrastructure overview',
        href: 'https://intelliflow-crm.dev/guides/deployment-overview',
        status: 'coming-soon',
        external: true,
      },
      {
        id: 'docker',
        title: 'Docker',
        description: 'Containerize and deploy with Docker Compose',
        href: 'https://intelliflow-crm.dev/guides/docker',
        status: 'coming-soon',
        external: true,
      },
      {
        id: 'vercel',
        title: 'Vercel',
        description: 'Deploy the frontend to Vercel',
        href: 'https://intelliflow-crm.dev/guides/vercel',
        status: 'coming-soon',
        external: true,
      },
    ],
  },
  {
    id: 'best-practices',
    title: 'Best Practices',
    description: 'Code quality, security, and performance guidelines',
    icon: 'workspace_premium',
    color: 'bg-indigo-500',
    items: [
      {
        id: 'code-style',
        title: 'Code Style',
        description: 'TypeScript coding standards and conventions',
        href: 'https://intelliflow-crm.dev/guides/code-style',
        status: 'coming-soon',
        external: true,
      },
      {
        id: 'git-workflow',
        title: 'Git Workflow',
        description: 'Branching strategy and commit conventions',
        href: 'https://intelliflow-crm.dev/guides/git-workflow',
        status: 'coming-soon',
        external: true,
      },
      {
        id: 'security',
        title: 'Security',
        description: 'Security best practices and vulnerability prevention',
        href: 'https://intelliflow-crm.dev/guides/security',
        status: 'coming-soon',
        external: true,
      },
      {
        id: 'performance',
        title: 'Performance',
        description: 'Performance optimization techniques and monitoring',
        href: 'https://intelliflow-crm.dev/guides/performance',
        status: 'coming-soon',
        external: true,
      },
    ],
  },
  {
    id: 'contributing',
    title: 'Contributing',
    description: 'How to contribute to the IntelliFlow CRM project',
    icon: 'group',
    color: 'bg-rose-500',
    items: [
      {
        id: 'contributing-guide',
        title: 'Contributing Guide',
        description: 'Guidelines for contributing code, docs, and feedback',
        href: 'https://intelliflow-crm.dev/guides/contributing',
        status: 'coming-soon',
        external: true,
      },
    ],
  },
];

function StatusBadge({ status }: Readonly<{ status: 'available' | 'coming-soon' }>) {
  if (status === 'coming-soon') {
    return <Badge variant="warning">Coming Soon</Badge>;
  }
  return null;
}

export function GuidesList() {
  return (
    <div className="flex flex-col gap-8">
      {GUIDE_CATEGORIES.map((category) => {
        if (category.items.length === 0) return null;

        return (
          <section key={category.id} aria-labelledby={`category-${category.id}`}>
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-10 h-10 ${category.color} rounded-lg flex items-center justify-center`}
              >
                <span className="material-symbols-outlined text-xl text-white" aria-hidden="true">
                  {category.icon}
                </span>
              </div>
              <div>
                <h2
                  id={`category-${category.id}`}
                  className="text-lg font-semibold text-foreground"
                >
                  {category.title}
                </h2>
                <p className="text-sm text-muted-foreground">{category.description}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {category.items.map((item) => {
                const isDisabled = item.status === 'coming-soon';
                const isExternal = item.external === true;

                const cardContent = (
                  <Card
                    className={`p-4 h-full transition-all ${
                      isDisabled
                        ? 'opacity-70 cursor-not-allowed'
                        : 'hover:border-primary hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-foreground">{item.title}</span>
                          <StatusBadge status={item.status} />
                        </div>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </div>
                      <span
                        className="material-symbols-outlined text-muted-foreground shrink-0"
                        aria-hidden="true"
                      >
                        chevron_right
                      </span>
                    </div>
                  </Card>
                );

                if (isDisabled) {
                  return (
                    <div key={item.id} aria-disabled="true">
                      {cardContent}
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : Readonly<{}>)}
                    className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
                  >
                    {cardContent}
                    {isExternal && <span className="sr-only">(opens in new tab)</span>}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
