# Content Audit Framework

## 1. Purpose and Scope

This document defines the content audit framework for IntelliFlow CRM's web application (`apps/web`). The audit inventories all **103 routes** derived from `page.tsx` files, evaluates SEO metadata quality, sitemap coverage, stale content, ghost links, and legal compliance gaps.

### Scope

- **103 routes** across three access tiers:
  - **Tier 1 — Public** (25 routes): Under `(public)/`, no authentication required
  - **Tier 2 — Auth-gated** (73 routes): Require authentication, outside `(public)/` and `(developer)/`
  - **Tier 3 — Developer portal** (5 routes): Under `(developer)/`, require SUPER_ADMIN role
- **Audit type**: Observational only — documents current state and classifies gaps. Does not implement fixes.
- **Data approach**: Static-analysis-first. HTTP measurements for auth-gated routes are deferred to runtime.

## 2. Methodology

### 2.1 Route Inventory (Static — Filesystem Enumeration)

Routes are enumerated by scanning `apps/web/src/app/**/page.tsx` files. Each file path is mapped to its Next.js URL pattern:

1. Strip the `apps/web/src/app` prefix and `/page.tsx` suffix
2. Remove parenthesized route group segments: `(public)`, `(developer)`, `(list)`
3. Retain dynamic segments as-is: `[param]`, `[slug]`, `[id]`, `[token]`
4. Root `page.tsx` maps to `/`

Access tier is determined by the containing route group:
- `(public)/` → `public`
- `(developer)/` → `developer`
- All others → `auth-gated`

### 2.2 SEO Metadata (Static — Metadata Export Chain Analysis)

For each route, the metadata resolution chain is traced:

1. **Page-level**: Check `page.tsx` for `export const metadata` or `export async function generateMetadata`
2. **Layout-level**: Check the nearest `layout.tsx` ancestor for metadata exports
3. **Root-level**: Fall back to `apps/web/src/app/layout.tsx` metadata

For each metadata field, the `source` is recorded as `"page"`, `"layout"`, `"root-layout"`, or `null`.

**Fields measured per route:**

| Field | JSON Key | Pass Condition |
|-------|----------|----------------|
| Page title | `title` | Non-empty, not identical to root default |
| Meta description | `description` | Present, 50–160 characters |
| OG title | `og_title` | Present |
| OG description | `og_description` | Present |
| OG URL | `og_url` | Present (public routes only) |
| OG site name | `og_site_name` | Present |
| OG image | `og_image` | Present (none in codebase currently) |
| Twitter card type | `twitter_card` | Present |
| Twitter title | `twitter_title` | Present |
| Twitter description | `twitter_description` | Present |
| Robots noindex | `robots_noindex` | Auth routes expected to have noindex |

### 2.3 Sitemap Coverage (Static — sitemap.ts Cross-Reference)

Each route is cross-referenced against `apps/web/src/app/sitemap.ts` to determine `in_sitemap` status. The sitemap currently emits 13 static public routes + 2 hardcoded blog slugs = 15 URLs.

Known gaps: partial blog coverage (2 of 6 slugs), missing dynamic route entries (`/careers/[id]`, `/lp/[slug]`).

The `sitemap_last_modified_method` field records how `lastModified` is set: `"dynamic-new-Date"` for the current defective pattern, `null` for routes not in sitemap.

### 2.4 HTTP Status & Response Time (Runtime — Tier 1 Public Only)

For public routes accessible without authentication, HTTP status codes and response times can be measured via HTTP GET requests. For auth-gated and developer routes, these fields are set to `null` with `http_measurement_method: "pending-runtime"`.

This separation ensures no fabricated data appears in the audit (NF-005).

### 2.5 Stale Content Detection (Static — Pattern Matching)

Three detection patterns are applied to page component source code:

1. **Hardcoded data**: Content embedded as JSX that should be CMS-driven (blog posts, job listings, incident data, uptime statistics)
2. **Hardcoded dates/statistics**: Regex scan for years (`202[0-9]`), percentages, currency amounts in JSX strings
3. **Placeholder indicators**: Scan for `TODO`, `FIXME`, `placeholder`, `lorem ipsum`

Classification follows the decision tree in Section 6.

### 2.6 Ghost Link Classification (Reference — Reachability Audit)

28 ghost links identified in `docs/design/navigation-reachability-audit.md` are pre-classified as `ghost-planned` with references to planned remediation tasks (PG-172 through PG-178, Sprint 16). These are navigation targets that exist in the UI but have no corresponding `page.tsx`.

Ghost links are NOT treated as content failures — they are tracked separately in the findings with their planned remediation status.

### 2.7 Legal Compliance Check (Static — GDPR Touchpoints)

The audit checks for the existence of legally required pages referenced by the application:

- `/privacy` — Privacy Policy (referenced by `CookieConsentBanner` in root `layout.tsx`)
- `/terms` — Terms of Service
- `/cookies` — Cookie Policy

Missing pages are classified as `severity: critical` with GDPR Art. 12 implications.

## 3. Dimensions Measured

### 3.1 Quantitative Dimensions

Per-route measurements captured in the audit JSON:

- **SEO metadata fields** (10 fields): title, description, og_title, og_description, og_url, og_site_name, og_image, twitter_card, twitter_title, twitter_description
- **Sitemap inclusion**: boolean `in_sitemap`
- **HTTP status**: integer status code or null
- **Response time**: milliseconds or null
- **SEO score**: integer 0–100 for public routes, null for others
- **Stale content classification**: enum value per route

### 3.2 Qualitative Dimensions

Cross-cutting assessments captured in the findings section:

- **Content freshness**: Hardcoded temporal data that may become stale
- **Placeholder detection**: TODO markers, lorem ipsum, incomplete content
- **Brand consistency**: Title format adherence to `%s | IntelliFlow CRM` template
- **Navigation completeness**: Ghost link coverage relative to sidebar/header navigation
- **Legal compliance**: Presence of required legal pages

## 4. Scoring Criteria

### 4.1 SEO Score (0–100, Public Pages Only)

Applied only to routes with `access_tier: "public"`. Auth-gated and developer routes receive `seo_score: null`.

| Criterion | Points | Condition |
|-----------|--------|-----------|
| Title present and unique | +20 | Non-empty, differs from root layout default |
| Description 50–160 chars | +20 | Present with length in range |
| OG title + description | +20 | Both `og_title` and `og_description` present |
| OG url + siteName | +10 | Both `og_url` and `og_site_name` present |
| Twitter card complete | +15 | `twitter_card`, `twitter_title`, and `twitter_description` all present |
| In sitemap | +10 | Route appears in `sitemap.ts` output |
| No OG image | −5 | Global deduction (no `og:image` anywhere in codebase) |

**Maximum possible**: 95 (100 − 5 for missing og:image)

### 4.2 Content Freshness Score

Not scored numerically. Classification enum per Section 6: `static-by-design`, `static-by-design-dated`, `stale`.

### 4.3 Navigation Completeness Score

Derived from ghost link count: 28 navigation targets without corresponding pages, tracked for remediation in Sprint 16.

## 5. Audit Report Schema (JSON)

### Top-Level Structure

```json
{
  "generated_at": "ISO-8601 timestamp",
  "tool_version": "1.0.0",
  "routes": [ /* RouteEntry[] */ ],
  "summary": { /* AuditSummary */ },
  "findings": {
    "critical": [ /* Finding[] */ ],
    "high": [ /* Finding[] */ ],
    "medium": [ /* Finding[] */ ],
    "low": [ /* Finding[] */ ],
    "ghost_links": [ /* GhostLinkFinding[] */ ]
  }
}
```

### RouteEntry Schema

```json
{
  "route": "/pricing",
  "file_path": "apps/web/src/app/(public)/pricing/page.tsx",
  "access_tier": "public | auth-gated | developer",
  "metadata": {
    "title": { "value": "string | null", "source": "page | layout | root-layout | null" },
    "description": { "value": "string | null", "source": "...", "length": 0 },
    "og_title": { "value": "string | null", "source": "..." },
    "og_description": { "value": "string | null", "source": "..." },
    "og_url": { "value": "string | null", "source": "..." },
    "og_site_name": { "value": "string | null", "source": "..." },
    "og_image": { "value": "string | null", "source": "..." },
    "twitter_card": { "value": "string | null", "source": "..." },
    "twitter_title": { "value": "string | null", "source": "..." },
    "twitter_description": { "value": "string | null", "source": "..." },
    "robots_noindex": false
  },
  "seo_score": "integer 0-100 | null",
  "in_sitemap": true,
  "sitemap_last_modified_method": "dynamic-new-Date | null",
  "http_status": "integer | null",
  "response_time_ms": "number | null",
  "http_measurement_method": "measured | pending-runtime",
  "stale_content": {
    "classification": "static-by-design | static-by-design-dated | stale | not-applicable",
    "patterns_found": [],
    "data_sources": []
  },
  "ghost_links": [],
  "broken_inpage_links": [],
  "notes": ""
}
```

### AuditSummary Schema

```json
{
  "total_routes": 103,
  "public_routes": 25,
  "auth_gated_routes": 73,
  "developer_routes": 5,
  "routes_with_seo_score": 25,
  "routes_pending_runtime_measurement": 78,
  "average_seo_score_public": 0,
  "legal_pages_missing": ["privacy", "terms", "cookies"],
  "ghost_link_count": 28
}
```

### Finding Schema

```json
{
  "id": "F-001",
  "type": "missing_page | broken_link | config_defect | metadata_gap | stale_content",
  "severity": "critical | high | medium | low",
  "description": "Descriptive text with file:line references",
  "file": "optional file path",
  "route": "optional route path",
  "remediation": "Planned task reference or action"
}
```

### GhostLinkFinding Schema

```json
{
  "ghost_link_id": "G-01",
  "route": "/billing/usage",
  "severity": "high | medium | low",
  "planned_task": "PG-172",
  "description": "Navigation target without page implementation"
}
```

## 6. Stale Content Detection Rules

### 6.1 Static-by-Design vs Stale

Decision tree for classifying content freshness:

1. **Data sourced from `@/data/*.json` or similar data files** → `static-by-design`
   - Intentionally static content that does not require CMS
   - Examples: feature descriptions, pricing tiers, team bios

2. **Content containing temporal facts** (years, version numbers, dated statistics) → `static-by-design-dated`
   - Static content that includes time-sensitive data
   - Flagged for periodic review but not treated as stale
   - Examples: "Founded in 2024", "99.9% uptime in 2025"

3. **Content matching placeholder patterns** → `stale`
   - `TODO`, `FIXME`, `HACK` markers in rendered content
   - `lorem ipsum` text
   - `placeholder` attribute values rendered as content
   - Empty sections with no meaningful content

### 6.2 Detection Patterns

| Pattern | Regex | Classification |
|---------|-------|---------------|
| Year references | `202[0-9]` | static-by-design-dated |
| Percentage stats | `\d+(\.\d+)?%` in JSX strings | static-by-design-dated |
| Currency amounts | `\$[\d,]+` in JSX strings | static-by-design-dated |
| TODO markers | `TODO\|FIXME\|HACK` | stale |
| Placeholder text | `lorem ipsum\|placeholder` (case-insensitive) | stale |
| Data file import | `from '@/data/` | static-by-design |

## 7. Re-Audit Cadence

### Automated (Structural)

Triggered on every PR that modifies files matching:
- `apps/web/src/app/**/page.tsx`
- `apps/web/src/app/**/layout.tsx`
- `apps/web/src/app/sitemap.ts`

Automated checks verify:
- Route count matches `summary.total_routes` (TR-002 snapshot test)
- New routes have required metadata fields
- Sitemap coverage for new public routes

### Manual (Qualitative)

Quarterly review covering:
- Content freshness assessment for `static-by-design-dated` entries
- Brand consistency review for title/description copy
- Legal page status update
- Ghost link remediation progress

## 8. Remediation Priority Matrix

| Severity | Finding | Description | Sprint | Task |
|----------|---------|-------------|--------|------|
| **Critical** | F-001/F-002/F-003 | Missing legal pages (`/privacy`, `/terms`, `/cookies`) — GDPR Art. 12 risk | 17 | PG-050, PG-051, PG-052 |
| **High** | F-004 | `/press/[id]` broken in-page link — 404 for users | 15 | PG-179 |
| **High** | F-005 | Lighthouse SEO at `warn` not `error` — no CI enforcement | 15 | IFC-208 |
| **High** | F-006 | No `og:image` on any page — degrades social sharing | 15 | IFC-208 |
| **High** | G-01–G-03 | Ghost links to billing subpages | 16 | PG-172 |
| **Medium** | F-007 | `sitemap.ts` `lastModified: new Date()` — pollutes crawl signals | 15 | IFC-209 |
| **Medium** | F-008 | Sitemap missing 4/6 blog slugs | 15 | IFC-209 |
| **Medium** | F-009 | Dynamic routes missing from sitemap | 15 | IFC-209 |
| **Medium** | G-04–G-10 | Ghost links to ticket/notification subpages | 16 | PG-173, PG-174 |
| **Low** | F-010 | `/pricing` metadata incomplete | 15 | IFC-210 |
| **Low** | F-011 | `/about`, `/features` missing OG/Twitter tags | 15 | IFC-210 |
| **Low** | F-012 | Auth-flow pages with no metadata | 15 | IFC-210 |
| **Low** | G-11–G-28 | Ghost links to settings/analytics subpages | 16 | PG-175–PG-178 |

### Audit Automation

| Task | Description | Sprint |
|------|-------------|--------|
| DOC-014 | Automated content audit script — regenerates `content-audit-results.json` from filesystem, integrates as CI check on route-modifying PRs | 15 |
