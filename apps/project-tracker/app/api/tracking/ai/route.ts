import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ARTIFACTS_DIR = path.join(process.cwd(), '..', '..', 'artifacts');
const AI_METRICS_PATH = path.join(ARTIFACTS_DIR, 'metrics', 'ai-metrics.json');
const COST_BUDGET_PATH = path.join(ARTIFACTS_DIR, 'reports', 'cost-budget.csv');

export const dynamic = 'force-dynamic';

interface AIMetrics {
  models: Array<{
    name: string;
    latency_p50: number | null;
    latency_p95: number | null;
    accuracy: number | null;
    cost_per_1k: number;
    requests_24h: number;
    cost_total: number;
  }>;
  drift: {
    detected: boolean;
    score: number | null;
    lastCheck: string | null;
    threshold: number;
    history: Array<{ date: string; score: number; detected: boolean }>;
    alerts: Array<{ timestamp: string; severity: string; message: string }>;
  };
  costs: {
    current_month: number;
    budget: number;
    forecast: number;
    trend: 'up' | 'down' | 'stable';
    history: Array<{ date: string; amount: number }>;
    by_model: Record<string, number>;
  };
  hallucination: {
    rate: number | null;
    threshold: number;
    samples_checked: number;
    history: Array<{ date: string; rate: number }>;
  };
  slo: {
    p95_target_ms: number;
    p99_target_ms: number;
    p95_actual_ms: number | null;
    p99_actual_ms: number | null;
    p95_compliant: boolean | null;
    p99_compliant: boolean | null;
    success_rate: number | null;
  };
  roi: {
    current_percentage: number | null;
    target_percentage: number;
    total_cost: number;
    total_value: number;
    trend: 'improving' | 'stable' | 'declining' | null;
  };
}

interface RawAiMetrics {
  kpis?: {
    drift_detection?: {
      configuration?: {
        window_size_hours?: number;
        p_value_threshold?: number;
      };
    };
    hallucination_rate?: {
      target_percentage?: number;
      current_percentage?: number;
    };
    latency_slo?: {
      target_p95_ms?: number;
      target_p99_ms?: number;
      current_p95_ms?: number | null;
      current_p99_ms?: number | null;
    };
    roi_tracking?: {
      target_percentage?: number;
      current_percentage?: number | null;
    };
  };
  monitoring_components?: Record<string, { class?: string; file?: string }>;
  drift?: {
    lastCheck?: string;
  };
  lastRefresh?: string;
  history?: {
    drift?: Array<{ date: string; score: number; detected: boolean }>;
    hallucination?: Array<{ date: string; rate: number }>;
    costs?: Array<{ date: string; amount: number }>;
  };
}

async function readJsonFile(
  filePath: string
): Promise<{ data: RawAiMetrics | null; lastUpdated: string | null }> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const stats = await fs.stat(filePath);
    return {
      data: JSON.parse(content) as RawAiMetrics,
      lastUpdated: stats.mtime.toISOString(),
    };
  } catch {
    return { data: null, lastUpdated: null };
  }
}

async function parseCostBudget(): Promise<{ current: number; budget: number } | null> {
  try {
    const content = await fs.readFile(COST_BUDGET_PATH, 'utf-8');
    const lines = content.split('\n').filter((l: string) => l.trim());

    if (lines.length < 2) return null;

    for (const line of lines.slice(1)) {
      const lower = line.toLowerCase();
      if (lower.includes('ai') || lower.includes('inference') || lower.includes('openai')) {
        const values = line.split(',');
        return {
          budget: Number.parseFloat(values[1]) || 0,
          current: Number.parseFloat(values[2]) || 0,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const { data: aiData, lastUpdated } = await readJsonFile(AI_METRICS_PATH);
    const costData = await parseCostBudget();

    const kpis = aiData?.kpis;
    const driftConfig = kpis?.drift_detection?.configuration;
    const hallucinationKpi = kpis?.hallucination_rate;
    const latencySlo = kpis?.latency_slo;
    const roiKpi = kpis?.roi_tracking;

    const p95Actual = latencySlo?.current_p95_ms ?? null;
    const p99Actual = latencySlo?.current_p99_ms ?? null;
    const p95Target = latencySlo?.target_p95_ms ?? 2000;
    const p99Target = latencySlo?.target_p99_ms ?? 5000;

    const metrics: AIMetrics = {
      models: [],
      drift: {
        detected: false,
        score: null,
        lastCheck: aiData?.drift?.lastCheck ?? null,
        threshold: driftConfig?.p_value_threshold ?? 0.05,
        history: aiData?.history?.drift ?? [],
        alerts: [],
      },
      costs: {
        current_month: costData?.current ?? 0,
        budget: costData?.budget ?? 0,
        forecast: 0,
        trend: 'stable',
        history: aiData?.history?.costs ?? [],
        by_model: {},
      },
      hallucination: {
        rate:
          hallucinationKpi?.current_percentage == null
            ? null
            : hallucinationKpi.current_percentage / 100,
        threshold: (hallucinationKpi?.target_percentage ?? 5) / 100,
        samples_checked: 0,
        history: aiData?.history?.hallucination ?? [],
      },
      slo: {
        p95_target_ms: p95Target,
        p99_target_ms: p99Target,
        p95_actual_ms: p95Actual,
        p99_actual_ms: p99Actual,
        p95_compliant: p95Actual == null ? null : p95Actual <= p95Target,
        p99_compliant: p99Actual == null ? null : p99Actual <= p99Target,
        success_rate: null,
      },
      roi: {
        current_percentage: roiKpi?.current_percentage ?? null,
        target_percentage: roiKpi?.target_percentage ?? 200,
        total_cost: 0,
        total_value: 0,
        trend: null,
      },
    };

    return NextResponse.json({
      status: 'ok',
      metrics,
      lastUpdated,
    });
  } catch (error) {
    console.error('Error reading AI metrics:', error);
    return NextResponse.json({ status: 'error', message: String(error) }, { status: 500 });
  }
}

export async function POST(_request: NextRequest) {
  try {
    const currentTime = new Date().toISOString();
    const currentDate = currentTime.slice(0, 10);

    let metrics: Record<string, unknown> = {};
    try {
      const content = await fs.readFile(AI_METRICS_PATH, 'utf-8');
      metrics = JSON.parse(content) as Record<string, unknown>;
    } catch {
      // File doesn't exist — start from empty
    }

    // Update timestamps
    metrics.lastRefresh = currentTime;
    const drift = (metrics.drift as Record<string, unknown>) ?? {};
    drift.lastCheck = currentTime;
    metrics.drift = drift;

    // Append history entries
    const history = (metrics.history as Record<string, unknown[]>) ?? {};

    const driftHistory = Array.isArray(history.drift) ? [...history.drift] : [];
    driftHistory.push({ date: currentDate, score: 0, detected: false });
    if (driftHistory.length > 30) {
      history.drift = driftHistory.slice(-30);
    } else {
      history.drift = driftHistory;
    }

    const hallucinationHistory = Array.isArray(history.hallucination)
      ? [...history.hallucination]
      : [];
    hallucinationHistory.push({ date: currentDate, rate: 0 });
    if (hallucinationHistory.length > 30) {
      history.hallucination = hallucinationHistory.slice(-30);
    } else {
      history.hallucination = hallucinationHistory;
    }

    const costsHistory = Array.isArray(history.costs) ? [...history.costs] : [];
    costsHistory.push({ date: currentDate, amount: 0 });
    if (costsHistory.length > 30) {
      history.costs = costsHistory.slice(-30);
    } else {
      history.costs = costsHistory;
    }

    metrics.history = history;

    // Save updated metrics
    await fs.mkdir(path.dirname(AI_METRICS_PATH), { recursive: true });
    await fs.writeFile(AI_METRICS_PATH, JSON.stringify(metrics, null, 2));

    // Re-read and return
    const response = await GET();
    const data = await response.json();

    return NextResponse.json({
      status: 'ok',
      message: 'AI metrics refreshed',
      metrics: data.metrics,
    });
  } catch (error) {
    console.error('Error refreshing AI metrics:', error);
    return NextResponse.json({ status: 'error', message: String(error) }, { status: 500 });
  }
}
