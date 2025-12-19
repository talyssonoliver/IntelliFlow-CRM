# IntelliFlow CRM - Technical References

This directory contains technical documentation and references for the tech stack used in IntelliFlow CRM.

## Purpose

The Model Context Protocol (MCP) uses this directory to provide AI agents with accurate, up-to-date information about:
- Next.js 16 App Router patterns
- React 19 Server Components
- tRPC v11 API conventions
- Prisma + Supabase integration
- TypeScript best practices

## Structure

```
references/
├── nextjs-16/           # Next.js 16 specific patterns
├── react-19/            # React 19 Server Components
├── trpc-v11/            # tRPC v11 API setup
├── prisma-supabase/     # Database integration
└── typescript/          # TypeScript conventions
```

## Adding References

When adding new references:
1. Create a subdirectory for the technology
2. Include practical examples and patterns
3. Focus on project-specific implementations
4. Keep documentation concise and actionable

## MCP Integration

This directory is exposed to Claude via MCP filesystem server, allowing Phase 1 (Architect) of the orchestrator to:
- Read local documentation
- Understand project conventions
- Generate context-aware task implementations
- Avoid hallucinations about framework APIs
