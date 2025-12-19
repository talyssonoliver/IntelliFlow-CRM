/**
 * GET /api/governance/phantom-audit
 * Returns the phantom completion audit report
 */

import { NextResponse } from 'next/server';
import { loadPhantomCompletionAudit, loadLintReport } from '@/lib/governance';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const audit = loadPhantomCompletionAudit();
    const lintReport = loadLintReport();

    // Extract phantom completion errors from lint report
    const phantomErrors =
      lintReport?.errors?.filter((e: any) => e.rule === 'PHANTOM_COMPLETION') || [];

    // Build response
    const response = {
      hasAudit: !!audit,
      audit: audit || null,
      lintErrors: {
        total: lintReport?.summary?.error_count || 0,
        phantomCompletions: phantomErrors.length,
        errors: phantomErrors.map((e: any) => ({
          taskId: e.tasks?.[0] || 'unknown',
          message: e.message,
          missingArtifacts: e.metadata?.missing_artifacts || [],
          priority: e.priority,
        })),
      },
      integrityStatus: audit
        ? {
            score: audit.summary.integrity_score,
            verified: audit.summary.verified_completions,
            phantom: audit.summary.phantom_completions,
            total: audit.summary.total_completed_tasks,
            severity: audit.audit_metadata.severity,
          }
        : null,
      recommendations: audit?.recommendations || [],
      lastGenerated: audit?.audit_metadata?.generated_at || lintReport?.meta?.generated_at,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, max-age=0',
      },
    });
  } catch (error) {
    console.error('Error loading phantom audit:', error);
    return NextResponse.json(
      { error: 'Failed to load phantom completion audit', details: String(error) },
      { status: 500 }
    );
  }
}
