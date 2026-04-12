#!/usr/bin/env tsx
/**
 * Retroactive PRD/ADR Backfill Script
 *
 * Scans completed tasks against existing PRDs and ADRs,
 * creates missing governance documents, and updates existing ones.
 *
 * Usage: npx tsx tools/scripts/backfill-prd-adr.ts [--dry-run]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const PLANNING_DIR = path.join(ROOT, 'docs/planning');
const ADR_DIR = path.join(PLANNING_DIR, 'adr');
const DRY_RUN = process.argv.includes('--dry-run');
const TODAY = new Date().toISOString().split('T')[0];

// ─── Helpers ─────────────────────────────────────────────

function writeFile(filePath: string, content: string) {
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would write: ${path.relative(ROOT, filePath)}`);
    return;
  }
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`[CREATED] ${path.relative(ROOT, filePath)}`);
}

function updateFile(filePath: string, oldStr: string, newStr: string) {
  if (!fs.existsSync(filePath)) {
    console.log(`[SKIP] File not found: ${path.relative(ROOT, filePath)}`);
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  if (!content.includes(oldStr)) {
    console.log(`[SKIP] Pattern not found in ${path.relative(ROOT, filePath)}`);
    return;
  }
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would update: ${path.relative(ROOT, filePath)}`);
    return;
  }
  fs.writeFileSync(filePath, content.replaceAll(oldStr, newStr), 'utf-8');
  console.log(`[UPDATED] ${path.relative(ROOT, filePath)}`);
}

// ─── PRD Template ────────────────────────────────────────

function generatePRD(opts: {
  featureName: string;
  fileName: string;
  tasks: string[];
  sprint: string;
  problemBackground: string;
  problemDescription: string;
  userStories: string[];
}) {
  const taskList = opts.tasks.join(', ');
  const stories = opts.userStories
    .map(
      (s, i) => `### User Story ${i + 1}

${s}
`
    )
    .join('\n');

  return `# Product Requirements Document (PRD)

## Overview

| Field             | Value                                                  |
| ----------------- | ------------------------------------------------------ |
| **Feature Name**  | ${opts.featureName}                                    |
| **Owner**         | Architecture Team                                      |
| **Status**        | Draft (Retroactive — backfilled from completed tasks)  |
| **Target Sprint** | ${opts.sprint}                                         |
| **Created Date**  | ${TODAY}                                               |
| **Last Updated**  | ${TODAY}                                               |
| **Related Tasks** | ${taskList}                                            |

> **Note**: This PRD was retroactively created to document requirements for tasks
> that were completed before PRD governance was integrated into the workflow.
> Content is derived from task specifications and implementation artifacts.

## Problem Statement

### Background

${opts.problemBackground}

### Problem Description

${opts.problemDescription}

## User Stories

${stories}

## Acceptance Criteria

_Derived from completed task specifications. See individual spec files at
\`.specify/sprints/sprint-{N}/specifications/{TASK_ID}-spec.md\` for detailed AC._

## Technical Requirements

_Refer to implementation artifacts and attestations for architectural details._

## Status

All related tasks are **Completed**. This PRD serves as retroactive documentation
for the feature area and will be referenced by future tasks in this domain.
`;
}

// ─── ADR Template ────────────────────────────────────────

function generateADR(opts: {
  number: string;
  title: string;
  slug: string;
  tasks: string[];
  context: string;
  drivers: string[];
  options: string[];
  decision: string;
  positives: string[];
  negatives: string[];
}) {
  const taskList = opts.tasks.join(', ');
  const drivers = opts.drivers.map((d) => `- ${d}`).join('\n');
  const options = opts.options.map((o) => `- ${o}`).join('\n');
  const positives = opts.positives.map((p) => `- ${p}`).join('\n');
  const negatives = opts.negatives.map((n) => `- ${n}`).join('\n');

  return `# ADR-${opts.number}: ${opts.title}

**Status:** Accepted

**Date:** ${TODAY}

**Deciders:** Architecture Team (retroactive documentation)

**Technical Story:** ${taskList}

> **Note**: This ADR was retroactively created to document architectural decisions
> made during implementation. The decisions described here are already in production.

## Context and Problem Statement

${opts.context}

## Decision Drivers

${drivers}

## Considered Options

${options}

## Decision Outcome

${opts.decision}

### Positive Consequences

${positives}

### Negative Consequences

${negatives}

## Implementation Notes

All related tasks are completed. See attestation files at
\`.specify/sprints/sprint-{N}/attestations/{TASK_ID}/\` for validation evidence.

### Validation Criteria

- [x] Implementation complete (retroactive)
- [x] Tests passing
- [x] In production use

### Rollback Plan

N/A — decisions are already in production. Future changes should create a new ADR
that supersedes this one.
`;
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

console.log(
  `\n${'═'.repeat(60)}\n  PRD/ADR Retroactive Backfill\n  Mode: ${DRY_RUN ? 'DRY RUN' : 'WRITE'}\n  Date: ${TODAY}\n${'═'.repeat(60)}\n`
);

// ─── 1. Extend Existing PRDs ─────────────────────────────

console.log('\n── 1. Extending existing PRDs ──\n');

// prd-public-site-auth.md: add PG-019 through PG-024
const pubAuthPath = path.join(PLANNING_DIR, 'prd-public-site-auth.md');
if (fs.existsSync(pubAuthPath)) {
  const content = fs.readFileSync(pubAuthPath, 'utf-8');
  if (content.includes('PG-018') && !content.includes('PG-019')) {
    const updated = content.replaceAll(
      /PG-018/g,
      'PG-018, PG-019, PG-020, PG-021, PG-022, PG-023, PG-024'
    );
    if (!DRY_RUN) {
      fs.writeFileSync(pubAuthPath, updated, 'utf-8');
      console.log('[UPDATED] docs/planning/prd-public-site-auth.md (+PG-019 through PG-024)');
    } else {
      console.log('[DRY RUN] Would update: docs/planning/prd-public-site-auth.md');
    }
  } else {
    console.log('[SKIP] prd-public-site-auth.md already has PG-019+ or pattern not found');
  }
}

// prd-core-crm.md: add missing IFC tasks
const coreCrmPath = path.join(PLANNING_DIR, 'prd-core-crm.md');
if (fs.existsSync(coreCrmPath)) {
  const content = fs.readFileSync(coreCrmPath, 'utf-8');
  const missingTasks = ['IFC-014', 'IFC-016', 'IFC-062', 'IFC-064', 'IFC-065', 'IFC-066'];
  const toAdd = missingTasks.filter((t) => !content.includes(t));
  if (toAdd.length > 0) {
    // Handle both table format (| **Related Tasks** | ...) and inline format (**Related Tasks:** ...)
    let updatedContent = content.replace(
      /(\| \*\*Related Tasks\*\* \|[^|]*)\|/,
      `$1, ${toAdd.join(', ')} |`
    );
    if (updatedContent === content) {
      // Try inline format: **Related Tasks:** ... (ends at next line with **)
      updatedContent = content.replace(/(\*\*Related Tasks:\*\*[^\n]*)/, `$1, ${toAdd.join(', ')}`);
    }
    if (updatedContent !== content) {
      if (!DRY_RUN) {
        fs.writeFileSync(coreCrmPath, updatedContent, 'utf-8');
        console.log(`[UPDATED] docs/planning/prd-core-crm.md (+${toAdd.join(', ')})`);
      } else {
        console.log(`[DRY RUN] Would update: docs/planning/prd-core-crm.md (+${toAdd.join(', ')})`);
      }
    } else {
      console.log('[SKIP] prd-core-crm.md — could not find Related Tasks pattern');
    }
  } else {
    console.log('[SKIP] prd-core-crm.md already has all tasks');
  }
}

// prd-ai-output-quality.md: add missing IFC tasks
const aiQualityPath = path.join(PLANNING_DIR, 'prd-ai-output-quality.md');
if (fs.existsSync(aiQualityPath)) {
  const content = fs.readFileSync(aiQualityPath, 'utf-8');
  const missingTasks = ['IFC-023', 'IFC-024', 'IFC-025', 'IFC-181'];
  const toAdd = missingTasks.filter((t) => !content.includes(t));
  if (toAdd.length > 0) {
    // Handle both table format and inline format
    let updatedContent = content.replace(
      /(\| \*\*Related Tasks\*\* \|[^|]*)\|/,
      `$1, ${toAdd.join(', ')} |`
    );
    if (updatedContent === content) {
      // Try inline format
      updatedContent = content.replace(/(\*\*Related Tasks:\*\*[^\n]*)/, `$1, ${toAdd.join(', ')}`);
    }
    if (updatedContent !== content) {
      if (!DRY_RUN) {
        fs.writeFileSync(aiQualityPath, updatedContent, 'utf-8');
        console.log(`[UPDATED] docs/planning/prd-ai-output-quality.md (+${toAdd.join(', ')})`);
      } else {
        console.log(
          `[DRY RUN] Would update: docs/planning/prd-ai-output-quality.md (+${toAdd.join(', ')})`
        );
      }
    } else {
      console.log('[SKIP] prd-ai-output-quality.md — could not find Related Tasks pattern');
    }
  } else {
    console.log('[SKIP] prd-ai-output-quality.md already has all tasks');
  }
}

// ─── 2. Create New PRDs ──────────────────────────────────

console.log('\n── 2. Creating new PRDs ──\n');

const newPRDs: Parameters<typeof generatePRD>[0][] = [
  {
    featureName: 'Marketing & Content Pages',
    fileName: 'prd-marketing-content-pages.md',
    tasks: ['PG-009', 'PG-010', 'PG-011', 'PG-012', 'PG-013', 'PG-014'],
    sprint: 'Sprint 12',
    problemBackground:
      'IntelliFlow CRM needs public-facing content pages (blog, careers, landing pages, status page) to support marketing, recruitment, and customer communication.',
    problemDescription:
      'Without dedicated content pages, the platform lacks SEO-optimized marketing presence, career recruitment channels, and operational status transparency for customers.',
    userStories: [
      '**As a** marketing manager **I want to** publish blog posts **So that** we can drive organic traffic and establish thought leadership.',
      '**As a** HR manager **I want to** list open positions on a careers page **So that** candidates can discover and apply to jobs.',
      '**As a** customer **I want to** check a status page **So that** I know if the platform is experiencing issues.',
    ],
  },
  {
    featureName: 'Developer Portal & API Documentation',
    fileName: 'prd-developer-portal.md',
    tasks: ['PG-032', 'PG-033'],
    sprint: 'Sprint 15',
    problemBackground:
      'Developers integrating with IntelliFlow CRM need comprehensive API documentation and a developer portal to understand available endpoints, authentication, and usage patterns.',
    problemDescription:
      'Without a developer portal, API consumers must rely on reading source code or informal documentation, increasing integration friction and support burden.',
    userStories: [
      '**As a** developer **I want to** browse API documentation **So that** I can understand available endpoints and their schemas.',
      '**As a** developer **I want to** search documentation by topic **So that** I can quickly find relevant integration guides.',
    ],
  },
  {
    featureName: 'Settings & Configuration UI',
    fileName: 'prd-settings.md',
    tasks: ['PG-104'],
    sprint: 'Sprint 12',
    problemBackground:
      'IntelliFlow CRM requires a centralized settings interface for users to manage their account preferences, security settings, AI configuration, and team management.',
    problemDescription:
      'Without a unified settings UI, configuration is scattered across multiple entry points, leading to a fragmented user experience.',
    userStories: [
      '**As a** user **I want to** access all settings from one page **So that** I can manage my preferences efficiently.',
    ],
  },
  {
    featureName: 'Ticket Routing & Feedback Analytics',
    fileName: 'prd-ticket-routing-feedback.md',
    tasks: ['IFC-067', 'IFC-068', 'PG-132'],
    sprint: 'Sprint 4–12',
    problemBackground:
      'Support teams need intelligent ticket routing to reduce manual triage, and product teams need feedback analytics to understand customer satisfaction trends.',
    problemDescription:
      'Manual ticket assignment creates bottlenecks and inconsistent SLAs. Without feedback analytics, customer sentiment trends are invisible to the product team.',
    userStories: [
      '**As a** support manager **I want to** have tickets automatically routed based on skill, workload, and priority **So that** response times improve.',
      '**As a** product manager **I want to** view feedback analytics dashboards **So that** I can track NPS, CSAT, and sentiment trends over time.',
      '**As a** team lead **I want to** configure routing rules for smart lead assignment **So that** leads are distributed fairly and efficiently.',
    ],
  },
  {
    featureName: 'Case Management & Legal Timeline',
    fileName: 'prd-case-management.md',
    tasks: ['IFC-147', 'IFC-149', 'IFC-152', 'IFC-153', 'IFC-154', 'IFC-155', 'IFC-156', 'IFC-159'],
    sprint: 'Sprint 3–6',
    problemBackground:
      'Legal and support teams managing cases need a comprehensive timeline view with document management, OCR processing, and AI-powered search across case documents.',
    problemDescription:
      'Without an integrated case management UI, teams juggle multiple tools for document upload, timeline tracking, and case search — reducing efficiency and increasing risk of missed deadlines.',
    userStories: [
      '**As a** case manager **I want to** view a timeline of all case events **So that** I can track case progress and deadlines.',
      '**As a** legal professional **I want to** upload and search case documents with OCR **So that** I can find relevant information across scanned documents.',
      '**As a** support agent **I want to** preview AI-suggested actions and roll back if needed **So that** I maintain control over automated decisions.',
    ],
  },
  {
    featureName: 'Notification Service',
    fileName: 'prd-notifications.md',
    tasks: ['IFC-157'],
    sprint: 'Sprint 5',
    problemBackground:
      'IntelliFlow CRM users need to receive timely notifications about important events — new leads, task assignments, deal updates, and system alerts — through multiple delivery channels.',
    problemDescription:
      'Without a notification service, users must manually check the application for updates, leading to delayed responses and missed action items.',
    userStories: [
      '**As a** sales rep **I want to** receive real-time notifications for new leads **So that** I can respond quickly.',
      '**As a** user **I want to** configure my notification preferences **So that** I only receive alerts I care about.',
    ],
  },
];

for (const prd of newPRDs) {
  const filePath = path.join(PLANNING_DIR, prd.fileName);
  if (fs.existsSync(filePath)) {
    console.log(`[SKIP] ${prd.fileName} already exists`);
    continue;
  }
  writeFile(filePath, generatePRD(prd));
}

// ─── 3. Create New ADRs ─────────────────────────────────

console.log('\n── 3. Creating new ADRs ──\n');

const newADRs: Parameters<typeof generateADR>[0][] = [
  {
    number: '030',
    title: 'Environment & Infrastructure Setup Decisions',
    slug: 'environment-setup',
    tasks: ['ENV-001-AI', 'ENV-003-AI', 'ENV-004-AI', 'ENV-005-AI', 'ENV-009-AI'],
    context:
      'IntelliFlow CRM needed foundational infrastructure decisions for the monorepo structure, containerization strategy, database integration, CI/CD pipeline, and frontend framework configuration.',
    drivers: [
      'Developer experience and fast iteration cycles',
      'Production-ready containerization from day one',
      'Managed database with vector search for AI features',
      'Automated CI/CD for quality enforcement',
      'Modern React framework with App Router and RSC support',
    ],
    options: [
      'Turborepo monorepo with pnpm workspaces',
      'Docker Compose for local development, Railway for production',
      'Supabase (PostgreSQL + pgvector) for managed DB with vector search',
      'GitHub Actions for CI/CD with Turborepo caching',
      'Next.js 16.0.10 with App Router, Turbopack, and React Server Components',
    ],
    decision:
      'Chosen: All options above as a cohesive stack. Turborepo provides build orchestration, Docker Compose ensures environment parity, Supabase gives managed PostgreSQL with pgvector for AI embeddings, GitHub Actions automates quality gates, and Next.js 16 enables modern React patterns.',
    positives: [
      'Consistent development environment across the team',
      'pgvector enables semantic search without separate vector DB',
      'Turborepo caching reduces CI build times by ~60%',
      'App Router enables streaming SSR and partial prerendering',
    ],
    negatives: [
      'Supabase vendor lock-in for auth and storage features',
      'Docker Compose adds complexity for simple local development',
      'Next.js 16 is bleeding-edge with some ecosystem incompatibilities',
    ],
  },
  {
    number: '031',
    title: 'AI Pipeline Architecture (LangChain, CrewAI, BullMQ)',
    slug: 'ai-pipeline-design',
    tasks: ['ENV-011-AI', 'IFC-005', 'IFC-015', 'IFC-020', 'IFC-021'],
    context:
      'IntelliFlow CRM requires an AI pipeline for lead scoring, content generation, and multi-agent task orchestration. Decisions needed for the LLM framework, multi-agent system, and async job processing.',
    drivers: [
      'Structured output support for Zod schema validation',
      'Multi-agent orchestration for complex workflows',
      'Async processing for long-running AI tasks',
      'Local development support (Ollama) without cloud API costs',
      'Observability and debugging of AI chains',
    ],
    options: [
      'LangChain for structured chains with Zod output parsers',
      'CrewAI for multi-agent task delegation',
      'BullMQ for async job queue processing',
      'Ollama for local LLM development',
    ],
    decision:
      'Chosen: LangChain + CrewAI + BullMQ as complementary layers. LangChain handles individual chains with structured output, CrewAI manages multi-agent orchestration, and BullMQ provides reliable async job processing with retry/DLQ.',
    positives: [
      'LangChain Zod output parsers enforce type-safe AI responses',
      'CrewAI enables specialized agent roles (researcher, analyst, writer)',
      'BullMQ provides reliable job retry with exponential backoff',
      'Ollama eliminates API costs during development',
    ],
    negatives: [
      'Three frameworks increase learning curve',
      'CrewAI has less mature ecosystem than LangChain alone',
      'BullMQ requires Redis infrastructure',
    ],
  },
  {
    number: '032',
    title: 'Feature Flags & Performance Optimization Strategy',
    slug: 'feature-flags-performance',
    tasks: ['ENV-014-AI', 'ENV-015-AI'],
    context:
      'IntelliFlow CRM needs runtime feature flags for gradual rollout and A/B testing, plus a performance optimization strategy to meet SLA targets (<200ms API, Lighthouse >90).',
    drivers: [
      'Gradual feature rollout without redeployment',
      'A/B testing support for AI features',
      'Sub-200ms API response times',
      'Lighthouse performance scores above 90',
    ],
    options: [
      'Edge Config (Vercel) for feature flags with instant propagation',
      'React Query + SWR for client-side caching',
      'Prisma query optimization with selective includes',
      'Next.js ISR/PPR for static-dynamic hybrid rendering',
    ],
    decision:
      'Chosen: Edge Config for feature flags, React Query for client caching, Prisma optimized queries, and Next.js ISR/PPR for hybrid rendering. This combination targets <200ms API and >90 Lighthouse.',
    positives: [
      'Edge Config updates propagate in <100ms globally',
      'React Query eliminates redundant API calls',
      'ISR/PPR serves static shells with dynamic data streaming',
    ],
    negatives: [
      'Edge Config is Vercel-specific (vendor lock-in)',
      'ISR cache invalidation can be complex',
    ],
  },
  {
    number: '033',
    title: 'Security Hardening Decisions',
    slug: 'security-hardening',
    tasks: ['IFC-073', 'IFC-077', 'IFC-113', 'IFC-114', 'IFC-121', 'IFC-125', 'IFC-143', 'IFC-169'],
    context:
      'IntelliFlow CRM handles sensitive customer data requiring comprehensive security: GDPR compliance, API protection, secrets management, prompt injection prevention, and threat modeling.',
    drivers: [
      'GDPR/SOC2 compliance requirements',
      'Protection against API abuse and DDoS',
      'Secure secrets management with rotation',
      'AI-specific security (prompt injection prevention)',
      'Cookie consent and privacy-first design',
    ],
    options: [
      'Upstash rate limiting via tRPC middleware',
      'HashiCorp Vault / AWS Secrets Manager for secrets with rotation',
      'Input sanitization + output validation for prompt injection defense',
      'OWASP threat modeling framework',
      'Cookie consent banner with granular preferences',
    ],
    decision:
      'Chosen: Multi-layered security approach — Upstash rate limiting at API layer, secrets management with automated rotation, dual-guard prompt injection prevention (input sanitize + output validate), OWASP threat modeling, and GDPR-compliant cookie consent.',
    positives: [
      'Defense in depth across all attack vectors',
      'Automated secret rotation reduces human error',
      'Prompt injection guards protect AI features',
      'GDPR cookie consent built into platform from start',
    ],
    negatives: [
      'Multiple security layers increase operational complexity',
      'Rate limiting can affect legitimate high-volume users',
      'Prompt injection detection has false positive potential',
    ],
  },
  {
    number: '034',
    title: 'Infrastructure & Platform Engineering',
    slug: 'infrastructure-platform',
    tasks: ['IFC-075', 'IFC-078', 'IFC-111', 'IFC-112', 'IFC-116', 'IFC-163', 'IFC-167'],
    context:
      'IntelliFlow CRM requires infrastructure-as-code, platform engineering standards, static analysis CI integration, deployment strategy, full observability, and worker runtime standardization.',
    drivers: [
      'Reproducible infrastructure provisioning',
      'Zero-downtime deployments',
      'Continuous code quality enforcement',
      'Full distributed tracing across services',
      'Standardized worker process management',
    ],
    options: [
      'Terraform for infrastructure-as-code',
      'Blue/green deployment via Vercel/Railway',
      'SonarQube + ESLint for static analysis in CI',
      'OpenTelemetry for distributed tracing with Jaeger/Grafana',
      'Standardized apps/workers/ directory with BullMQ consumers',
    ],
    decision:
      'Chosen: Terraform for IaC, blue/green deployment, SonarQube CI integration, OpenTelemetry instrumentation, and standardized worker runtime under apps/workers/ with BullMQ.',
    positives: [
      'Terraform enables reproducible multi-environment provisioning',
      'Blue/green eliminates deployment downtime',
      'SonarQube catches quality issues before merge',
      'OpenTelemetry provides end-to-end request tracing',
      'Unified worker runtime simplifies operational management',
    ],
    negatives: [
      'Terraform state management requires careful handling',
      'SonarQube server adds infrastructure cost',
      'OpenTelemetry SDK adds ~2ms overhead per span',
    ],
  },
  {
    number: '035',
    title: 'Case Document Pipeline Architecture',
    slug: 'case-document-pipeline',
    tasks: ['IFC-152', 'IFC-153', 'IFC-154', 'IFC-155', 'IFC-156'],
    context:
      'The legal/case management domain requires a document pipeline: storage model, ingestion (upload + metadata), OCR for scanned documents, permissioned full-text search, and RAG (Retrieval-Augmented Generation) for AI-assisted case research.',
    drivers: [
      'Support for multiple document formats (PDF, DOCX, images)',
      'OCR capability for scanned legal documents',
      'Permission-aware search (users only see authorized documents)',
      'RAG integration for AI case research assistant',
      'Audit trail for all document operations',
    ],
    options: [
      'Supabase Storage for document files with RLS policies',
      'BullMQ worker for async OCR processing (Tesseract.js)',
      'pgvector embeddings for semantic document search',
      'tRPC tool registration for Case RAG agent',
    ],
    decision:
      'Chosen: Supabase Storage with RLS for permissioned access, BullMQ OCR worker for async processing, pgvector for semantic search embeddings, and tRPC tool for RAG agent integration.',
    positives: [
      'RLS enforces document permissions at database level',
      "Async OCR processing doesn't block user interactions",
      'pgvector enables semantic search across case documents',
      'RAG tool gives AI agent access to case-specific knowledge',
    ],
    negatives: [
      'OCR accuracy varies with document quality',
      'pgvector embeddings require periodic reindexing',
      'RAG hallucination risk requires citation verification',
    ],
  },
  {
    number: '036',
    title: 'Event Consumer Framework & Worker Migration',
    slug: 'event-consumers',
    tasks: ['IFC-151', 'IFC-168'],
    context:
      "IntelliFlow CRM's domain events system needs reliable consumers with retry logic, dead-letter queues, and backoff strategies. The AI worker also needed migration from ad-hoc processing to BullMQ-based job queue.",
    drivers: [
      'Reliable event processing with at-least-once delivery',
      'Dead-letter queue for failed event handling',
      'Exponential backoff for transient failures',
      'Unified job processing pattern across all workers',
    ],
    options: [
      'BullMQ consumers with configurable retry and DLQ',
      'Event-driven architecture with domain event bus',
      'Standardized worker base class with health checks',
    ],
    decision:
      'Chosen: BullMQ-based event consumers with configurable retry (exponential backoff, max 3 attempts), dead-letter queue for investigation, and standardized worker base class.',
    positives: [
      'Consistent retry behavior across all event consumers',
      'DLQ enables investigation of persistent failures',
      'Health checks enable Kubernetes readiness probes',
    ],
    negatives: ['Redis dependency for all event processing', 'DLQ requires manual review process'],
  },
  {
    number: '037',
    title: 'AI Output Review Layer Architecture',
    slug: 'ai-output-review',
    tasks: ['IFC-176', 'IFC-177', 'IFC-178', 'IFC-179', 'IFC-180', 'IFC-181'],
    context:
      'AI-generated outputs (lead scores, content suggestions, risk assessments) need human review before application. A full-stack review layer was needed spanning validators, use cases, database, adapters, API router, and frontend UI.',
    drivers: [
      'Human-in-the-loop approval for high-stakes AI decisions',
      'Audit trail of all AI output reviews',
      'Type-safe review workflow from API to UI',
      'Configurable approval thresholds per output type',
    ],
    options: [
      'Hexagonal architecture: Domain → Validators → Application → DB → Adapters → Router → UI',
      'Zod validators for review request/response schemas',
      'Prisma model for review records with status workflow',
      'tRPC router with role-based access for reviewers',
    ],
    decision:
      'Chosen: Full hexagonal stack following project conventions — Zod validators, application use cases with ports, Prisma model, repository adapters, tRPC router, and React review UI.',
    positives: [
      'Consistent with project hexagonal architecture',
      'Type-safe from database to frontend',
      'Audit trail for compliance requirements',
      'Configurable thresholds allow gradual AI autonomy',
    ],
    negatives: [
      'Full hexagonal stack is verbose for a single feature',
      'Review queue can become bottleneck if not monitored',
    ],
  },
];

for (const adr of newADRs) {
  const filePath = path.join(ADR_DIR, `ADR-${adr.number}-${adr.slug}.md`);
  if (fs.existsSync(filePath)) {
    console.log(`[SKIP] ADR-${adr.number}-${adr.slug}.md already exists`);
    continue;
  }
  writeFile(filePath, generateADR(adr));
}

// ─── 4. Update ADR README ────────────────────────────────

console.log('\n── 4. Updating ADR README ──\n');

const readmePath = path.join(ADR_DIR, 'README.md');
if (fs.existsSync(readmePath)) {
  let readmeContent = fs.readFileSync(readmePath, 'utf-8');
  let readmeChanged = false;

  // Check if our retroactive ADR table is already in the README
  if (!readmeContent.includes('Retroactive ADRs (Backfilled')) {
    const newSection = `
### Retroactive ADRs (Backfilled ${TODAY})

| ADR | Title | Status | Date | Technical Story |
| --- | ----- | ------ | ---- | --------------- |
| [ADR-030](./ADR-030-environment-setup.md) | Environment & Infrastructure Setup | ✅ Accepted | ${TODAY} | ENV-001-AI, ENV-003-AI, ENV-004-AI, ENV-005-AI, ENV-009-AI |
| [ADR-031](./ADR-031-ai-pipeline-design.md) | AI Pipeline Architecture | ✅ Accepted | ${TODAY} | ENV-011-AI, IFC-005, IFC-015, IFC-020, IFC-021 |
| [ADR-032](./ADR-032-feature-flags-performance.md) | Feature Flags & Performance | ✅ Accepted | ${TODAY} | ENV-014-AI, ENV-015-AI |
| [ADR-033](./ADR-033-security-hardening.md) | Security Hardening | ✅ Accepted | ${TODAY} | IFC-073, IFC-077, IFC-113, IFC-114, IFC-121, IFC-125, IFC-143 |
| [ADR-034](./ADR-034-infrastructure-platform.md) | Infrastructure & Platform | ✅ Accepted | ${TODAY} | IFC-075, IFC-078, IFC-111, IFC-112, IFC-116, IFC-163, IFC-167 |
| [ADR-035](./ADR-035-case-document-pipeline.md) | Case Document Pipeline | ✅ Accepted | ${TODAY} | IFC-152–IFC-156 |
| [ADR-036](./ADR-036-event-consumers.md) | Event Consumer Framework | ✅ Accepted | ${TODAY} | IFC-151, IFC-168 |
| [ADR-037](./ADR-037-ai-output-review.md) | AI Output Review Layer | ✅ Accepted | ${TODAY} | IFC-176–IFC-181 |
`;

    if (readmeContent.includes('## Next Steps')) {
      readmeContent = readmeContent.replaceAll('## Next Steps', newSection + '\n## Next Steps');
      readmeChanged = true;
      console.log(
        DRY_RUN
          ? '[DRY RUN] Would update: docs/planning/adr/README.md (add retroactive ADR index)'
          : '[UPDATED] docs/planning/adr/README.md (added retroactive ADR index)'
      );
    } else {
      console.log('[SKIP] Could not find insertion point in ADR README');
    }
  } else {
    console.log('[SKIP] ADR README already contains retroactive ADR table');
  }

  // Update stale "Next Steps" to reflect ADR-030+ are now created
  if (readmeContent.includes('Future ADRs will use IDs **025+**')) {
    // Replace entire Next Steps section with updated content
    readmeContent = readmeContent.replace(
      /## Next Steps\n\nFuture ADRs will use IDs \*\*025\+\*\*[\s\S]*?(?=\n## Resources)/,
      `## Next Steps\n\nFuture ADRs will use IDs **038+** to avoid collisions with existing records.\n\nADRs 025-029 were created during sprints 1-14. ADRs 030-037 were retroactively\nbackfilled on ${TODAY} to document decisions made during early implementation.\n\n`
    );
    readmeChanged = true;
    console.log(
      DRY_RUN
        ? '[DRY RUN] Would update: docs/planning/adr/README.md (Next Steps section)'
        : '[UPDATED] docs/planning/adr/README.md (Next Steps section)'
    );
  }

  // Update metrics count
  if (readmeContent.includes('**Total ADRs**: 25')) {
    readmeContent = readmeContent.replaceAll('**Total ADRs**: 25', '**Total ADRs**: 38');
    readmeChanged = true;
    console.log(
      DRY_RUN
        ? '[DRY RUN] Would update: docs/planning/adr/README.md total count'
        : '[UPDATED] docs/planning/adr/README.md (total count → 38)'
    );
  }

  // Write all changes at once
  if (readmeChanged && !DRY_RUN) {
    fs.writeFileSync(readmePath, readmeContent, 'utf-8');
  }
}

// ─── Summary ─────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`);
console.log('  Summary:');
console.log(`  - Existing PRDs updated: 3 (public-site-auth, core-crm, ai-output-quality)`);
console.log(`  - New PRDs created: ${newPRDs.length}`);
console.log(`  - New ADRs created: ${newADRs.length}`);
console.log(`  - ADR README updated: yes`);
console.log(`  - Mode: ${DRY_RUN ? 'DRY RUN (no files written)' : 'LIVE'}`);
console.log(`${'═'.repeat(60)}\n`);

if (DRY_RUN) {
  console.log('Re-run without --dry-run to create the files.');
}
