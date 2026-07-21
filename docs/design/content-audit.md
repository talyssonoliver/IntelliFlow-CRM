# Content Audit Framework

> **Last verified**: 2026-07-21 **Generator**:
> `npx tsx tools/scripts/content-audit.ts` **Machine output**:
> `artifacts/reports/content-audit-results.json` **Tool version**: `1.2.0`

> **Canonical counts**: This document is the originating source of the
> `tools/scripts/content-audit.ts` counting rule (see "Canonical counting rule"
> section below). The "Current baseline" numbers immediately below are
> regenerated from a live `runAudit()` run at the verified date — they are the
> filesystem total of `page.tsx` files under `apps/web/src/app/**` (route groups
> stripped, `[id]` collapsed, `app/api/` excluded). Verified: 2026-07-21.

> **Drift enforcement (DOC-016)**: these canonical counts, and the matching
> totals in the six sibling design docs, are enforced on every PR by the
> docs-integrity gate (`tools/scripts/docs-integrity-audit.ts`,
> `.github/workflows/docs-integrity.yml`, and the `docs-integrity` pre-ship
> step). Any doc that drifts from the live `runAudit()` total fails the gate.
> See `docs/runbooks/docs-integrity-gate.md`.

## 1. Purpose and Scope

This document defines the content-audit framework for IntelliFlow CRM's web
application (`apps/web`). It describes how the automated audit is generated,
what it measures, how to interpret the JSON output, and what the current
baseline looks like after the latest regeneration.

The audit is observational. It inventories page entries, evaluates metadata and
sitemap coverage, detects stale-content signals, checks legal-page presence, and
tracks navigation ghost-link status. It does not implement fixes by itself.

### Current baseline

- **Total Pages (filesystem total): 211** — `page.tsx` entries scanned from
  `apps/web/src/app`
- **32 public entries** under `(public)/`
- **165 auth-gated entries** outside `(public)/` and `(developer)/`
- **14 developer entries** under `(developer)/`
- **0 unresolved ghost links** after route-group-aware reconciliation
- **80 average SEO score** across public routes
- **0 missing legal pages** across `/privacy`, `/terms`, `/cookies`

### Canonical counting rule

`summary.total_routes` counts **filesystem `page.tsx` entries**. Route groups
collapse out of the public URL space, so this count can diverge from distinct
URL patterns if duplicate collapsed routes are introduced in future.

Current verified state:

- **209 page entries**
- **209 distinct collapsed route patterns**

## 2. Methodology

### 2.1 Route Inventory (Static — Filesystem Enumeration)

Routes are enumerated by scanning `apps/web/src/app/**/page.tsx`. Each file path
is mapped to its Next.js URL pattern by:

1. Stripping the `apps/web/src/app` prefix and `/page.tsx` suffix
2. Removing parenthesized route groups such as `(public)`, `(developer)`, and
   `(list)`
3. Retaining dynamic segments as-is: `[id]`, `[slug]`, `[token]`, `[param]`
4. Mapping root `page.tsx` to `/`

Access tier is derived from the containing route group:

- `(public)/` -> `public`
- `(developer)/` -> `developer`
- all other paths -> `auth-gated`

### 2.2 SEO Metadata (Static — Metadata Export Chain Analysis)

For each page entry, the audit resolves metadata in this order:

1. Page-level `export const metadata`
2. Page-level `export async function generateMetadata`
3. Nearest ancestor `layout.tsx`
4. Root fallback from `apps/web/src/app/layout.tsx`

Each field records both its `value` and `source`, where `source` is one of
`page`, `layout`, `root-layout`, or `null`.

Measured fields:

| Field               | JSON Key              | Pass Condition                           |
| ------------------- | --------------------- | ---------------------------------------- |
| Page title          | `title`               | Non-empty, not identical to root default |
| Meta description    | `description`         | Present, 50-160 characters               |
| OG title            | `og_title`            | Present                                  |
| OG description      | `og_description`      | Present                                  |
| OG URL              | `og_url`              | Present on public routes                 |
| OG site name        | `og_site_name`        | Present                                  |
| OG image            | `og_image`            | Present                                  |
| Twitter card type   | `twitter_card`        | Present                                  |
| Twitter title       | `twitter_title`       | Present                                  |
| Twitter description | `twitter_description` | Present                                  |
| Robots noindex      | `robots_noindex`      | Expected on non-public flows             |

### 2.3 Sitemap Coverage (Static — `sitemap.ts` Cross-Reference)

Each route is cross-referenced against `apps/web/src/app/sitemap.ts`.

The current sitemap has:

- **18 static URLs** defined directly in `staticRoutes`
- data-driven blog detail URLs from `apps/web/src/data/blog-posts.ts`
- data-driven careers detail URLs from `apps/web/src/data/job-listings.ts`
- data-driven landing-page URLs from `apps/web/src/data/landing-pages.json`
- data-driven press-release URLs from `apps/web/src/data/press-releases.json`

The `sitemap_last_modified_method` field records how the route was matched:

- `STATIC_LAST_MODIFIED` for static sitemap entries
- `data-field` for data-driven entries
- `null` when the route is not included in the sitemap

### 2.4 HTTP Status and Response Time

The generator is currently **static-analysis only**. It does not execute HTTP
requests yet.

As a result, every route currently emits:

- `http_status: null`
- `response_time_ms: null`
- `http_measurement_method: "pending-runtime"`

This is intentional. The audit must not fabricate measurements.

### 2.5 Stale Content Detection (Static — Pattern Matching)

The audit scans the page source for:

1. data imports from `@/data/*`
2. dated content signals such as years, percentages, and currency
3. placeholder signals such as `TODO`, `FIXME`, `HACK`, `lorem ipsum`, or
   `placeholder`

The classification priority is:

`stale` > `static-by-design-dated` > `static-by-design` > `none`

### 2.6 Ghost Link Classification

The ghost-link registry still contains the historical 28 links from the earlier
navigation audit work, but the generator now reconciles them against the **full
collapsed route inventory**, not naive direct filesystem paths. This means route
groups like `(list)` are treated correctly as implemented routes.

Current result:

- historical registry size: **28**
- currently unresolved ghost links: **0**

The human-readable source of navigation context remains
`docs/design/navigation-reachability-audit.md`.

### 2.7 Legal Compliance Check

The audit checks for required legal routes:

- `/privacy`
- `/terms`
- `/cookies`

The current baseline has all three pages present, so
`summary.legal_pages_missing` is empty.

## 3. Dimensions Measured

### 3.1 Quantitative Dimensions

Per route entry, the audit captures:

- metadata completeness and source provenance
- sitemap inclusion
- sitemap matching method
- public SEO score
- stale-content classification
- runtime-measurement placeholders

### 3.2 Qualitative Dimensions

Cross-cutting findings capture:

- legal-compliance gaps
- data-dependent 404 risk
- SEO CI enforcement gaps
- sitemap timestamp quality
- ghost-link reconciliation status

## 4. Scoring Criteria

### 4.1 SEO Score (0-100, Public Routes Only)

Applied only to `access_tier: "public"`. Auth-gated and developer entries emit
`seo_score: null`.

| Criterion                | Points | Condition                                                              |
| ------------------------ | ------ | ---------------------------------------------------------------------- |
| Title present and unique | +20    | Non-empty and not identical to the root default                        |
| Description 50-160 chars | +20    | Present and length in range                                            |
| OG title + description   | +20    | Both `og_title` and `og_description` present                           |
| OG URL + site name       | +10    | Both `og_url` and `og_site_name` present                               |
| Twitter card complete    | +15    | `twitter_card`, `twitter_title`, and `twitter_description` all present |
| In sitemap               | +10    | Route appears in `sitemap.ts` output                                   |
| No OG image              | -5     | Global deduction while `og:image` is missing                           |

**Current maximum practical score**: `95`, because `og:image` is still absent.

### 4.2 Content Freshness Classification

The audit does not assign a numeric freshness score. It emits one of:

- `none`
- `static-by-design`
- `static-by-design-dated`
- `stale`

### 4.3 Navigation Completeness

Navigation completeness is now reflected through ghost-link reconciliation. The
current verified baseline is **0 unresolved ghost links**.

## 5. Audit Report Schema

### Top-level structure

```json
{
  "generated_at": "ISO-8601 timestamp",
  "tool_version": "1.2.0",
  "routes": [],
  "summary": {},
  "findings": {
    "critical": [],
    "high": [],
    "medium": [],
    "low": [],
    "ghost_links": []
  }
}
```

### RouteEntry schema

```json
{
  "route": "/pricing",
  "file_path": "apps/web/src/app/(public)/pricing/page.tsx",
  "access_tier": "public | auth-gated | developer",
  "metadata": {
    "title": {
      "value": "string | null",
      "source": "page | layout | root-layout | null"
    },
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
  "sitemap_last_modified_method": "STATIC_LAST_MODIFIED | data-field | null",
  "http_status": "integer | null",
  "response_time_ms": "number | null",
  "http_measurement_method": "pending-runtime",
  "stale_content": {
    "classification": "none | static-by-design | static-by-design-dated | stale",
    "patterns_found": [],
    "data_sources": []
  },
  "ghost_links": [],
  "broken_inpage_links": [],
  "notes": ""
}
```

### AuditSummary schema

```json
{
  "total_routes": 209,
  "public_routes": 32,
  "auth_gated_routes": 163,
  "developer_routes": 14,
  "routes_with_seo_score": 32,
  "routes_pending_runtime_measurement": 209,
  "average_seo_score_public": 80,
  "legal_pages_missing": [],
  "ghost_link_count": 0
}
```

### Finding schema

```json
{
  "id": "SEO-LIGHTHOUSE-WARN",
  "type": "string",
  "severity": "critical | high | medium | low",
  "description": "Descriptive text",
  "file": "optional file path",
  "route": "optional route path",
  "remediation": "Suggested action or task reference"
}
```

### GhostLinkFinding schema

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

### 6.1 Classification decision tree

1. No matched signals -> `none`
2. Import from `@/data/*` -> `static-by-design`
3. Year, percentage, or currency in rendered source -> `static-by-design-dated`
4. Placeholder or TODO markers -> `stale`

### 6.2 Detection patterns

| Pattern          | Regex or signal                               | Classification         |
| ---------------- | --------------------------------------------- | ---------------------- |
| Data file import | `from '@/data/`                               | static-by-design       |
| Year references  | `202[0-9]`                                    | static-by-design-dated |
| Percentage stats | `\d+(\.\d+)?%`                                | static-by-design-dated |
| Currency amounts | `\$[\d,]+`                                    | static-by-design-dated |
| TODO markers     | `TODO\|FIXME\|HACK`                           | stale                  |
| Placeholder text | `lorem ipsum\|placeholder` (case-insensitive) | stale                  |

## 7. Re-Audit Cadence

### Automated

The GitHub workflow `.github/workflows/content-audit.yml` now reruns the audit
when these inputs change:

- `apps/web/src/app/**/page.tsx`
- `apps/web/src/app/**/layout.tsx`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/sitemap.ts`
- `apps/web/src/data/blog-posts.ts`
- `apps/web/src/data/job-listings.ts`
- `apps/web/src/data/landing-pages.json`
- `apps/web/src/data/press-releases.json`
- `lighthouserc.js`
- `tools/scripts/content-audit.ts`
- `.github/workflows/content-audit.yml`

Automated checks verify:

- route-entry drift against the previous audit JSON
- schema validity of `content-audit-results.json`
- public-route SEO scoring presence
- legal-page presence
- ghost-link reconciliation status

### Manual

Run a manual re-audit whenever one of these changes would alter interpretation
but not necessarily trigger a route-count drift:

- duplicated collapsed routes are introduced or removed
- copy updates materially change stale-content classification
- navigation documentation changes require registry reconciliation
- audit findings need to be re-triaged against sprint tasks

## 8. Current Findings and Priority Matrix

> **Verified against live generator output on 2026-04-16**

| Severity      | Finding ID            | Description                                                                                           | Tracking status                                            |
| ------------- | --------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| High          | `SEO-LIGHTHOUSE-WARN` | `lighthouserc.js` still treats SEO as `warn` instead of `error`                                       | `IFC-208` backlog                                          |
| High          | `CONTENT-PRESS-404`   | `/press/[id]` still uses `notFound()` and can produce crawlable data-dependent 404s if content drifts | residual risk after `PG-179`; no dedicated follow-up found |
| Medium        | `SITEMAP-STATIC-DATE` | `sitemap.ts` still uses a hardcoded `STATIC_LAST_MODIFIED` constant                                   | regression against `IFC-209` intent                        |
| Informational | `GHOST-LINKS`         | Historical 28 ghost links now reconcile to 0 unresolved routes                                        | verified resolved                                          |
| Informational | `LEGAL-PAGES`         | `/privacy`, `/terms`, and `/cookies` all exist                                                        | verified resolved                                          |

### Automation and integrity tasks

| Task      | Description                                                  | Status    |
| --------- | ------------------------------------------------------------ | --------- |
| `DOC-014` | Automated content audit script and CI regeneration           | completed |
| `DOC-015` | Cross-document route-total reconciliation across design docs | backlog   |
| `DOC-016` | CI gate for cross-document route-total drift                 | backlog   |

## 9. How to Regenerate

Run:

```bash
pnpm tsx tools/scripts/content-audit.ts
```

Then validate with:

```bash
pnpm exec vitest run tools/scripts/__tests__/content-audit.test.ts apps/web/src/__tests__/content-audit-schema.test.ts
```

If the route-entry baseline changes, review:

1. whether a new `page.tsx` was added or removed
2. whether two files now collapse to the same public URL
3. whether sitemap or data-driven route expansion also changed
4. whether companion design docs need the same baseline refresh
