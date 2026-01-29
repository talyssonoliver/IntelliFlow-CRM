/**
 * GET /api/metrics/capacity
 *
 * Returns capacity data combining config from capacity-model.csv
 * with calculated utilization from Sprint_plan.csv task assignments
 */

import { NextResponse } from 'next/server';
import { loadCSVTasks } from '@/lib/governance';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface CapacityRole {
  role: string;
  fte: number;
  availableDays: number;
  focusFactor: number;
  notes: string;
  actualTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  utilization: number;
}

function getProjectRoot(): string {
  return process.cwd().replace(/[\\/]apps[\\/]project-tracker$/, '');
}

function loadCapacityConfig(): CapacityRole[] {
  const projectRoot = getProjectRoot();
  const configPath = join(projectRoot, 'artifacts', 'misc', 'capacity-model.csv');

  if (!existsSync(configPath)) {
    return [];
  }

  try {
    const content = readFileSync(configPath, 'utf8');
    const lines = content.trim().split('\n');

    if (lines.length < 2) return [];

    // Skip header row
    return lines.slice(1).map(line => {
      // Parse CSV properly handling quoted values
      const values: string[] = [];
      let current = '';
      let inQuotes = false;

      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      return {
        role: values[0] || 'Unknown',
        fte: parseFloat(values[1]) || 1.0,
        availableDays: parseInt(values[2], 10) || 10,
        focusFactor: parseFloat(values[3]) || 0.7,
        notes: values[4] || '',
        actualTasks: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        utilization: 0,
      };
    }).filter(r => r.role && r.role !== 'Unknown');
  } catch {
    return [];
  }
}

function mapOwnerToRole(owner: string): string {
  const ownerLower = owner.toLowerCase();

  if (ownerLower.includes('qa') || ownerLower.includes('test')) {
    return 'QA';
  }
  if (ownerLower.includes('devops') || ownerLower.includes('infra') || ownerLower.includes('ops')) {
    return 'DevOps';
  }
  if (ownerLower.includes('ai') || ownerLower.includes('ml') || ownerLower.includes('intelligence')) {
    return 'AI Specialist';
  }
  if (ownerLower.includes('security') || ownerLower.includes('sec')) {
    return 'Security';
  }
  // Default to Engineering
  return 'Engineering';
}

export async function GET() {
  try {
    const roles = loadCapacityConfig();
    const allTasks = loadCSVTasks();

    if (!allTasks.length) {
      return NextResponse.json(
        { error: 'No tasks found' },
        { status: 404 }
      );
    }

    // Create a role map for tracking
    const roleMap = new Map<string, CapacityRole>();
    for (const role of roles) {
      roleMap.set(role.role, { ...role });
    }

    // If no roles from config, create default ones
    if (roleMap.size === 0) {
      roleMap.set('Engineering', {
        role: 'Engineering',
        fte: 1.0,
        availableDays: 10,
        focusFactor: 0.7,
        notes: 'Default',
        actualTasks: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        utilization: 0,
      });
    }

    // Track tasks by role
    const roleTaskCounts = new Map<string, { total: number; completed: number; inProgress: number }>();

    for (const task of allTasks) {
      const owner = task.owner || 'Unassigned';
      const role = mapOwnerToRole(owner);

      if (!roleTaskCounts.has(role)) {
        roleTaskCounts.set(role, { total: 0, completed: 0, inProgress: 0 });
      }

      const counts = roleTaskCounts.get(role)!;
      counts.total++;

      const status = task.status.toLowerCase();
      if (status === 'completed' || status === 'done') {
        counts.completed++;
      } else if (status === 'in progress' || status === 'in_progress') {
        counts.inProgress++;
      }
    }

    // Merge task counts with capacity config
    const resultRoles: CapacityRole[] = [];

    // First add configured roles
    for (const [roleName, roleConfig] of roleMap) {
      const taskCounts = roleTaskCounts.get(roleName) || { total: 0, completed: 0, inProgress: 0 };
      const capacity = roleConfig.fte * roleConfig.availableDays * roleConfig.focusFactor;
      // Estimate: 1 task = ~0.5 days of work on average
      const taskDays = taskCounts.total * 0.5;
      const utilization = capacity > 0 ? Math.min(100, Math.round((taskDays / capacity) * 100)) : 0;

      resultRoles.push({
        ...roleConfig,
        actualTasks: taskCounts.total,
        completedTasks: taskCounts.completed,
        inProgressTasks: taskCounts.inProgress,
        utilization,
      });
    }

    // Add any roles from tasks that aren't in config
    for (const [roleName, taskCounts] of roleTaskCounts) {
      if (!roleMap.has(roleName)) {
        resultRoles.push({
          role: roleName,
          fte: 1.0,
          availableDays: 10,
          focusFactor: 0.7,
          notes: 'Auto-detected from tasks',
          actualTasks: taskCounts.total,
          completedTasks: taskCounts.completed,
          inProgressTasks: taskCounts.inProgress,
          utilization: Math.min(100, Math.round((taskCounts.total * 0.5 / 7) * 100)),
        });
      }
    }

    // Sort by utilization descending
    resultRoles.sort((a, b) => b.utilization - a.utilization);

    // Calculate totals
    const totalCapacity = resultRoles.reduce((sum, r) => sum + (r.fte * r.availableDays * r.focusFactor), 0);
    const totalTasks = resultRoles.reduce((sum, r) => sum + r.actualTasks, 0);
    const totalCompleted = resultRoles.reduce((sum, r) => sum + r.completedTasks, 0);
    const totalUtilization = totalCapacity > 0
      ? Math.min(100, Math.round(((totalTasks * 0.5) / totalCapacity) * 100))
      : 0;

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      roles: resultRoles,
      summary: {
        totalCapacityDays: Math.round(totalCapacity * 10) / 10,
        totalTasks,
        totalCompleted,
        totalUtilization,
        rolesCount: resultRoles.length,
      },
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, max-age=0',
      },
    });
  } catch (error) {
    console.error('Error generating capacity data:', error);
    return NextResponse.json(
      { error: 'Failed to generate capacity data', details: String(error) },
      { status: 500 }
    );
  }
}
