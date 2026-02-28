'use client';

import { useState } from 'react';

function CodeBlock({ code, label }: { code: string; label?: string }) {
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

export function CliExamples() {
  return (
    <div data-testid="cli-examples" className="flex flex-col gap-8">
      <section aria-labelledby="example-initial-setup">
        <h3 id="example-initial-setup" className="text-lg font-semibold text-foreground mb-3">
          Initial Project Setup
        </h3>
        <p className="text-muted-foreground mb-4">
          Get started with the IntelliFlow CRM monorepo from scratch.
        </p>
        <div className="flex flex-col gap-3">
          <CodeBlock
            code={`# Clone the repository
git clone https://github.com/intelliflow/intelliflow-crm.git
cd intelliflow-crm`}
            label="Step 1: Clone"
          />
          <CodeBlock
            code={`# Install dependencies and setup local env
pnpm install
pnpm run setup:local`}
            label="Step 2: Install"
          />
          <CodeBlock
            code={`# Start infrastructure and seed data
docker-compose up -d
pnpm run db:migrate
pnpm run db:seed`}
            label="Step 3: Database"
          />
          <CodeBlock code="pnpm run dev" label="Step 4: Start Dev Server" />
        </div>
      </section>

      <section aria-labelledby="example-tdd-cycle">
        <h3 id="example-tdd-cycle" className="text-lg font-semibold text-foreground mb-3">
          TDD Development Cycle
        </h3>
        <p className="text-muted-foreground mb-4">
          Test-driven development workflow used across the codebase.
        </p>
        <div className="flex flex-col gap-3">
          <CodeBlock code="pnpm run test:watch" label="Step 1: Start Watch Mode" />
          <CodeBlock
            code={`# Write your failing test first, then implement
# Run scoped coverage to verify
npx vitest run src/components/my-feature/__tests__ \\
  --coverage \\
  --coverage.include='src/components/my-feature/**'`}
            label="Step 2: Write Test & Implement"
          />
          <CodeBlock
            code={`# Verify all checks pass
pnpm run typecheck
pnpm run lint
pnpm run build`}
            label="Step 3: Validate"
          />
        </div>
      </section>

      <section aria-labelledby="example-db-migration">
        <h3 id="example-db-migration" className="text-lg font-semibold text-foreground mb-3">
          Database Migration Workflow
        </h3>
        <p className="text-muted-foreground mb-4">
          Creating and applying Prisma schema changes.
        </p>
        <div className="flex flex-col gap-3">
          <CodeBlock
            code="pnpm run db:migrate:create"
            label="Step 1: Create Migration"
          />
          <CodeBlock
            code={`# Edit the migration SQL in packages/db/prisma/migrations/
# Then apply it
pnpm run db:migrate`}
            label="Step 2: Edit & Apply"
          />
          <CodeBlock
            code={`# Regenerate the Prisma client
pnpm run db:generate`}
            label="Step 3: Generate Client"
          />
        </div>
      </section>

      <section aria-labelledby="example-ai-dev">
        <h3 id="example-ai-dev" className="text-lg font-semibold text-foreground mb-3">
          AI Development Setup
        </h3>
        <p className="text-muted-foreground mb-4">
          Running local AI models with Ollama for chain development.
        </p>
        <div className="flex flex-col gap-3">
          <CodeBlock
            code={`# Start the local AI server
ollama serve`}
            label="Step 1: Start Ollama"
          />
          <CodeBlock
            code={`# Pull required models
ollama pull llama2
ollama pull mistral`}
            label="Step 2: Pull Models"
          />
          <CodeBlock
            code={`# Test your chains
pnpm --filter ai-worker test:chains
pnpm run ai:benchmark`}
            label="Step 3: Test & Benchmark"
          />
        </div>
      </section>
    </div>
  );
}
