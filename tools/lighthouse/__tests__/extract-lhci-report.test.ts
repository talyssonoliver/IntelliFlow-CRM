/**
 * extract-lhci-report.ts Tests
 *
 * Validates the Lighthouse CI report extraction function:
 * - Reads manifest.json from LHCI output directory
 * - Selects entry for the "/" URL
 * - Maps scores and metrics correctly
 * - Computes passedThresholds
 * - Writes valid JSON output
 *
 * Task: PG-166 — Lighthouse audit on authenticated home page
 * AC: AC-001, AC-005
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { extractLhciReport } from '../extract-lhci-report';

// ---------------------------------------------------------------------------
// Mock fs module
// ---------------------------------------------------------------------------

vi.mock('fs');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_LHCI_DIR = '/mock-lhci-dir';
const MOCK_OUT_FILE = '/mock-output/home-page-lighthouse.json';

const mockManifest = [
  {
    url: 'http://localhost:3000/',
    isRepresentativeRun: true,
    htmlPath: '/mock-lhci/lhr-123.html',
    jsonPath: '/mock-lhci/lhr-123.json',
    summary: { performance: 0.92, accessibility: 0.95 },
  },
];

function createMockLHR(overrides: Record<string, unknown> = {}) {
  return {
    finalUrl: 'http://localhost:3000/',
    fetchTime: '2026-03-02T12:00:00.000Z',
    categories: {
      performance: { score: 0.92 },
      accessibility: { score: 0.95 },
      'best-practices': { score: 0.9 },
      seo: { score: 0.88 },
    },
    audits: {
      interactive: { numericValue: 850 },
      'first-contentful-paint': { numericValue: 720 },
      'largest-contentful-paint': { numericValue: 1200 },
      'cumulative-layout-shift': { numericValue: 0.05 },
      'total-blocking-time': { numericValue: 150 },
      'speed-index': { numericValue: 1800 },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extract-lhci-report', () => {
  let writtenPath: string | null = null;
  let writtenContent: string | null = null;

  beforeEach(() => {
    writtenPath = null;
    writtenContent = null;

    vi.mocked(fs.readFileSync).mockImplementation((filePath: fs.PathOrFileDescriptor) => {
      const p = String(filePath);
      if (p.includes('manifest.json')) {
        return JSON.stringify(mockManifest);
      }
      if (p.includes('lhr-123.json')) {
        return JSON.stringify(createMockLHR());
      }
      throw new Error(`Unexpected file read: ${p}`);
    });

    vi.mocked(fs.writeFileSync).mockImplementation(
      (filePath: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView) => {
        writtenPath = String(filePath);
        writtenContent = String(data);
      }
    );
  });

  it('reads manifest.json from LHCI output directory', () => {
    extractLhciReport(MOCK_LHCI_DIR, MOCK_OUT_FILE);

    const expectedPath = path.join(MOCK_LHCI_DIR, 'manifest.json');
    expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');
  });

  it('selects entry for the "/" URL', () => {
    extractLhciReport(MOCK_LHCI_DIR, MOCK_OUT_FILE);

    // Should read the jsonPath from the manifest entry that matches "/"
    expect(fs.readFileSync).toHaveBeenCalledWith('/mock-lhci/lhr-123.json', 'utf8');
  });

  it('maps performance score correctly (0-1 scale)', () => {
    extractLhciReport(MOCK_LHCI_DIR, MOCK_OUT_FILE);

    expect(writtenContent).toBeTruthy();
    const summary = JSON.parse(writtenContent!);
    expect(summary.scores.performance).toBe(0.92);
    expect(summary.scores.accessibility).toBe(0.95);
    expect(summary.scores.bestPractices).toBe(0.9);
    expect(summary.scores.seo).toBe(0.88);
  });

  it('maps TTI to metrics.tti in ms', () => {
    extractLhciReport(MOCK_LHCI_DIR, MOCK_OUT_FILE);

    expect(writtenContent).toBeTruthy();
    const summary = JSON.parse(writtenContent!);
    expect(summary.metrics.tti).toBe(850);
    expect(summary.metrics.fcp).toBe(720);
    expect(summary.metrics.lcp).toBe(1200);
    expect(summary.metrics.cls).toBe(0.05);
    expect(summary.metrics.tbt).toBe(150);
    expect(summary.metrics.si).toBe(1800);
  });

  it('sets passedThresholds.tti: false when TTI >= 1000ms', () => {
    vi.mocked(fs.readFileSync).mockImplementation((filePath: fs.PathOrFileDescriptor) => {
      const p = String(filePath);
      if (p.includes('manifest.json')) {
        return JSON.stringify(mockManifest);
      }
      if (p.includes('lhr-123.json')) {
        return JSON.stringify(
          createMockLHR({
            audits: {
              interactive: { numericValue: 1200 }, // Over 1000ms
              'first-contentful-paint': { numericValue: 720 },
              'largest-contentful-paint': { numericValue: 1200 },
              'cumulative-layout-shift': { numericValue: 0.05 },
              'total-blocking-time': { numericValue: 150 },
              'speed-index': { numericValue: 1800 },
            },
          })
        );
      }
      throw new Error(`Unexpected file read: ${p}`);
    });

    extractLhciReport(MOCK_LHCI_DIR, MOCK_OUT_FILE);

    expect(writtenContent).toBeTruthy();
    const summary = JSON.parse(writtenContent!);
    expect(summary.passedThresholds.tti).toBe(false);
  });

  it('writes valid JSON to the output path', () => {
    extractLhciReport(MOCK_LHCI_DIR, MOCK_OUT_FILE);

    expect(writtenPath).toBe(MOCK_OUT_FILE);

    expect(writtenContent).toBeTruthy();
    const parsed = JSON.parse(writtenContent!);
    expect(parsed).toHaveProperty('url');
    expect(parsed).toHaveProperty('scores');
    expect(parsed).toHaveProperty('metrics');
    expect(parsed).toHaveProperty('passedThresholds');
    expect(parsed).toHaveProperty('generatedAt');
  });
});
