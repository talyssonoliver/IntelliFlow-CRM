/**
 * Compliance Calendar Seed-Data Integrity (IFC-306)
 *
 * Guards the REAL `docs/planning/compliance-calendar.json` and the timeline API
 * that serves it. Unlike `compliance-api.test.ts`, this file does NOT mock
 * `node:fs` — it reads the actual seed file and drives the real route, so a
 * broken data path or stale seed fails here instead of silently passing behind
 * a mock. Each assertion maps to an IFC-306 acceptance criterion.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NextRequest } from 'next/server';

const EXPECTED_STANDARDS = ['GDPR', 'SOC 2', 'ISO 27001', 'ISO 42001', 'OWASP'];

function repoRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('repo root (pnpm-workspace.yaml) not found');
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: string;
  standard: string;
  status: string;
}
interface Calendar {
  metadata: { version: string; lastUpdated: string };
  events: CalendarEvent[];
}

function loadCalendar(): Calendar {
  const p = path.join(repoRoot(), 'docs', 'planning', 'compliance-calendar.json');
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

describe('IFC-306 · compliance-calendar seed integrity (real file)', () => {
  const calendar = loadCalendar();

  it('AC1 — has exactly 22 events', () => {
    expect(calendar.events).toHaveLength(22);
  });

  it('AC2 — covers exactly the 5 SaaS-relevant standards and no ISO 14001', () => {
    const standards = [...new Set(calendar.events.map((e) => e.standard))].sort();
    expect(standards).toEqual([...EXPECTED_STANDARDS].sort());
    expect(calendar.events.some((e) => /14001/.test(e.standard))).toBe(false);
  });

  it('AC4 — date range spans Oct 2025 through Dec 2026', () => {
    const dates = calendar.events.map((e) => e.date).sort();
    expect(dates[0] <= '2025-10-31').toBe(true);
    expect(dates[dates.length - 1] >= '2026-12-01').toBe(true);
  });

  it('AC3 — zero stale statuses: no event dated before lastUpdated is still scheduled', () => {
    const asOf = calendar.metadata.lastUpdated.slice(0, 10);
    const stale = calendar.events.filter((e) => e.date < asOf && e.status === 'scheduled');
    expect(stale.map((e) => `${e.id}@${e.date}`)).toEqual([]);
  });

  it('AC3b — genuinely-future events remain scheduled (not prematurely completed)', () => {
    const asOf = calendar.metadata.lastUpdated.slice(0, 10);
    const future = calendar.events.filter((e) => e.date > asOf);
    expect(future.length).toBeGreaterThan(0);
    expect(future.every((e) => e.status === 'scheduled')).toBe(true);
  });

  it('AC6 — metadata version and lastUpdated are present and well-formed', () => {
    expect(calendar.metadata.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(calendar.metadata.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('IFC-306 · timeline API serves the real seed (unmocked fs)', () => {
  it('AC5 — GET /api/compliance/timeline returns all 22 seed events', async () => {
    const { GET } = await import('../timeline/route');
    const res = await GET(new NextRequest('http://localhost/api/compliance/timeline'));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.events).toHaveLength(22);
  });
});
