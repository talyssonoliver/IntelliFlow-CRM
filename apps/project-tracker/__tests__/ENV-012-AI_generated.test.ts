import { describe, it, expect, vi, beforeEach, afterEach, expectTypeOf } from 'vitest';

// Strict types for the command help structure
type SuggestedCommand = Readonly<{
  label: string;
  command: string;
}>;

type CommandGroup = Readonly<{
  title: string;
  items: ReadonlyArray<SuggestedCommand>;
}>;

type GenerateRunHelpOptions = Readonly<{
  cwd?: string;
  groups?: ReadonlyArray<CommandGroup>;
}>;

type Deps = Readonly<{
  getCwd: () => string;
}>;

type GenerateRunHelp = (options?: GenerateRunHelpOptions) => string;

// Default groups exactly as specified in the provided specification text
const defaultGroups: ReadonlyArray<CommandGroup> = [
  {
    title: 'Development Commands',
    items: [
      { label: 'Start the project tracker', command: 'pnpm --filter project-tracker dev' },
      { label: 'Start all apps', command: 'pnpm run dev' },
      { label: 'Run tests', command: 'pnpm run test' },
      { label: 'Build the project', command: 'pnpm run build' },
    ],
  },
  {
    title: 'Metrics & Sync Commands',
    items: [
      { label: 'Sync metrics from CSV', command: 'cd ../.. && npx tsx scripts/sync-metrics.ts' },
      { label: 'View metrics dashboard', command: 'Open http://localhost:3002/' },
    ],
  },
  {
    title: 'Database Commands',
    items: [
      { label: 'Run migrations', command: 'pnpm run db:migrate' },
      { label: 'Open Prisma Studio', command: 'pnpm run db:studio' },
      { label: 'Seed database', command: 'pnpm run db:seed' },
    ],
  },
  {
    title: 'Other Commands',
    items: [
      { label: 'Type checking', command: 'pnpm run typecheck' },
      { label: 'Linting', command: 'pnpm run lint' },
      { label: 'Format code', command: 'pnpm run format' },
    ],
  },
];

// Type assertions: ensure we keep strict structure
expectTypeOf(defaultGroups).toMatchTypeOf<ReadonlyArray<CommandGroup>>();
expectTypeOf(defaultGroups[0].items[0]).toMatchTypeOf<SuggestedCommand>();

// A small, self-contained implementation of the formatter per the specification.
// This exists purely to verify the requirements with strict typing and mocks.
function createGenerateRunHelp(deps: Deps): GenerateRunHelp {
  return (options?: GenerateRunHelpOptions): string => {
    let cwd: string;
    try {
      cwd = (options?.cwd ?? deps.getCwd()).trim();
    } catch (err) {
      throw new Error('Failed to resolve current directory');
    }

    if (!cwd) {
      throw new Error('Invalid current directory: empty or whitespace');
    }

    const groups = options?.groups ?? defaultGroups;

    const lines: string[] = [];
    lines.push(
      "I see you want me to run something, but you haven't specified what command or task you'd like me to execute. Based on the current directory (`" +
        cwd +
        '`), here are some common options:'
    );

    if (!groups.length) {
      lines.push('\nNo commands available for this context.');
    } else {
      for (const group of groups) {
        lines.push('\n**' + group.title + ':**');
        for (const item of group.items) {
          const isLink = item.command.startsWith('Open http') || item.command.startsWith('http');
          const commandRendered = isLink ? item.command : `\`${item.command}\``;
          lines.push(`- ${item.label}: ${commandRendered}`);
        }
      }
    }

    lines.push(
      '\nWhat would you like me to run? Please specify the command or task you need help with.'
    );

    return lines.join('\n');
  };
}

describe('ENV-012: AI-generated run-help message', () => {
  const metricsCwd = '/mnt/c/taly/intelliFlow-CRM/apps/project-tracker/docs/metrics';

  let getCwdMock: ReturnType<typeof vi.fn<[], string>>;
  let generateRunHelp: GenerateRunHelp;

  beforeEach(() => {
    getCwdMock = vi.fn<[], string>().mockReturnValue(metricsCwd);
    generateRunHelp = createGenerateRunHelp({ getCwd: getCwdMock });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path: renders full help for metrics cwd with all sections and commands', () => {
    const msg = generateRunHelp({ cwd: metricsCwd });

    // Preamble and current directory
    expect(msg).toContain("I see you want me to run something, but you haven't specified");
    expect(msg).toContain(`Based on the current directory (\`${metricsCwd}\`)`);

    // Section titles
    expect(msg).toContain('**Development Commands:**');
    expect(msg).toContain('**Metrics & Sync Commands:**');
    expect(msg).toContain('**Database Commands:**');
    expect(msg).toContain('**Other Commands:**');

    // Specific commands exactly as specified (commands are code-formatted except the URL open)
    expect(msg).toContain('- Start the project tracker: `pnpm --filter project-tracker dev`');
    expect(msg).toContain('- Start all apps: `pnpm run dev`');
    expect(msg).toContain('- Run tests: `pnpm run test`');
    expect(msg).toContain('- Build the project: `pnpm run build`');

    expect(msg).toContain('- Sync metrics from CSV: `cd ../.. && npx tsx scripts/sync-metrics.ts`');
    expect(msg).toContain('- View metrics dashboard: Open http://localhost:3002/');

    expect(msg).toContain('- Run migrations: `pnpm run db:migrate`');
    expect(msg).toContain('- Open Prisma Studio: `pnpm run db:studio`');
    expect(msg).toContain('- Seed database: `pnpm run db:seed`');

    expect(msg).toContain('- Type checking: `pnpm run typecheck`');
    expect(msg).toContain('- Linting: `pnpm run lint`');
    expect(msg).toContain('- Format code: `pnpm run format`');

    // Closing question
    expect(msg).toMatch(/What would you like me to run\?/);

    // Dependency was not used since cwd provided, but ensure type-safety
    expectTypeOf(generateRunHelp).toMatchTypeOf<GenerateRunHelp>();
  });

  it('uses dependency to resolve cwd when not provided (mocked external dep)', () => {
    const msg = generateRunHelp();
    expect(getCwdMock).toHaveBeenCalledTimes(1);
    expect(msg).toContain(`(\`${metricsCwd}\`)`);
  });

  it('edge case: unknown cwd still renders all sections with that cwd', () => {
    const unknown = '/tmp/somewhere-else';
    const msg = generateRunHelp({ cwd: unknown });
    expect(msg).toContain(`(\`${unknown}\`)`);
    expect(msg).toContain('**Development Commands:**');
    expect(msg).toContain('**Other Commands:**');
  });

  it('edge case: no groups -> shows placeholder', () => {
    const msg = generateRunHelp({ cwd: metricsCwd, groups: [] });
    expect(msg).toContain('No commands available for this context.');
  });

  it('error handling: throws for empty cwd', () => {
    expect(() => generateRunHelp({ cwd: '   ' })).toThrowError(/Invalid current directory/);
  });

  it('error handling: wraps dependency failures resolving cwd', () => {
    const badDeps = createGenerateRunHelp({
      getCwd: () => {
        throw new Error('OS error');
      },
    });
    expect(() => badDeps()).toThrowError(/Failed to resolve current directory/);
  });

  it('type safety: CommandGroup and SuggestedCommand remain strictly typed', () => {
    // Ensure we keep readonly guarantees and shapes
    expectTypeOf<CommandGroup['title']>().toEqualTypeOf<string>();
    expectTypeOf<CommandGroup['items']>().toMatchTypeOf<ReadonlyArray<SuggestedCommand>>();
    expectTypeOf<SuggestedCommand>().toMatchTypeOf<{ label: string; command: string }>();
  });
});
