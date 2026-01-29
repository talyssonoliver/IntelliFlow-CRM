/**
 * GET /api/metrics/team-velocity
 *
 * RSI (Recursive Self-Improvement) endpoint that dynamically calculates
 * team velocity from Sprint_plan.csv and task completion data.
 *
 * Velocity = completed tasks per sprint
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadCSVTasks } from '@/lib/governance';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SprintVelocity {
  sprint: number;
  planned: number;
  completed: number;
  velocity: number; // completed / planned ratio
  tasksPerDay: number; // assuming 10-day sprints
}

interface OwnerVelocity {
  owner: string;
  completed: number;
  inProgress: number;
  planned: number;
  completionRate: number;
}

interface SectionVelocity {
  section: string;
  completed: number;
  total: number;
  completionRate: number;
}

// Get project root path
function getProjectRoot(): string {
  return process.cwd().replace(/[\\/]apps[\\/]project-tracker$/, '');
}

/**
 * Attestation data structure from context_ack.json
 * This is the SINGLE SOURCE OF TRUTH for task completion evidence
 */
interface AttestationData {
  task_id: string;
  attestation_timestamp: string;
  verdict: 'COMPLETE' | 'INCOMPLETE' | 'PENDING';
  evidence_summary: {
    artifacts_verified: number;
    validations_passed: number;
    kpis_met: number;
  };
  kpi_results?: Array<{
    kpi: string;
    target: string;
    actual: string;
    met: boolean;
  }>;
}

// Load completion data from attestation files (single source of truth)
function loadAttestationData(): Map<string, AttestationData> {
  const projectRoot = getProjectRoot();
  const attestationsDir = join(projectRoot, 'artifacts', 'attestations');
  const attestations = new Map<string, AttestationData>();

  try {
    if (!existsSync(attestationsDir)) return attestations;

    const taskDirs = readdirSync(attestationsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const taskId of taskDirs) {
      const ackPath = join(attestationsDir, taskId, 'context_ack.json');
      if (existsSync(ackPath)) {
        try {
          const content = JSON.parse(readFileSync(ackPath, 'utf8')) as AttestationData;
          attestations.set(taskId, content);
        } catch {
          // Skip invalid files
        }
      }
    }
  } catch (error) {
    console.error('Error loading attestations:', error);
  }

  return attestations;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sprintFilter = searchParams.get('sprint');
    const ownerFilter = searchParams.get('owner');

    // Load fresh data from CSV (source of truth for task list)
    const allTasks = loadCSVTasks();
    // Load attestation data (source of truth for completion evidence)
    const attestations = loadAttestationData();

    if (!allTasks.length) {
      return NextResponse.json(
        {
          error: 'No tasks found',
          message: 'Sprint_plan.csv is empty or not found',
        },
        { status: 404 }
      );
    }

    // Filter out continuous tasks for velocity calculation
    const sprintTasks = allTasks.filter(t => typeof t.sprint === 'number');

    // Calculate velocity by sprint
    const sprintMap = new Map<number, { planned: number; completed: number }>();

    for (const task of sprintTasks) {
      const sprint = task.sprint as number;
      if (!sprintMap.has(sprint)) {
        sprintMap.set(sprint, { planned: 0, completed: 0 });
      }
      const counts = sprintMap.get(sprint)!;
      counts.planned++;

      const status = task.status.toLowerCase();
      if (status === 'completed' || status === 'done') {
        counts.completed++;
      }
    }

    const sprintVelocities: SprintVelocity[] = Array.from(sprintMap.entries())
      .map(([sprint, counts]) => ({
        sprint,
        planned: counts.planned,
        completed: counts.completed,
        velocity: counts.planned > 0
          ? Math.round((counts.completed / counts.planned) * 100)
          : 0,
        tasksPerDay: Math.round((counts.completed / 10) * 10) / 10, // 10-day sprint assumption
      }))
      .sort((a, b) => a.sprint - b.sprint);

    // Calculate velocity by owner
    const ownerMap = new Map<string, { completed: number; inProgress: number; planned: number }>();

    for (const task of allTasks) {
      const owner = task.owner || 'Unassigned';
      if (!ownerMap.has(owner)) {
        ownerMap.set(owner, { completed: 0, inProgress: 0, planned: 0 });
      }
      const counts = ownerMap.get(owner)!;

      const status = task.status.toLowerCase();
      if (status === 'completed' || status === 'done') {
        counts.completed++;
      } else if (status === 'in progress' || status === 'in_progress') {
        counts.inProgress++;
      } else {
        counts.planned++;
      }
    }

    let ownerVelocities: OwnerVelocity[] = Array.from(ownerMap.entries())
      .map(([owner, counts]) => ({
        owner,
        completed: counts.completed,
        inProgress: counts.inProgress,
        planned: counts.planned,
        completionRate: (counts.completed + counts.inProgress + counts.planned) > 0
          ? Math.round((counts.completed / (counts.completed + counts.inProgress + counts.planned)) * 100)
          : 0,
      }))
      .sort((a, b) => b.completed - a.completed);

    if (ownerFilter) {
      ownerVelocities = ownerVelocities.filter(o =>
        o.owner.toLowerCase().includes(ownerFilter.toLowerCase())
      );
    }

    // Calculate velocity by section
    const sectionMap = new Map<string, { completed: number; total: number }>();

    for (const task of allTasks) {
      if (!sectionMap.has(task.section)) {
        sectionMap.set(task.section, { completed: 0, total: 0 });
      }
      const counts = sectionMap.get(task.section)!;
      counts.total++;

      const status = task.status.toLowerCase();
      if (status === 'completed' || status === 'done') {
        counts.completed++;
      }
    }

    const sectionVelocities: SectionVelocity[] = Array.from(sectionMap.entries())
      .map(([section, counts]) => ({
        section,
        completed: counts.completed,
        total: counts.total,
        completionRate: counts.total > 0
          ? Math.round((counts.completed / counts.total) * 100)
          : 0,
      }))
      .sort((a, b) => b.completionRate - a.completionRate);

    // Calculate overall metrics
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t => {
      const status = t.status.toLowerCase();
      return status === 'completed' || status === 'done';
    }).length;

    // Calculate KPI metrics from attestations (source of truth for completion evidence)
    const attestedTasks = Array.from(attestations.values());
    const kpiSummary = {
      tasksWithAttestation: attestedTasks.length,
      tasksComplete: attestedTasks.filter(a => a.verdict === 'COMPLETE').length,
      totalKpisMet: attestedTasks.reduce((sum, a) => sum + (a.evidence_summary?.kpis_met || 0), 0),
      totalValidationsPassed: attestedTasks.reduce((sum, a) => sum + (a.evidence_summary?.validations_passed || 0), 0),
      totalArtifactsVerified: attestedTasks.reduce((sum, a) => sum + (a.evidence_summary?.artifacts_verified || 0), 0),
    };

    // Calculate trend (comparing last 3 sprints)
    const recentSprints = sprintVelocities.slice(-3);
    let trend = 'stable';
    if (recentSprints.length >= 2) {
      const avgRecent = recentSprints.reduce((sum, s) => sum + s.velocity, 0) / recentSprints.length;
      const avgPrevious = sprintVelocities.slice(-6, -3).reduce((sum, s) => sum + s.velocity, 0) / Math.max(1, sprintVelocities.slice(-6, -3).length);
      if (avgRecent > avgPrevious * 1.1) trend = 'improving';
      else if (avgRecent < avgPrevious * 0.9) trend = 'declining';
    }

    // Filter by sprint if requested
    let filteredSprintVelocities = sprintVelocities;
    if (sprintFilter) {
      const sprintNum = parseInt(sprintFilter, 10);
      if (!isNaN(sprintNum)) {
        filteredSprintVelocities = sprintVelocities.filter(s => s.sprint === sprintNum);
      }
    }

    return NextResponse.json(
      {
        source: 'fresh',
        timestamp: new Date().toISOString(),
        pattern: 'RSI',
        filters: {
          sprint: sprintFilter || 'all',
          owner: ownerFilter || 'all',
        },
        summary: {
          totalTasks,
          completedTasks,
          overallCompletionRate: Math.round((completedTasks / totalTasks) * 100),
          averageVelocity: sprintVelocities.length > 0
            ? Math.round(sprintVelocities.reduce((sum, s) => sum + s.velocity, 0) / sprintVelocities.length)
            : 0,
          trend,
        },
        // KPI tracking from attestations (single source of truth)
        kpiSummary,
        bySprint: filteredSprintVelocities,
        byOwner: ownerVelocities.slice(0, 20), // Top 20 owners
        bySection: sectionVelocities,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error generating team velocity:', error);
    return NextResponse.json(
      { error: 'Failed to generate team velocity', details: String(error) },
      { status: 500 }
    );
  }
}
