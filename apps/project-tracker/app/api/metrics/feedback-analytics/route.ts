/**
 * GET /api/metrics/feedback-analytics
 *
 * RSI (Recursive Self-Improvement) endpoint that dynamically generates
 * AI feedback analytics from the feedback database/records.
 *
 * Computes: feedback volume, sentiment analysis, model accuracy trends
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface FeedbackRecord {
  taskId: string;
  type: 'positive' | 'negative' | 'neutral';
  category: string;
  timestamp: string;
  details?: string;
}

interface FeedbackSummary {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  sentimentScore: number; // -100 to +100
  byCategory: Record<string, number>;
  trend: 'improving' | 'stable' | 'declining';
}

// Get project root path
function getProjectRoot(): string {
  return process.cwd().replace(/[\\/]apps[\\/]project-tracker$/, '');
}

// Scan attestations for feedback signals
function extractFeedbackFromAttestations(): FeedbackRecord[] {
  const projectRoot = getProjectRoot();
  const attestationsDir = join(projectRoot, 'artifacts', 'attestations');
  const records: FeedbackRecord[] = [];

  try {
    if (!existsSync(attestationsDir)) return records;

    const taskDirs = readdirSync(attestationsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const taskId of taskDirs) {
      const ackPath = join(attestationsDir, taskId, 'context_ack.json');
      if (existsSync(ackPath)) {
        try {
          const content = JSON.parse(readFileSync(ackPath, 'utf8'));
          const stats = statSync(ackPath);

          // Analyze validation results for feedback signals
          if (content.validation) {
            const allPassed = Object.values(content.validation).every(v => v === true);
            records.push({
              taskId,
              type: allPassed ? 'positive' : 'negative',
              category: 'validation',
              timestamp: content.completed_at || stats.mtime.toISOString(),
              details: allPassed ? 'All validations passed' : 'Some validations failed',
            });
          }

          // Analyze KPIs for feedback
          if (content.kpis) {
            const kpisMet = Object.entries(content.kpis)
              .filter(([key, value]) => typeof value === 'boolean')
              .every(([_, value]) => value === true);

            records.push({
              taskId,
              type: kpisMet ? 'positive' : 'neutral',
              category: 'kpi',
              timestamp: content.completed_at || stats.mtime.toISOString(),
              details: kpisMet ? 'All KPIs met' : 'Some KPIs pending',
            });
          }

          // Check for RSI pattern usage (positive signal)
          if (content.approach?.pattern === 'RSI') {
            records.push({
              taskId,
              type: 'positive',
              category: 'architecture',
              timestamp: content.completed_at || stats.mtime.toISOString(),
              details: 'RSI pattern implemented',
            });
          }
        } catch {
          // Skip invalid files
        }
      }
    }
  } catch (error) {
    console.error('Error extracting feedback from attestations:', error);
  }

  return records;
}

// Load existing feedback file if available
function loadExistingFeedback(): FeedbackRecord[] {
  const projectRoot = getProjectRoot();
  const feedbackPath = join(projectRoot, 'artifacts', 'misc', 'feedback-analytics.json');

  try {
    if (existsSync(feedbackPath)) {
      const content = JSON.parse(readFileSync(feedbackPath, 'utf8'));
      if (content.records && Array.isArray(content.records)) {
        return content.records;
      }
    }
  } catch {
    // Fall back to attestation extraction
  }

  return [];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryFilter = searchParams.get('category');
    const daysFilter = searchParams.get('days');

    // Combine feedback from multiple sources
    const existingFeedback = loadExistingFeedback();
    const attestationFeedback = extractFeedbackFromAttestations();

    // Merge and deduplicate
    const feedbackMap = new Map<string, FeedbackRecord>();
    for (const record of [...existingFeedback, ...attestationFeedback]) {
      const key = `${record.taskId}-${record.category}-${record.type}`;
      if (!feedbackMap.has(key)) {
        feedbackMap.set(key, record);
      }
    }

    let allRecords = Array.from(feedbackMap.values());

    // Apply date filter
    if (daysFilter) {
      const days = parseInt(daysFilter, 10);
      if (!isNaN(days)) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        allRecords = allRecords.filter(r => new Date(r.timestamp) >= cutoff);
      }
    }

    // Apply category filter
    if (categoryFilter) {
      allRecords = allRecords.filter(r =>
        r.category.toLowerCase().includes(categoryFilter.toLowerCase())
      );
    }

    // Calculate summary
    const summary: FeedbackSummary = {
      total: allRecords.length,
      positive: allRecords.filter(r => r.type === 'positive').length,
      negative: allRecords.filter(r => r.type === 'negative').length,
      neutral: allRecords.filter(r => r.type === 'neutral').length,
      sentimentScore: 0,
      byCategory: {},
      trend: 'stable',
    };

    // Calculate sentiment score (-100 to +100)
    if (summary.total > 0) {
      summary.sentimentScore = Math.round(
        ((summary.positive - summary.negative) / summary.total) * 100
      );
    }

    // Group by category
    for (const record of allRecords) {
      summary.byCategory[record.category] = (summary.byCategory[record.category] || 0) + 1;
    }

    // Calculate trend (comparing recent vs older feedback)
    const midpoint = new Date();
    midpoint.setDate(midpoint.getDate() - 7);

    const recent = allRecords.filter(r => new Date(r.timestamp) >= midpoint);
    const older = allRecords.filter(r => new Date(r.timestamp) < midpoint);

    if (recent.length >= 3 && older.length >= 3) {
      const recentPositiveRate = recent.filter(r => r.type === 'positive').length / recent.length;
      const olderPositiveRate = older.filter(r => r.type === 'positive').length / older.length;

      if (recentPositiveRate > olderPositiveRate * 1.1) {
        summary.trend = 'improving';
      } else if (recentPositiveRate < olderPositiveRate * 0.9) {
        summary.trend = 'declining';
      }
    }

    // Recent records for display
    const recentRecords = allRecords
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 50);

    return NextResponse.json(
      {
        source: 'fresh',
        timestamp: new Date().toISOString(),
        pattern: 'RSI',
        filters: {
          category: categoryFilter || 'all',
          days: daysFilter || 'all',
        },
        summary,
        recentRecords,
        dataSources: {
          attestations: attestationFeedback.length,
          existingFeedback: existingFeedback.length,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error generating feedback analytics:', error);
    return NextResponse.json(
      { error: 'Failed to generate feedback analytics', details: String(error) },
      { status: 500 }
    );
  }
}
