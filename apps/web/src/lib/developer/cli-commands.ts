export type CommandGroup =
  | 'setup'
  | 'development'
  | 'testing'
  | 'database'
  | 'lint'
  | 'lighthouse'
  | 'ai'
  | 'data-sync';

export interface CliCommand {
  id: string;
  command: string;
  description: string;
  group: CommandGroup;
  destructive?: boolean;
}

export interface CliCommandGroup {
  id: CommandGroup;
  title: string;
  description: string;
  icon: string;
  commands: CliCommand[];
}

export const CLI_COMMAND_GROUPS: CliCommandGroup[] = [
  {
    id: 'setup',
    title: 'Environment Setup',
    description: 'Initialize the local development environment',
    icon: 'settings',
    commands: [
      {
        id: 'setup-install',
        command: 'pnpm install',
        description: 'Install dependencies',
        group: 'setup',
      },
      {
        id: 'setup-local',
        command: 'pnpm run setup:local',
        description: 'Setup local environment',
        group: 'setup',
      },
      {
        id: 'setup-docker',
        command: 'docker-compose up -d',
        description: 'Start Docker services (Postgres, Redis, etc.)',
        group: 'setup',
      },
      {
        id: 'setup-migrate',
        command: 'pnpm run db:migrate',
        description: 'Apply database migrations',
        group: 'setup',
      },
      {
        id: 'setup-seed',
        command: 'pnpm run db:seed',
        description: 'Seed database',
        group: 'setup',
      },
    ],
  },
  {
    id: 'development',
    title: 'Development',
    description: 'Start and build applications',
    icon: 'code',
    commands: [
      {
        id: 'dev-all',
        command: 'pnpm run dev',
        description: 'Start all applications',
        group: 'development',
      },
      {
        id: 'dev-web',
        command: 'pnpm --filter web dev',
        description: 'Start frontend only',
        group: 'development',
      },
      {
        id: 'dev-api',
        command: 'pnpm --filter api dev',
        description: 'Start API only',
        group: 'development',
      },
      {
        id: 'dev-ai',
        command: 'pnpm --filter ai-worker dev',
        description: 'Start AI worker only',
        group: 'development',
      },
      {
        id: 'dev-build',
        command: 'pnpm run build',
        description: 'Build all packages',
        group: 'development',
      },
      {
        id: 'dev-typecheck',
        command: 'pnpm run typecheck',
        description: 'Type checking across monorepo (turborepo)',
        group: 'development',
      },
    ],
  },
  {
    id: 'testing',
    title: 'Testing',
    description: 'Run test suites and coverage',
    icon: 'bug_report',
    commands: [
      {
        id: 'test-all',
        command: 'pnpm run test',
        description: 'Run all tests',
        group: 'testing',
      },
      {
        id: 'test-coverage',
        command: 'pnpm run test:unit -- --coverage',
        description: 'Unit tests with coverage',
        group: 'testing',
      },
      {
        id: 'test-integration',
        command: 'pnpm run test:integration',
        description: 'Integration tests',
        group: 'testing',
      },
      {
        id: 'test-e2e',
        command: 'pnpm run test:e2e',
        description: 'E2E tests (Playwright)',
        group: 'testing',
      },
      {
        id: 'test-watch',
        command: 'pnpm run test:watch',
        description: 'Watch mode for TDD',
        group: 'testing',
      },
      {
        id: 'test-filter',
        command: 'pnpm --filter @intelliflow/domain test',
        description: 'Tests for specific package',
        group: 'testing',
      },
    ],
  },
  {
    id: 'database',
    title: 'Database',
    description: 'Prisma database management commands',
    icon: 'database',
    commands: [
      {
        id: 'db-create',
        command: 'pnpm run db:migrate:create',
        description: 'Create new migration',
        group: 'database',
      },
      {
        id: 'db-migrate',
        command: 'pnpm run db:migrate',
        description: 'Apply migrations',
        group: 'database',
      },
      {
        id: 'db-reset',
        command: 'pnpm run db:reset',
        description: 'Reset database (destructive)',
        group: 'database',
        destructive: true,
      },
      {
        id: 'db-studio',
        command: 'pnpm run db:studio',
        description: 'Open Prisma Studio',
        group: 'database',
      },
      {
        id: 'db-generate',
        command: 'pnpm run db:generate',
        description: 'Generate Prisma client',
        group: 'database',
      },
    ],
  },
  {
    id: 'lint',
    title: 'Linting & Formatting',
    description: 'Code quality and formatting tools',
    icon: 'check_circle',
    commands: [
      {
        id: 'lint-all',
        command: 'pnpm run lint',
        description: 'Lint all code',
        group: 'lint',
      },
      {
        id: 'lint-fix',
        command: 'pnpm run lint:fix',
        description: 'Fix linting issues',
        group: 'lint',
      },
      {
        id: 'lint-format',
        command: 'pnpm run format',
        description: 'Format with Prettier',
        group: 'lint',
      },
    ],
  },
  {
    id: 'lighthouse',
    title: 'Performance Auditing',
    description: 'Lighthouse CI performance benchmarks',
    icon: 'speed',
    commands: [
      {
        id: 'lh-all',
        command: 'pnpm run lighthouse',
        description: 'Run against all configured URLs (needs dev server)',
        group: 'lighthouse',
      },
      {
        id: 'lh-ci',
        command: 'pnpm run lighthouse:ci',
        description: 'Filesystem output for CI pipelines',
        group: 'lighthouse',
      },
      {
        id: 'lh-single',
        command:
          'npx lhci autorun --collect.url=http://localhost:3000/email --collect.numberOfRuns=1',
        description: 'Single URL audit',
        group: 'lighthouse',
      },
    ],
  },
  {
    id: 'ai',
    title: 'AI Development',
    description: 'Local AI model and chain development',
    icon: 'psychology',
    commands: [
      {
        id: 'ai-serve',
        command: 'ollama serve',
        description: 'Start Ollama for local AI',
        group: 'ai',
      },
      {
        id: 'ai-pull-llama',
        command: 'ollama pull llama2',
        description: 'Pull Llama 2 model',
        group: 'ai',
      },
      {
        id: 'ai-pull-mistral',
        command: 'ollama pull mistral',
        description: 'Pull Mistral model',
        group: 'ai',
      },
      {
        id: 'ai-test-chains',
        command: 'pnpm --filter ai-worker test:chains',
        description: 'Test AI chains',
        group: 'ai',
      },
      {
        id: 'ai-benchmark',
        command: 'pnpm run ai:benchmark',
        description: 'Benchmark AI performance',
        group: 'ai',
      },
    ],
  },
  {
    id: 'data-sync',
    title: 'Data Sync',
    description: 'Metrics and data synchronization',
    icon: 'sync',
    commands: [
      {
        id: 'sync-api',
        command: 'curl -X POST http://localhost:3002/api/sync-metrics',
        description: 'Sync metrics via API',
        group: 'data-sync',
      },
      {
        id: 'sync-cli',
        command: 'cd apps/project-tracker && npx tsx scripts/sync-metrics.ts',
        description: 'CLI sync',
        group: 'data-sync',
      },
    ],
  },
];

export function getCommandsByGroup(group: CommandGroup): CliCommand[] {
  const found = CLI_COMMAND_GROUPS.find((g) => g.id === group);
  return found ? found.commands : [];
}

export function getAllCommands(): CliCommand[] {
  return CLI_COMMAND_GROUPS.flatMap((g) => g.commands);
}
