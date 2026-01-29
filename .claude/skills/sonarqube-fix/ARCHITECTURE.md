# SonarQube Fix Agent - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       SonarQube Fix Agent                               │
│                     (Main Orchestrator)                                 │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             │ Coordinates
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│    Quality    │    │   Security    │    │  Automation   │
│     Agent     │    │     Agent     │    │     Agent     │
│               │    │               │    │               │
│ Code Smells   │    │ Vulnerabilities│   │ Pattern Fixes │
│ Complexity    │    │ OWASP Top 10  │    │ Batch Process │
│ Duplication   │    │ Injection     │    │ Auto-Refactor │
└───────┬───────┘    └───────┬───────┘    └───────┬───────┘
        │                    │                    │
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                             │ Uses
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  SonarQube    │    │  Web Search   │    │  Code Search  │
│   MCP Server  │    │   MCP Server  │    │   MCP Server  │
│               │    │               │    │               │
│ Fetch Issues  │    │ Research Best │    │ Find Patterns │
│ Get Rules     │    │  Practices    │    │  in Codebase  │
│ Mark Resolved │    │ Stack Overflow│    │   (ripgrep)   │
└───────────────┘    └───────────────┘    └───────────────┘
```

## Data Flow

```
User Command
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 1: Discovery & Analysis                          │
│                                                         │
│ 1. Fetch SonarQube Issues                              │
│    ├── Try: MCP SonarQube Server                       │
│    └── Fallback: Parse local reports                   │
│                                                         │
│ 2. Categorize Issues                                   │
│    ├── By severity (blocker → info)                    │
│    ├── By type (bug, vulnerability, code_smell)        │
│    ├── By complexity (trivial → complex)               │
│    └── By file/package                                 │
│                                                         │
│ 3. Prioritize                                          │
│    ├── Critical bugs first                             │
│    ├── Security vulnerabilities                        │
│    ├── High-impact code smells                         │
│    └── Low-hanging fruit (quick wins)                  │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 2: Research (if deep-think enabled)              │
│                                                         │
│ For each issue category:                               │
│                                                         │
│ 1. Official Documentation                              │
│    ├── SonarQube rule docs                             │
│    ├── TypeScript handbook                             │
│    ├── OWASP guidelines                                │
│    └── ESLint rules                                    │
│                                                         │
│ 2. Web Search (via MCP or WebSearch tool)              │
│    ├── Search: "[rule] best practices"                 │
│    ├── Search: "[issue] solution TypeScript"           │
│    ├── Filter by: stackoverflow.com, github.com        │
│    └── Limit: Top 10 results                           │
│                                                         │
│ 3. Codebase Search (via Grep/MCP)                      │
│    ├── Find similar patterns                           │
│    ├── Check existing solutions                        │
│    ├── Verify consistency                              │
│    └── Count occurrences                               │
│                                                         │
│ 4. ADR Review                                          │
│    └── Check architecture decision records             │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 3: Sub-Agent Orchestration                       │
│                                                         │
│ Route issues to specialized agents:                    │
│                                                         │
│ Quality Agent ← Code smells, complexity, duplication   │
│ Security Agent ← Vulnerabilities, security hotspots    │
│ Automation Agent ← Trivial fixes, pattern-based        │
│                                                         │
│ Execute in parallel where possible:                    │
│ ├── Quality: 5 complexity issues                       │
│ ├── Security: 2 SQL injection issues                   │
│ └── Automation: 8 unused variable issues               │
│                                                         │
│ Each agent:                                            │
│ 1. Analyzes root cause                                 │
│ 2. Researches solutions                                │
│ 3. Designs fix strategy                                │
│ 4. Generates before/after code                         │
│ 5. Estimates impact & risk                             │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 4: Implementation                                │
│                                                         │
│ If auto-fix disabled (default):                        │
│ ├── Show recommendations                               │
│ ├── Display before/after code                          │
│ ├── Explain rationale with research                    │
│ └── Wait for user approval                             │
│                                                         │
│ If auto-fix enabled:                                   │
│ ├── Create backup of file                              │
│ ├── Apply fix (Edit tool)                              │
│ ├── Run validation pipeline                            │
│ ├── If validation passes → commit                      │
│ └── If validation fails → rollback                     │
│                                                         │
│ Batch Processing:                                      │
│ ├── Process bottom-to-top (preserve line numbers)      │
│ ├── Validate after each fix                            │
│ └── Stop on first failure                              │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 5: Validation Pipeline                           │
│                                                         │
│ For each applied fix:                                  │
│                                                         │
│ ✅ 1. TypeScript Check                                 │
│    └── pnpm run typecheck                              │
│        (Must pass with zero errors)                    │
│                                                         │
│ ✅ 2. ESLint                                            │
│    └── pnpm run lint                                   │
│        (Must pass linting rules)                       │
│                                                         │
│ ✅ 3. Unit Tests                                        │
│    └── pnpm --filter <package> test                    │
│        (All tests must pass)                           │
│                                                         │
│ ✅ 4. Coverage Check                                    │
│    └── pnpm run test:coverage                          │
│        (Must maintain >90%, domain >95%)               │
│                                                         │
│ ✅ 5. Integration Tests (if API changed)               │
│    └── pnpm run test:integration                       │
│        (E2E scenarios must pass)                       │
│                                                         │
│ ✅ 6. Build                                             │
│    └── pnpm run build                                  │
│        (Full monorepo build must succeed)              │
│                                                         │
│ If any step fails → ROLLBACK                           │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 6: Reporting & Metrics                           │
│                                                         │
│ Generate Report (if --report):                         │
│ ├── Executive summary                                  │
│ ├── Issues fixed (by severity/type)                    │
│ ├── Detailed fix descriptions                          │
│ ├── Research references                                │
│ ├── Before/after code snippets                         │
│ ├── Validation results                                 │
│ ├── Remaining issues                                   │
│ └── Next steps & recommendations                       │
│                                                         │
│ Track Metrics:                                         │
│ ├── Automation rate (automated / total)                │
│ ├── Success rate (successful / attempted)              │
│ ├── Average fix time                                   │
│ ├── Rollback rate                                      │
│ ├── Coverage change                                    │
│ └── Quality score improvement                          │
│                                                         │
│ Save Artifacts:                                        │
│ ├── artifacts/reports/sonarqube-fix-{timestamp}.md     │
│ ├── artifacts/metrics/sonarqube-fixes.json             │
│ └── artifacts/logs/sonarqube-agent.log                 │
└─────────────────────────────────────────────────────────┘
    │
    ▼
Done
```

## Agent Specialization

### Quality Agent

```
┌─────────────────────────────────────────────────────────┐
│                    Quality Agent                        │
│                                                         │
│ Expertise:                                             │
│ • Clean Code Principles (SOLID, DRY, KISS)             │
│ • Refactoring Patterns (Extract Method, Simplify)      │
│ • Cognitive Complexity Reduction                       │
│ • Code Smell Detection                                 │
│                                                         │
│ SonarQube Rules:                                       │
│ • S1541 - Cognitive complexity too high                │
│ • S3776 - Cyclomatic complexity too high               │
│ • S1479 - Too many switch cases                        │
│ • S3358 - Nested ternary operators                     │
│ • S109 - Magic numbers                                 │
│ • S4143 - Duplicate conditions                         │
│                                                         │
│ Refactoring Patterns:                                  │
│ 1. Extract Method                                      │
│    └── Break large functions into smaller ones         │
│ 2. Replace Nested Conditionals                         │
│    └── Use guard clauses, early returns                │
│ 3. Simplify Boolean Logic                              │
│    └── Extract complex conditions to variables         │
│ 4. Replace Magic Numbers                               │
│    └── Extract constants with meaningful names         │
│ 5. Consolidate Switch Cases                            │
│    └── Use strategy pattern or lookup tables           │
│                                                         │
│ DDD Considerations:                                    │
│ • Keep business logic in domain layer                  │
│ • Rich entities, not anemic models                     │
│ • Use value objects for complex validations            │
│ • Respect hexagonal boundaries                         │
└─────────────────────────────────────────────────────────┘
```

### Security Agent

```
┌─────────────────────────────────────────────────────────┐
│                   Security Agent                        │
│                                                         │
│ Expertise:                                             │
│ • OWASP Top 10                                         │
│ • Input Validation & Sanitization                      │
│ • Authentication & Authorization                        │
│ • Cryptography Best Practices                          │
│ • Secure Coding Patterns                               │
│                                                         │
│ SonarQube Rules:                                       │
│ • S2077 - SQL injection risk                           │
│ • S5131 - XSS vulnerability                            │
│ • S5146 - Command injection                            │
│ • S5247 - Weak cryptography                            │
│ • S2245 - Predictable random values                    │
│ • S2631 - ReDoS vulnerability                          │
│                                                         │
│ Security Patterns:                                     │
│ 1. SQL Injection Prevention                            │
│    ├── Parameterized queries (Prisma)                  │
│    ├── Input validation (Zod)                          │
│    └── Least privilege DB user                         │
│ 2. XSS Prevention                                      │
│    ├── Input sanitization (DOMPurify)                  │
│    ├── Output encoding                                 │
│    └── Content Security Policy                         │
│ 3. Authentication Security                             │
│    ├── Strong password hashing (bcrypt)                │
│    ├── Secure JWT (256-bit secret, expiration)         │
│    └── Multi-factor authentication                     │
│ 4. Cryptography                                        │
│    ├── Crypto.randomBytes (not Math.random)            │
│    ├── AES-256 for encryption                          │
│    └── bcrypt for password hashing                     │
│                                                         │
│ OWASP Mapping:                                         │
│ • A03:2021 - Injection → Parameterization              │
│ • A02:2021 - Crypto Failures → Strong algorithms       │
│ • A07:2021 - Auth Failures → MFA, strong passwords     │
│ • A01:2021 - Access Control → RLS, RBAC                │
└─────────────────────────────────────────────────────────┘
```

### Automation Agent

```
┌─────────────────────────────────────────────────────────┐
│                  Automation Agent                       │
│                                                         │
│ Expertise:                                             │
│ • Pattern-Based Refactoring                            │
│ • AST Manipulation (TypeScript Compiler API)           │
│ • Automated Testing & Validation                        │
│ • Rollback Strategies                                  │
│                                                         │
│ SonarQube Rules (Auto-Fixable):                        │
│ • S1481 - Unused variables                             │
│ • S1854 - Unused assignments                           │
│ • S1186 - Empty functions                              │
│ • S1066 - Collapsible if statements                    │
│ • S103 - Line too long                                 │
│ • S4143 - Duplicate conditions                         │
│                                                         │
│ Automation Strategies:                                 │
│ 1. ESLint Auto-Fix                                     │
│    └── eslint --fix <file>                             │
│ 2. Pattern-Based Replacement                           │
│    └── Regex/AST transformation                        │
│ 3. Codemod-Style Transforms                            │
│    └── ts-morph for complex refactoring                │
│                                                         │
│ Fix Classification:                                    │
│ • TRIVIAL - Safe auto-fix (unused vars, formatting)    │
│ • SIMPLE - Pattern-based (duplicate conditions)        │
│ • MODERATE - Requires analysis (extract method)        │
│ • COMPLEX - Human review (business logic)              │
│                                                         │
│ Validation Pipeline:                                   │
│ 1. TypeScript compilation                              │
│ 2. ESLint                                              │
│ 3. Unit tests (affected file)                          │
│ 4. Coverage check                                      │
│ 5. Integration tests (if API changed)                  │
│ 6. Build verification                                  │
│                                                         │
│ Rollback Strategy:                                     │
│ • Git checkout (restore original)                      │
│ • In-memory backup (restore from variable)             │
│ • .bak file (restore from backup)                      │
└─────────────────────────────────────────────────────────┘
```

## MCP Integration Architecture

```
┌─────────────────────────────────────────────────────────┐
│                MCP Server Layer                         │
└─────────────────────────────────────────────────────────┘
         │               │               │               │
         ▼               ▼               ▼               ▼
  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐
  │ SonarQube │  │Web Search │  │Code Search│  │Docs Fetch │
  │    MCP    │  │    MCP    │  │    MCP    │  │    MCP    │
  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
        │              │              │              │
        │ Available?   │ Available?   │ Available?   │ Available?
        │              │              │              │
  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
  │   YES     │  │    YES    │  │    YES    │  │    YES    │
  │  Use MCP  │  │  Use MCP  │  │  Use MCP  │  │  Use MCP  │
  └───────────┘  └───────────┘  └───────────┘  └───────────┘
        │              │              │              │
  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
  │    NO     │  │    NO     │  │    NO     │  │    NO     │
  │ Parse     │  │  Built-in │  │  Built-in │  │  Built-in │
  │  Local    │  │ WebSearch │  │   Grep    │  │ WebFetch  │
  │ Reports   │  │   Tool    │  │   Tool    │  │   Tool    │
  └───────────┘  └───────────┘  └───────────┘  └───────────┘

Graceful Degradation: All MCP servers are optional with fallbacks
```

## Decision Tree: Auto-Fix vs Manual Review

```
                    Issue Detected
                         │
                         ▼
              ┌──────────────────────┐
              │  Classify Complexity │
              └──────────┬───────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    ┌─────────┐    ┌──────────┐   ┌──────────┐
    │ TRIVIAL │    │  SIMPLE  │   │ MODERATE │
    └────┬────┘    └─────┬────┘   └─────┬────┘
         │               │               │
         ▼               ▼               ▼
    Auto-Fix        Pattern-Based    Analyze Risk
    Immediately     Auto-Fix             │
         │               │        ┌──────┴──────┐
         │               │        │             │
         │               │        ▼             ▼
         │               │    Low Risk      High Risk
         │               │        │             │
         │               │        ▼             ▼
         │               │   Auto-Fix      Manual
         │               │   w/ Extra      Review
         │               │   Validation    Required
         │               │        │             │
         └───────┬───────┴────────┘             │
                 │                              │
                 ▼                              ▼
        ┌─────────────────┐          ┌──────────────────┐
        │ Validation Pass │          │ Show             │
        └────────┬────────┘          │ Recommendation   │
                 │                   │ Wait for User    │
                 ▼                   └──────────────────┘
             ✅ Done

TRIVIAL Examples:
- Unused variables
- Formatting issues
- Empty functions

SIMPLE Examples:
- Duplicate conditions
- Collapsible if
- Magic numbers

MODERATE Examples:
- Extract method (complexity)
- Simplify conditionals
- Security fixes (verify)

COMPLEX Examples:
- Business logic changes
- Cross-layer refactoring
- Architecture modifications
```

## Error Handling & Rollback

```
Fix Applied
    │
    ▼
Validation
    │
    ├─────────────┐
    │             │
    ▼             ▼
  PASS          FAIL
    │             │
    │             ▼
    │      ┌──────────────┐
    │      │   Rollback   │
    │      │              │
    │      │ 1. Git       │
    │      │   checkout   │
    │      │              │
    │      │ 2. Restore   │
    │      │   from .bak  │
    │      │              │
    │      │ 3. Log error │
    │      └──────┬───────┘
    │             │
    │             ▼
    │      ┌──────────────┐
    │      │ Classify     │
    │      │ Failure      │
    │      └──────┬───────┘
    │             │
    │      ┌──────┴───────┐
    │      │              │
    │      ▼              ▼
    │  Transient     Persistent
    │      │              │
    │      ▼              ▼
    │   Retry       Escalate to
    │  (max 3)         Human
    │      │              │
    │      └──────┬───────┘
    │             │
    │             ▼
    │      Continue with
    │      Next Issue
    │             │
    └─────────────┘
         │
         ▼
    All Issues
    Processed
         │
         ▼
    Generate
    Report
```

## Metrics & Reporting Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Metrics Collection                     │
└─────────────────────────────────────────────────────────┘
    │
    ├─ Automation Metrics
    │  ├── total_issues
    │  ├── automated_fixes
    │  ├── automation_rate
    │  ├── success_rate
    │  ├── avg_fix_time
    │  └── rollback_rate
    │
    ├─ Quality Metrics
    │  ├── coverage_before
    │  ├── coverage_after
    │  ├── complexity_reduction
    │  ├── tests_passing
    │  └── build_time
    │
    └─ Security Metrics
       ├── vulnerabilities_fixed
       ├── security_hotspots_resolved
       ├── owasp_compliance
       └── cvss_score_improvement
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│                  Report Generation                      │
└─────────────────────────────────────────────────────────┘
    │
    ├─ Markdown Report
    │  └── artifacts/reports/sonarqube-fix-{timestamp}.md
    │
    ├─ JSON Metrics
    │  └── artifacts/metrics/sonarqube-fixes.json
    │
    └─ Execution Log
       └── artifacts/logs/sonarqube-agent.log
```

## Integration with IntelliFlow CRM

```
┌─────────────────────────────────────────────────────────┐
│              IntelliFlow CRM Project                    │
└─────────────────────────────────────────────────────────┘
    │
    ├─ Hexagonal Architecture
    │  ├── Domain Layer (>95% coverage required)
    │  ├── Application Layer (>90% coverage)
    │  └── Adapters Layer (>90% coverage)
    │
    ├─ DDD Principles
    │  ├── Rich domain models
    │  ├── Aggregates, Entities, Value Objects
    │  └── Domain events
    │
    ├─ Type Safety
    │  ├── TypeScript strict mode
    │  ├── Zod schemas
    │  └── tRPC end-to-end types
    │
    └─ Quality Gates
       ├── Test coverage >90%
       ├── TypeScript compilation
       ├── ESLint passing
       └── Build successful
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│           SonarQube Fix Agent Respects:                 │
│                                                         │
│ ✅ Architecture boundaries (no domain → infra deps)     │
│ ✅ DDD patterns (rich models, value objects)            │
│ ✅ Type safety (strict TS, Zod validation)              │
│ ✅ Test coverage thresholds (>90%)                      │
│ ✅ No breaking changes                                  │
│ ✅ Conventional commits                                 │
│ ✅ Performance budgets                                  │
└─────────────────────────────────────────────────────────┘
```

## Summary

The SonarQube Fix Agent is a sophisticated multi-agent system that:

1. **Orchestrates** three specialized sub-agents (Quality, Security, Automation)
2. **Integrates** with MCP servers for enhanced capabilities (with fallbacks)
3. **Researches** solutions via web search and codebase analysis
4. **Validates** all changes through comprehensive testing pipelines
5. **Maintains** project architecture and quality standards
6. **Tracks** detailed metrics for continuous improvement
7. **Escalates** complex issues to human review when needed

All while ensuring zero compromise on quality, security, or architecture principles.
