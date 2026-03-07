'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent, Card } from '@intelliflow/ui';
import { CLI_COMMAND_GROUPS, getCommandsByGroup } from '@/lib/developer/cli-commands';
import { CliExamples } from '@/components/developer/cli-examples';

function CodeBlock({ code, label }: Readonly<{ code: string; label?: string }>) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silent fallback — clipboard API may be unavailable
    }
  };

  return (
    <div className="relative group">
      {label && <div className="text-xs text-muted-foreground mb-1 font-medium">{label}</div>}
      <pre className="font-mono bg-muted rounded-lg p-4 text-sm overflow-x-auto">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 border border-border text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label={`Copy ${label || 'code'} to clipboard`}
      >
        <span className="material-symbols-outlined text-sm" aria-hidden="true">
          {copied ? 'check' : 'content_copy'}
        </span>
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </div>
  );
}

function CommandTable({
  commands,
}: {
  commands: { command: string; description: string; destructive?: boolean }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 pr-4 font-medium text-foreground">Command</th>
            <th className="text-left py-2 font-medium text-foreground">Description</th>
          </tr>
        </thead>
        <tbody>
          {commands.map((cmd) => (
            <tr key={cmd.command} className="border-b border-border/50">
              <td className="py-2 pr-4">
                <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono">
                  {cmd.command}
                </code>
              </td>
              <td className="py-2 text-muted-foreground">
                {cmd.description}
                {cmd.destructive && (
                  <span className="ml-2 text-yellow-600 dark:text-yellow-400 text-xs font-medium">
                    (destructive)
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverviewTab() {
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="cli-prerequisites">
        <h2 id="cli-prerequisites" className="text-lg font-semibold text-foreground mb-3">
          Prerequisites
        </h2>
        <ul className="list-disc list-inside text-muted-foreground space-y-1">
          <li>Node.js 18 or later</li>
          <li>pnpm package manager</li>
          <li>Docker and Docker Compose</li>
        </ul>
      </section>

      <section aria-labelledby="cli-command-groups">
        <h2 id="cli-command-groups" className="text-lg font-semibold text-foreground mb-3">
          Command Groups
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {CLI_COMMAND_GROUPS.map((group) => (
            <Card key={group.id} className="p-4 h-full">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                  <span
                    className="material-symbols-outlined text-xl text-primary"
                    aria-hidden="true"
                  >
                    {group.icon}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-foreground">{group.title}</span>
                  <p className="text-sm text-muted-foreground mt-0.5">{group.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {group.commands.length} command{group.commands.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function SetupDevTab() {
  const setupCommands = getCommandsByGroup('setup');
  const devCommands = getCommandsByGroup('development');

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="cli-setup">
        <h2 id="cli-setup" className="text-lg font-semibold text-foreground mb-3">
          Environment Setup
        </h2>
        <p className="text-muted-foreground mb-4">
          Initialize your local development environment with these commands.
        </p>
        <CommandTable commands={setupCommands} />
        <div className="mt-4">
          <CodeBlock
            code={`pnpm install
pnpm run setup:local
docker-compose up -d
pnpm run db:migrate
pnpm run db:seed`}
            label="Full setup sequence"
          />
        </div>
      </section>

      <section aria-labelledby="cli-development">
        <h2 id="cli-development" className="text-lg font-semibold text-foreground mb-3">
          Development Commands
        </h2>
        <CommandTable commands={devCommands} />
        <div className="mt-4">
          <CodeBlock code="pnpm run dev" label="Start all applications" />
        </div>
      </section>

      <div
        className="border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950/20 p-4 rounded-r-lg"
        role="note"
      >
        <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
          Typecheck Gotcha
        </p>
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Always use{' '}
          <code className="bg-blue-100 dark:bg-blue-900/40 px-1 py-0.5 rounded">
            pnpm run typecheck
          </code>{' '}
          (Turborepo-scoped) instead of{' '}
          <code className="bg-blue-100 dark:bg-blue-900/40 px-1 py-0.5 rounded">
            npx tsc --noEmit
          </code>{' '}
          which produces ~22K errors from wide scope.
        </p>
      </div>
    </div>
  );
}

function TestingQualityTab() {
  const testCommands = getCommandsByGroup('testing');
  const lintCommands = getCommandsByGroup('lint');

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="cli-testing">
        <h2 id="cli-testing" className="text-lg font-semibold text-foreground mb-3">
          Testing Commands
        </h2>
        <p className="text-muted-foreground mb-4">
          Run unit, integration, and E2E test suites with coverage reporting.
        </p>
        <CommandTable commands={testCommands} />
        <div className="mt-4 flex flex-col gap-3">
          <CodeBlock code="pnpm run test" label="Run all tests" />
          <CodeBlock code="pnpm run test:e2e" label="E2E tests (Playwright)" />
        </div>
      </section>

      <section aria-labelledby="cli-lint">
        <h2 id="cli-lint" className="text-lg font-semibold text-foreground mb-3">
          Linting & Formatting
        </h2>
        <CommandTable commands={lintCommands} />
        <div className="mt-4">
          <CodeBlock code="pnpm run lint:fix" label="Auto-fix lint issues" />
        </div>
      </section>
    </div>
  );
}

function DatabaseTab() {
  const dbCommands = getCommandsByGroup('database');

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="cli-database">
        <h2 id="cli-database" className="text-lg font-semibold text-foreground mb-3">
          Database Commands
        </h2>
        <p className="text-muted-foreground mb-4">
          Prisma-based database management for the PostgreSQL database.
        </p>
        <CommandTable commands={dbCommands} />
      </section>

      <div
        className="border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 p-4 rounded-r-lg"
        role="alert"
      >
        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">
          Destructive Command Warning
        </p>
        <p className="text-sm text-yellow-700 dark:text-yellow-300">
          <code className="bg-yellow-100 dark:bg-yellow-900/40 px-1 py-0.5 rounded">
            pnpm run db:reset
          </code>{' '}
          will <strong>drop and recreate</strong> the entire database. Use with caution — all data
          will be lost. Only use in local development environments.
        </p>
      </div>

      <section aria-labelledby="cli-db-workflow">
        <h2 id="cli-db-workflow" className="text-lg font-semibold text-foreground mb-3">
          Typical Migration Workflow
        </h2>
        <div className="flex flex-col gap-3">
          <CodeBlock
            code={`pnpm run db:migrate:create
# Edit migration SQL
pnpm run db:migrate
pnpm run db:generate`}
            label="Create, edit, apply, and generate"
          />
        </div>
      </section>
    </div>
  );
}

export function CliDocs() {
  return (
    <div data-testid="cli-docs">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="setup">Setup & Dev</TabsTrigger>
          <TabsTrigger value="testing">Testing & Quality</TabsTrigger>
          <TabsTrigger value="database">Database</TabsTrigger>
          <TabsTrigger value="examples">Examples</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="setup">
          <SetupDevTab />
        </TabsContent>

        <TabsContent value="testing">
          <TestingQualityTab />
        </TabsContent>

        <TabsContent value="database">
          <DatabaseTab />
        </TabsContent>

        <TabsContent value="examples">
          <CliExamples />
        </TabsContent>
      </Tabs>
    </div>
  );
}
