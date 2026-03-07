#!/usr/bin/env tsx

/**
 * Automated Content Audit Script
 *
 * Scans page.tsx files, resolves metadata chains, calculates SEO scores,
 * detects ghost links, and regenerates artifacts/reports/content-audit-results.json.
 *
 * Exit codes: 0 = success (no drift), 1 = route count drift detected.
 *
 * @module tools/scripts/content-audit
 */

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import { findRepoRoot } from './lib/validation-utils.js';

// ============================================================================
// Interfaces
// ============================================================================

export interface MetadataField {
  value: string | null;
  source: string | null;
  length?: number;
}

export interface RouteMetadata {
  title: MetadataField;
  description: MetadataField;
  og_title: MetadataField;
  og_description: MetadataField;
  og_url: MetadataField;
  og_site_name: MetadataField;
  og_image: MetadataField;
  twitter_card: MetadataField;
  twitter_title: MetadataField;
  twitter_description: MetadataField;
  robots_noindex: boolean;
}

export type AccessTier = 'public' | 'auth-gated' | 'developer';

export interface StaleContentResult {
  classification: string;
  patterns_found: string[];
  data_sources: string[];
}

export interface RouteEntry {
  route: string;
  file_path: string;
  access_tier: AccessTier;
  metadata: RouteMetadata;
  seo_score: number | null;
  in_sitemap: boolean;
  sitemap_last_modified_method: string | null;
  http_status: number | null;
  response_time_ms: number | null;
  http_measurement_method: string;
  stale_content: StaleContentResult;
  ghost_links: string[];
  broken_inpage_links: string[];
  notes: string;
}

export interface AuditSummary {
  total_routes: number;
  public_routes: number;
  auth_gated_routes: number;
  developer_routes: number;
  routes_with_seo_score: number;
  routes_pending_runtime_measurement: number;
  average_seo_score_public: number;
  legal_pages_missing: string[];
  ghost_link_count: number;
}

export interface Finding {
  id: string;
  type: string;
  severity: string;
  description: string;
  file?: string;
  route?: string;
  remediation?: string;
}

export interface GhostLinkFinding {
  ghost_link_id: string;
  route: string;
  severity: string;
  planned_task: string;
  description: string;
}

export interface Findings {
  critical: Finding[];
  high: Finding[];
  medium: Finding[];
  low: Finding[];
  ghost_links: GhostLinkFinding[];
}

export interface AuditData {
  generated_at: string;
  tool_version: string;
  routes: RouteEntry[];
  summary: AuditSummary;
  findings: Findings;
}

export interface RawRoute {
  filePath: string;
  relPath: string;
}

export interface ParsedMetadata {
  title: string | null;
  description: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogUrl: string | null;
  ogSiteName: string | null;
  ogImage: string | null;
  twitterCard: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  isDynamic: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const TOOL_VERSION = '1.0.0';

const ROOT_TITLE_DEFAULT =
  'IntelliFlow CRM - AI-Powered Customer Relationship Management';

const ROOT_LAYOUT_DEFAULTS: ParsedMetadata = {
  title: ROOT_TITLE_DEFAULT,
  description:
    'Transform your sales process with IntelliFlow CRM. AI-powered lead scoring, intelligent pipeline analytics, and automated workflows for modern sales teams.',
  ogTitle: 'IntelliFlow CRM - AI-Powered Sales Intelligence',
  ogDescription:
    'Close more deals with AI-powered insights. Automated lead scoring, smart contact management, and real-time pipeline analytics.',
  ogUrl: 'https://intelliflow-crm.com',
  ogSiteName: 'IntelliFlow CRM',
  ogImage: null,
  twitterCard: 'summary_large_image',
  twitterTitle: 'IntelliFlow CRM - AI-Powered Sales Intelligence',
  twitterDescription:
    'Close more deals with AI-powered insights. Automated lead scoring, smart contact management, and real-time pipeline analytics.',
  isDynamic: false,
};

const GHOST_LINK_REGISTRY: Omit<GhostLinkFinding, 'route'>[] = [
  { ghost_link_id: 'G-01', severity: 'high', planned_task: 'PG-172', description: 'Sidebar link to /billing/usage, no page exists' },
  { ghost_link_id: 'G-02', severity: 'high', planned_task: 'PG-172', description: 'Sidebar + in-page links to /billing/plans, no page exists' },
  { ghost_link_id: 'G-03', severity: 'high', planned_task: 'PG-172', description: 'Sidebar link to /billing/upgrade, no page exists' },
  { ghost_link_id: 'G-04', severity: 'medium', planned_task: 'PG-172', description: 'In-page link to /billing/cancel, no page exists' },
  { ghost_link_id: 'G-05', severity: 'medium', planned_task: 'PG-172', description: 'In-page link to /billing/settings, no page exists' },
  { ghost_link_id: 'G-06', severity: 'medium', planned_task: 'PG-173', description: 'Sidebar link to /tickets/sla-policies, no page exists' },
  { ghost_link_id: 'G-07', severity: 'medium', planned_task: 'PG-173', description: 'Sidebar link to /tickets/types, no page exists' },
  { ghost_link_id: 'G-08', severity: 'medium', planned_task: 'PG-173', description: 'Sidebar link to /tickets/automations, no page exists' },
  { ghost_link_id: 'G-09', severity: 'medium', planned_task: 'PG-174', description: 'Sidebar link to /notifications/channels, no page exists' },
  { ghost_link_id: 'G-10', severity: 'medium', planned_task: 'PG-174', description: 'Sidebar link to /notifications/quiet-hours, no page exists' },
  { ghost_link_id: 'G-11', severity: 'low', planned_task: 'PG-175', description: 'Sidebar link to /deals/trash, no page exists' },
  { ghost_link_id: 'G-12', severity: 'low', planned_task: 'PG-176', description: 'Sidebar link to /governance/quality-reports/lighthouse, no page exists' },
  { ghost_link_id: 'G-13', severity: 'low', planned_task: 'PG-176', description: 'Sidebar link to /governance/quality-reports/coverage, no page exists' },
  { ghost_link_id: 'G-14', severity: 'low', planned_task: 'PG-176', description: 'Sidebar link to /governance/quality-reports/performance, no page exists' },
  { ghost_link_id: 'G-15', severity: 'low', planned_task: 'PG-177', description: 'Sidebar link to /analytics/saved/weekly, no page exists' },
  { ghost_link_id: 'G-16', severity: 'low', planned_task: 'PG-177', description: 'Sidebar link to /analytics/saved/monthly, no page exists' },
  { ghost_link_id: 'G-17', severity: 'low', planned_task: 'PG-177', description: 'Sidebar link to /analytics/saved/quarterly, no page exists' },
  { ghost_link_id: 'G-18', severity: 'low', planned_task: 'PG-178', description: 'settingsHref link, showSettings: false — never rendered' },
  { ghost_link_id: 'G-19', severity: 'low', planned_task: 'PG-178', description: 'settingsHref link, showSettings: false — never rendered' },
  { ghost_link_id: 'G-20', severity: 'low', planned_task: 'PG-178', description: 'settingsHref link, showSettings: false — never rendered' },
  { ghost_link_id: 'G-21', severity: 'low', planned_task: 'PG-178', description: 'Settings footer link to /settings/leads, no page exists' },
  { ghost_link_id: 'G-22', severity: 'low', planned_task: 'PG-178', description: 'Settings footer link to /settings/contacts, no page exists' },
  { ghost_link_id: 'G-23', severity: 'low', planned_task: 'PG-178', description: 'Settings footer link to /settings/accounts, no page exists' },
  { ghost_link_id: 'G-24', severity: 'low', planned_task: 'PG-178', description: 'Settings footer link to /settings/deals, no page exists' },
  { ghost_link_id: 'G-25', severity: 'low', planned_task: 'PG-178', description: 'Settings footer link to /settings/tickets, no page exists' },
  { ghost_link_id: 'G-26', severity: 'low', planned_task: 'PG-178', description: 'Settings footer link to /settings/documents, no page exists' },
  { ghost_link_id: 'G-27', severity: 'low', planned_task: 'PG-178', description: 'Settings footer link to /settings/reports, no page exists' },
  { ghost_link_id: 'G-28', severity: 'low', planned_task: 'PG-178', description: 'In-page Upgrade Plan CTA link to /settings/billing, no page exists' },
];

const GHOST_LINK_ROUTES: string[] = [
  '/billing/usage', '/billing/plans', '/billing/upgrade', '/billing/cancel', '/billing/settings',
  '/tickets/sla-policies', '/tickets/types', '/tickets/automations',
  '/notifications/channels', '/notifications/quiet-hours',
  '/deals/trash',
  '/governance/quality-reports/lighthouse', '/governance/quality-reports/coverage', '/governance/quality-reports/performance',
  '/analytics/saved/weekly', '/analytics/saved/monthly', '/analytics/saved/quarterly',
  '/settings/appointments', '/settings/cases', '/settings/tasks', '/settings/leads',
  '/settings/contacts', '/settings/accounts', '/settings/deals', '/settings/tickets',
  '/settings/documents', '/settings/reports', '/settings/billing',
];

// ============================================================================
// Metadata Parsing Helpers
// ============================================================================

function extractSection(source: string, sectionName: string): string | null {
  const regex = new RegExp(`${sectionName}\\s*:\\s*\\{`);
  const match = regex.exec(source);
  if (!match) return null;

  let depth = 1;
  let i = match.index + match[0].length;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    i++;
  }
  return source.slice(match.index + match[0].length, i - 1);
}

function extractStringValue(source: string, fieldName: string): string | null {
  // Try single quotes
  const sq = new RegExp(`${fieldName}\\s*:\\s*'([^']*)'`);
  const sqMatch = sq.exec(source);
  if (sqMatch) return sqMatch[1];

  // Try double quotes
  const dq = new RegExp(`${fieldName}\\s*:\\s*"([^"]*)"`);
  const dqMatch = dq.exec(source);
  if (dqMatch) return dqMatch[1];

  // Try backticks (no interpolation)
  const bt = new RegExp(`${fieldName}\\s*:\\s*\`([^\`]*)\``);
  const btMatch = bt.exec(source);
  if (btMatch) return btMatch[1];

  // Try multiline (value on next line)
  const ml = new RegExp(`${fieldName}\\s*:\\s*\\n\\s*['"]([^'"]*?)['"]`);
  const mlMatch = ml.exec(source);
  if (mlMatch) return mlMatch[1];

  return null;
}

function extractTitleValue(source: string): string | null {
  // Object form: title: { default: '...' }
  const objMatch = /title\s*:\s*\{[^}]*default\s*:\s*['"]([^'"]+)['"]/s.exec(source);
  if (objMatch) return objMatch[1];

  return extractStringValue(source, 'title');
}

const NULL_METADATA: ParsedMetadata = {
  title: null, description: null,
  ogTitle: null, ogDescription: null, ogUrl: null, ogSiteName: null, ogImage: null,
  twitterCard: null, twitterTitle: null, twitterDescription: null,
  isDynamic: false,
};

export function parseMetadataFromSource(source: string): ParsedMetadata | null {
  if (/export\s+(?:async\s+)?function\s+generateMetadata/.test(source)) {
    return { ...NULL_METADATA, isDynamic: true };
  }

  if (!/export\s+const\s+metadata/.test(source)) {
    return null;
  }

  const ogSection = extractSection(source, 'openGraph');
  const twitterSection = extractSection(source, 'twitter');

  // Top-level fields (use full source — first match wins, which is the top-level one)
  const title = extractTitleValue(source);
  const description = extractStringValue(source, 'description');

  // OG fields from openGraph section
  const ogTitle = ogSection ? extractStringValue(ogSection, 'title') : null;
  const ogDescription = ogSection ? extractStringValue(ogSection, 'description') : null;
  const ogUrl = ogSection ? extractStringValue(ogSection, 'url') : null;
  const ogSiteName = ogSection ? extractStringValue(ogSection, 'siteName') : null;
  const ogImage = ogSection ? extractStringValue(ogSection, 'image') : null;

  // Twitter fields from twitter section
  const twitterCard = twitterSection ? extractStringValue(twitterSection, 'card') : null;
  const twitterTitle = twitterSection ? extractStringValue(twitterSection, 'title') : null;
  const twitterDescription = twitterSection ? extractStringValue(twitterSection, 'description') : null;

  return {
    title, description,
    ogTitle, ogDescription, ogUrl, ogSiteName, ogImage,
    twitterCard, twitterTitle, twitterDescription,
    isDynamic: false,
  };
}

// ============================================================================
// Route Enumeration
// ============================================================================

export function scanRoutes(appDir: string): RawRoute[] {
  const routes: RawRoute[] = [];

  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue;
        // Only skip 'api' at app root level (Next.js API routes)
        if (entry.name === 'api' && dir === appDir) continue;
        walk(fullPath);
      } else if (entry.name === 'page.tsx') {
        routes.push({
          filePath: fullPath,
          relPath: relative(appDir, fullPath).replace(/\\/g, '/'),
        });
      }
    }
  }

  walk(appDir);
  return routes;
}

// ============================================================================
// Path Transformation
// ============================================================================

export function pathToRoute(relPath: string): string {
  const route = relPath
    .replace(/\\/g, '/')
    .replace(/\/?page\.tsx$/, '')
    .replace(/\/\([^)]+\)/g, '')     // Strip /(groupName)
    .replace(/^\([^)]+\)\/?/, '')    // Strip leading (groupName)/
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');

  if (route === '' || route === '/') return '/';
  return route.startsWith('/') ? route : '/' + route;
}

// ============================================================================
// Access Tier Classification
// ============================================================================

export function classifyAccessTier(relPath: string): AccessTier {
  const normalized = relPath.replace(/\\/g, '/');
  if (normalized.startsWith('(public)/') || normalized.startsWith('(public)\\')) return 'public';
  if (normalized.startsWith('(developer)/') || normalized.startsWith('(developer)\\')) return 'developer';
  return 'auth-gated';
}

// ============================================================================
// Layout Map
// ============================================================================

export function buildLayoutMap(appDir: string): Map<string, ParsedMetadata> {
  const map = new Map<string, ParsedMetadata>();

  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue;
        if (entry.name === 'api' && dir === appDir) continue;
        walk(fullPath);
      } else if (entry.name === 'layout.tsx') {
        try {
          const source = readFileSync(fullPath, 'utf-8');
          const meta = parseMetadataFromSource(source);
          if (meta) {
            map.set(dir.replace(/\\/g, '/'), meta);
          }
        } catch { /* skip unreadable layouts */ }
      }
    }
  }

  walk(appDir);
  return map;
}

// ============================================================================
// Metadata Chain Resolution
// ============================================================================

export function resolveMetadataChain(
  pagePath: string,
  appDir: string,
  layoutMap: Map<string, ParsedMetadata>,
): RouteMetadata {
  let pageSource = '';
  try {
    pageSource = readFileSync(pagePath, 'utf-8');
  } catch { /* empty source fallback */ }

  const pageMeta = parseMetadataFromSource(pageSource);
  const isDynamic = pageMeta?.isDynamic ?? false;

  // Find nearest non-root layout with metadata
  const normAppDir = appDir.replace(/\\/g, '/');
  let nearestLayout: ParsedMetadata | null = null;
  let dir = dirname(pagePath);
  while (true) {
    const normDir = dir.replace(/\\/g, '/');
    if (normDir.length < normAppDir.length) break;
    if (normDir !== normAppDir && layoutMap.has(normDir)) {
      nearestLayout = layoutMap.get(normDir)!;
      break;
    }
    if (normDir === normAppDir) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Root layout from map or hardcoded defaults
  const rootLayout = layoutMap.get(normAppDir) ?? ROOT_LAYOUT_DEFAULTS;

  function resolveField(
    pageVal: string | null | undefined,
    layoutVal: string | null | undefined,
    rootVal: string | null,
  ): MetadataField {
    if (!isDynamic && pageVal != null) return { value: pageVal, source: 'page' };
    if (layoutVal != null) return { value: layoutVal, source: 'layout' };
    if (rootVal != null) return { value: rootVal, source: 'root-layout' };
    return { value: null, source: null };
  }

  const title = resolveField(pageMeta?.title, nearestLayout?.title, rootLayout.title);
  const desc = resolveField(pageMeta?.description, nearestLayout?.description, rootLayout.description);
  if (desc.value) desc.length = desc.value.length;

  return {
    title,
    description: desc,
    og_title: resolveField(pageMeta?.ogTitle, nearestLayout?.ogTitle, rootLayout.ogTitle),
    og_description: resolveField(pageMeta?.ogDescription, nearestLayout?.ogDescription, rootLayout.ogDescription),
    og_url: resolveField(pageMeta?.ogUrl, nearestLayout?.ogUrl, rootLayout.ogUrl),
    og_site_name: resolveField(pageMeta?.ogSiteName, nearestLayout?.ogSiteName, rootLayout.ogSiteName),
    og_image: resolveField(pageMeta?.ogImage, nearestLayout?.ogImage, rootLayout.ogImage),
    twitter_card: resolveField(pageMeta?.twitterCard, nearestLayout?.twitterCard, rootLayout.twitterCard),
    twitter_title: resolveField(pageMeta?.twitterTitle, nearestLayout?.twitterTitle, rootLayout.twitterTitle),
    twitter_description: resolveField(pageMeta?.twitterDescription, nearestLayout?.twitterDescription, rootLayout.twitterDescription),
    robots_noindex: /robots\s*:\s*\{[^}]*index\s*:\s*false/s.test(pageSource),
  };
}

// ============================================================================
// SEO Score Calculation
// ============================================================================

export function calculateSeoScore(
  metadata: RouteMetadata,
  inSitemap: boolean,
  accessTier: AccessTier = 'public',
): number | null {
  if (accessTier !== 'public') return null;

  let score = 0;

  // +20: Title present and unique (differs from root default)
  if (metadata.title.value && metadata.title.value !== ROOT_TITLE_DEFAULT) {
    score += 20;
  }

  // +20: Description 50-160 chars
  if (metadata.description.value) {
    const len = metadata.description.value.length;
    if (len >= 50 && len <= 160) score += 20;
  }

  // +20: OG title + OG description both present
  if (metadata.og_title.value && metadata.og_description.value) {
    score += 20;
  }

  // +10: OG url + OG siteName both present
  if (metadata.og_url.value && metadata.og_site_name.value) {
    score += 10;
  }

  // +15: Twitter card + title + description all present
  if (metadata.twitter_card.value && metadata.twitter_title.value && metadata.twitter_description.value) {
    score += 15;
  }

  // +10: In sitemap
  if (inSitemap) {
    score += 10;
  }

  // -5: No OG image
  if (!metadata.og_image.value) {
    score -= 5;
  }

  return Math.max(0, score);
}

// ============================================================================
// Sitemap Cross-Reference
// ============================================================================

export function buildSitemapSet(sitemapPath: string, dataDir: string): Map<string, string> {
  const result = new Map<string, string>();

  // Read and parse sitemap.ts
  let sitemapSource: string;
  try {
    sitemapSource = readFileSync(sitemapPath, 'utf-8');
  } catch {
    return result;
  }

  // Extract static route URLs: url: `${BASE_URL}/path` or url: `${BASE_URL}`
  const urlRegex = /url:\s*`\$\{BASE_URL\}([^`]*)`/g;
  let match;
  while ((match = urlRegex.exec(sitemapSource)) !== null) {
    const path = match[1] || '/';
    result.set(path, 'STATIC_LAST_MODIFIED');
  }

  // Dynamic blog routes from blog-posts.ts
  try {
    const blogSource = readFileSync(resolve(dataDir, 'blog-posts.ts'), 'utf-8');
    const slugRegex = /slug:\s*'([^']+)'/g;
    while ((match = slugRegex.exec(blogSource)) !== null) {
      result.set(`/blog/${match[1]}`, 'data-field');
    }
  } catch { /* skip if file missing */ }

  // Dynamic career routes from job-listings.ts
  try {
    const jobSource = readFileSync(resolve(dataDir, 'job-listings.ts'), 'utf-8');
    const idRegex = /id:\s*'([^']+)'/g;
    while ((match = idRegex.exec(jobSource)) !== null) {
      result.set(`/careers/${match[1]}`, 'data-field');
    }
  } catch { /* skip if file missing */ }

  // Dynamic LP routes from landing-pages.json
  try {
    const lpJson = JSON.parse(readFileSync(resolve(dataDir, 'landing-pages.json'), 'utf-8'));
    if (lpJson.pages) {
      for (const slug of Object.keys(lpJson.pages)) {
        result.set(`/lp/${slug}`, 'data-field');
      }
    }
  } catch { /* skip if file missing */ }

  return result;
}

// ============================================================================
// Ghost Link Cross-Reference
// ============================================================================

export function crossReferenceGhostLinks(appDir: string): GhostLinkFinding[] {
  const results: GhostLinkFinding[] = [];

  for (let i = 0; i < GHOST_LINK_ROUTES.length; i++) {
    const route = GHOST_LINK_ROUTES[i];
    const registryEntry = GHOST_LINK_REGISTRY[i];

    // Convert route to filesystem path and check if page.tsx exists
    // Ghost link routes map to auth-gated routes (not under (public)/ or (developer)/)
    const fsPath = join(appDir, ...route.slice(1).split('/'), 'page.tsx');
    if (!existsSync(fsPath)) {
      results.push({ ...registryEntry, route });
    }
  }

  return results;
}

// ============================================================================
// Stale Content Detection
// ============================================================================

export function detectStaleContent(source: string): StaleContentResult {
  const patternsFound: string[] = [];
  const dataSources: string[] = [];
  let classification = 'none';

  // Priority order (highest wins): stale > static-by-design-dated > static-by-design

  // Check for data imports
  const dataImportMatch = source.match(/from\s+['"]@\/data\/([^'"]+)['"]/g);
  if (dataImportMatch) {
    classification = 'static-by-design';
    for (const m of dataImportMatch) {
      const pathMatch = /from\s+['"]@\/data\/([^'"]+)['"]/.exec(m);
      if (pathMatch) dataSources.push(`@/data/${pathMatch[1]}`);
    }
    patternsFound.push('data-import');
  }

  // Check for static-by-design-dated patterns (overrides static-by-design)
  if (/\$[\d,]+/.test(source)) {
    classification = 'static-by-design-dated';
    patternsFound.push('currency');
  }
  if (/\d+(\.\d+)?%/.test(source)) {
    classification = 'static-by-design-dated';
    patternsFound.push('percentage');
  }
  if (/202[0-9]/.test(source)) {
    classification = 'static-by-design-dated';
    patternsFound.push('year-reference');
  }

  // Check for stale patterns (highest priority)
  if (/lorem ipsum|placeholder/i.test(source)) {
    classification = 'stale';
    patternsFound.push('placeholder');
  }
  if (/TODO|FIXME|HACK/.test(source)) {
    classification = 'stale';
    patternsFound.push('todo-marker');
  }

  return { classification, patterns_found: patternsFound, data_sources: dataSources };
}

// ============================================================================
// Legal Page Check
// ============================================================================

export function checkLegalPages(routes: string[]): string[] {
  const required = ['privacy', 'terms', 'cookies'];
  const routeSet = new Set(routes);
  return required.filter(page => !routeSet.has(`/${page}`));
}

// ============================================================================
// Findings Assembly
// ============================================================================

export function buildFindings(
  routes: RouteEntry[],
  ghostLinks: GhostLinkFinding[],
  repoRoot: string,
): Findings {
  const critical: Finding[] = [];
  const high: Finding[] = [];
  const medium: Finding[] = [];
  const low: Finding[] = [];

  // Legal pages
  const routePaths = routes.map(r => r.route);
  const missingLegal = checkLegalPages(routePaths);
  for (const page of missingLegal) {
    critical.push({
      id: `LEGAL-${page.toUpperCase()}`,
      type: 'missing-legal-page',
      severity: 'critical',
      description: `Required legal page /${page} does not exist`,
      route: `/${page}`,
      remediation: `Create apps/web/src/app/(public)/${page}/page.tsx`,
    });
  }

  // Press/[id] broken link risk
  const pressRoute = routes.find(r => r.route === '/press/[id]');
  if (pressRoute) {
    try {
      const pressSource = readFileSync(resolve(repoRoot, pressRoute.file_path), 'utf-8');
      if (pressSource.includes('notFound')) {
        high.push({
          id: 'CONTENT-PRESS-404',
          type: 'data-dependent-404',
          severity: 'high',
          description: '/press/[id] uses notFound() — data-dependent 404 risk with no individual sitemap entries',
          route: '/press/[id]',
          file: pressRoute.file_path,
          remediation: 'Add dynamic press release routes to sitemap.ts or implement ISR fallback',
        });
      }
    } catch { /* skip on read error */ }
  }

  // Lighthouserc.js SEO warn check
  try {
    const lhSource = readFileSync(resolve(repoRoot, 'lighthouserc.js'), 'utf-8');
    if (/['"]categories:seo['"]\s*:\s*\[\s*['"]warn['"]/.test(lhSource)) {
      high.push({
        id: 'SEO-LIGHTHOUSE-WARN',
        type: 'seo-configuration',
        severity: 'high',
        description: 'lighthouserc.js has SEO category at warn level instead of error',
        file: 'lighthouserc.js',
        remediation: 'Promote categories:seo from warn to error in lighthouserc.js',
      });
    }
  } catch { /* skip on read error */ }

  // Sitemap.ts STATIC_LAST_MODIFIED check
  try {
    const sitemapSource = readFileSync(
      resolve(repoRoot, 'apps/web/src/app/sitemap.ts'), 'utf-8',
    );
    if (sitemapSource.includes('STATIC_LAST_MODIFIED')) {
      medium.push({
        id: 'SITEMAP-STATIC-DATE',
        type: 'sitemap-defect',
        severity: 'medium',
        description: 'sitemap.ts uses hardcoded STATIC_LAST_MODIFIED date instead of actual content modification dates',
        file: 'apps/web/src/app/sitemap.ts',
        remediation: 'Replace STATIC_LAST_MODIFIED with git commit dates or build-time timestamps',
      });
    }
  } catch { /* skip on read error */ }

  return { critical, high, medium, low, ghost_links: ghostLinks };
}

// ============================================================================
// Drift Detection
// ============================================================================

export function detectDrift(newCount: number, outputPath: string): boolean {
  try {
    if (!existsSync(outputPath)) return false; // First run — no drift
    const previous = JSON.parse(readFileSync(outputPath, 'utf-8'));
    return previous.summary?.total_routes !== newCount;
  } catch {
    return false; // Parse error — treat as first run
  }
}

// ============================================================================
// Audit Orchestrator
// ============================================================================

export function runAudit(repoRoot: string): AuditData {
  const appDir = resolve(repoRoot, 'apps/web/src/app');

  // 1. Scan routes
  const rawRoutes = scanRoutes(appDir);

  // 2. Build layout map
  const layoutMap = buildLayoutMap(appDir);

  // 3. Build sitemap set
  const sitemapPath = resolve(appDir, 'sitemap.ts');
  const dataDir = resolve(repoRoot, 'apps/web/src/data');
  const sitemapMap = buildSitemapSet(sitemapPath, dataDir);

  // 4. Get ghost links
  const ghostLinks = crossReferenceGhostLinks(appDir);

  // 5. Build route entries
  const routes: RouteEntry[] = rawRoutes.map(raw => {
    const route = pathToRoute(raw.relPath);
    const accessTier = classifyAccessTier(raw.relPath);

    const metadata = resolveMetadataChain(raw.filePath, appDir, layoutMap);
    const inSitemap = sitemapMap.has(route);
    const seoScore = calculateSeoScore(metadata, inSitemap, accessTier);

    let pageSource = '';
    try {
      pageSource = readFileSync(raw.filePath, 'utf-8');
    } catch { /* empty source */ }
    const staleContent = detectStaleContent(pageSource);

    return {
      route,
      file_path: relative(repoRoot, raw.filePath).replace(/\\/g, '/'),
      access_tier: accessTier,
      metadata,
      seo_score: seoScore,
      in_sitemap: inSitemap,
      sitemap_last_modified_method: sitemapMap.get(route) ?? null,
      http_status: null,
      response_time_ms: null,
      http_measurement_method: 'pending-runtime',
      stale_content: staleContent,
      ghost_links: [],
      broken_inpage_links: [],
      notes: '',
    };
  });

  // 6. Sort lexicographically by route
  routes.sort((a, b) => a.route.localeCompare(b.route));

  // 7. Build summary
  const publicRoutes = routes.filter(r => r.access_tier === 'public');
  const seoScores = publicRoutes
    .filter(r => r.seo_score !== null)
    .map(r => r.seo_score!);
  const avgSeo = seoScores.length > 0
    ? Math.round(seoScores.reduce((a, b) => a + b, 0) / seoScores.length)
    : 0;

  const routePaths = routes.map(r => r.route);
  const missingLegal = checkLegalPages(routePaths);

  const summary: AuditSummary = {
    total_routes: routes.length,
    public_routes: publicRoutes.length,
    auth_gated_routes: routes.filter(r => r.access_tier === 'auth-gated').length,
    developer_routes: routes.filter(r => r.access_tier === 'developer').length,
    routes_with_seo_score: seoScores.length,
    routes_pending_runtime_measurement: routes.length,
    average_seo_score_public: avgSeo,
    legal_pages_missing: missingLegal,
    ghost_link_count: ghostLinks.length,
  };

  // 8. Build findings
  const findings = buildFindings(routes, ghostLinks, repoRoot);

  return {
    generated_at: new Date().toISOString(),
    tool_version: TOOL_VERSION,
    routes,
    summary,
    findings,
  };
}

// ============================================================================
// CLI Entry
// ============================================================================

export function main(): void {
  const repoRoot = findRepoRoot();
  const outputPath = resolve(repoRoot, 'artifacts/reports/content-audit-results.json');

  console.log('Content Audit — scanning routes...');

  const result = runAudit(repoRoot);

  // Drift detection BEFORE writing (compare against previous file)
  const hasDrift = detectDrift(result.summary.total_routes, outputPath);

  // Write output (overwriting previous)
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');

  console.log(`Routes found: ${result.summary.total_routes}`);
  console.log(`Public: ${result.summary.public_routes}, Auth-gated: ${result.summary.auth_gated_routes}, Developer: ${result.summary.developer_routes}`);
  console.log(`Ghost links: ${result.summary.ghost_link_count}`);
  console.log(`Average SEO score (public): ${result.summary.average_seo_score_public}`);
  console.log(`Output: ${outputPath}`);

  if (hasDrift) {
    console.error('DRIFT DETECTED: Route count differs from previous baseline.');
    process.exit(1);
  }

  console.log('Audit complete — no drift detected.');
  process.exit(0);
}

// CLI entry point guard
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('content-audit.ts')
) {
  main();
}
