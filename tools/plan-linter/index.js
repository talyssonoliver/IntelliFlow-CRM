#!/usr/bin/env node
/**
 * Plan Linter - Sprint Plan Validation Tool
 *
 * Validates Sprint_plan.csv against plan-overrides.yaml and validation.yaml
 * Detects cycles, cross-sprint dependencies, missing gates, and generates review queue.
 *
 * Usage: node tools/plan-linter/index.js [--fix] [--sprint N] [--verbose]
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// -----------------------------------------------------------------------------
// CONFIGURATION
// -----------------------------------------------------------------------------

const ROOT_DIR = path.resolve(__dirname, '../..');
const CONFIG_PATH = path.join(__dirname, 'config.yaml');

// Default paths (can be overridden by config)
const DEFAULT_PATHS = {
  sprint_plan: 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv',
  plan_overrides: 'apps/project-tracker/docs/metrics/plan-overrides.yaml',
  validation_rules: 'apps/project-tracker/docs/metrics/validation.yaml',
  review_queue: 'apps/project-tracker/docs/metrics/review-queue.json',
  lint_report: 'artifacts/reports/plan-lint-report.json'
};

// -----------------------------------------------------------------------------
// CSV PARSER
// -----------------------------------------------------------------------------

function parseCSV(content) {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  // Parse header
  const header = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    header.forEach((col, idx) => {
      row[col.trim().replace(/^\uFEFF/, '')] = values[idx] || '';
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  return values;
}

// -----------------------------------------------------------------------------
// YAML LOADER
// -----------------------------------------------------------------------------

function loadYAML(filepath) {
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    return yaml.load(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`Warning: File not found: ${filepath}`);
      return null;
    }
    throw err;
  }
}

// -----------------------------------------------------------------------------
// DEPENDENCY ANALYSIS
// -----------------------------------------------------------------------------

function parseDependencies(depString) {
  if (!depString || depString.trim() === '') return [];
  return depString.split(',').map(d => d.trim()).filter(d => d);
}

function applyDependencyOverrides(taskId, deps, overrides) {
  const override = overrides?.[taskId];
  if (!override) return deps;

  let updated = deps;

  if (Array.isArray(override.override_deps_remove) && override.override_deps_remove.length > 0) {
    updated = updated.filter(d => !override.override_deps_remove.includes(d));
  }

  if (Array.isArray(override.override_deps_add) && override.override_deps_add.length > 0) {
    updated = [...updated, ...override.override_deps_add];
  }

  // Preserve order but remove duplicates
  return [...new Set(updated)];
}

function buildDependencyGraph(tasks, overrides) {
  const graph = new Map();
  const taskIds = new Set(tasks.map(t => t['Task ID']));

  tasks.forEach(task => {
    const id = task['Task ID'];
    const deps = applyDependencyOverrides(
      id,
      parseDependencies(task['Dependencies'] || task['CleanDependencies']),
      overrides
    );
    graph.set(id, deps);
  });

  return { graph, taskIds };
}

function detectCycles(graph) {
  const cycles = [];
  const visited = new Set();
  const recursionStack = new Set();

  function dfs(node, path) {
    if (recursionStack.has(node)) {
      const cycleStart = path.indexOf(node);
      const cycle = path.slice(cycleStart).concat(node);
      cycles.push(cycle);
      return true;
    }

    if (visited.has(node)) return false;

    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const deps = graph.get(node) || [];
    for (const dep of deps) {
      if (graph.has(dep)) {
        dfs(dep, [...path]);
      }
    }

    recursionStack.delete(node);
    return false;
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }

  return cycles;
}

function detectCrossSprintDeps(tasks, overrides) {
  const violations = [];
  const sprintMap = new Map();

  // Build sprint map
  tasks.forEach(task => {
    const id = task['Task ID'];
    let sprint = parseInt(task['Target Sprint'], 10);

    // Check for sprint override
    if (overrides && overrides[id] && overrides[id].sprint_override !== undefined) {
      sprint = overrides[id].sprint_override;
    }

    if (!isNaN(sprint)) {
      sprintMap.set(id, sprint);
    }
  });

  // Check for violations
  tasks.forEach(task => {
    const id = task['Task ID'];
    const taskSprint = sprintMap.get(id);
    if (taskSprint === undefined) return;

    let deps = parseDependencies(task['Dependencies'] || task['CleanDependencies']);

    // Apply dependency overrides
    if (overrides && overrides[id]) {
      const override = overrides[id];
      if (override.override_deps_remove) {
        deps = deps.filter(d => !override.override_deps_remove.includes(d));
      }
      if (override.override_deps_add) {
        deps = [...deps, ...override.override_deps_add];
      }
    }

    deps.forEach(dep => {
      const depSprint = sprintMap.get(dep);
      if (depSprint !== undefined && depSprint > taskSprint) {
        violations.push({
          task: id,
          taskSprint,
          dependency: dep,
          depSprint,
          resolved: overrides && overrides[id] &&
                   overrides[id].override_deps_remove &&
                   overrides[id].override_deps_remove.includes(dep)
        });
      }
    });
  });

  return violations;
}

function computeFanout(tasks) {
  const dependentCount = new Map();

  tasks.forEach(task => {
    const deps = parseDependencies(task['Dependencies'] || task['CleanDependencies']);
    deps.forEach(dep => {
      dependentCount.set(dep, (dependentCount.get(dep) || 0) + 1);
    });
  });

  return dependentCount;
}

// -----------------------------------------------------------------------------
// VALIDATION ANALYSIS
// -----------------------------------------------------------------------------

function checkValidationCoverage(tasks, validationRules, sprint) {
  const missing = [];
  const validatedIds = new Set(Object.keys(validationRules || {}).filter(
    k => !k.startsWith('global_')
  ));

  tasks.filter(t => sprint === undefined || parseInt(t['Target Sprint'], 10) === sprint)
    .forEach(task => {
      const id = task['Task ID'];
      if (!validatedIds.has(id)) {
        missing.push({
          task_id: id,
          section: task['Section'],
          description: task['Description']
        });
      }
    });

  return missing;
}

// -----------------------------------------------------------------------------
// TIER ANALYSIS
// -----------------------------------------------------------------------------

function computeTiers(tasks, overrides, fanout, config) {
  const tiers = new Map();
  const defaults = config?.tier_defaults || {};

  tasks.forEach(task => {
    const id = task['Task ID'];

    // Check explicit override first
    if (overrides && overrides[id] && overrides[id].tier) {
      tiers.set(id, overrides[id].tier);
      return;
    }

    // Apply defaults
    const deps = parseDependencies(task['Dependencies'] || task['CleanDependencies']);
    const depCount = fanout.get(id) || 0;

    // Root tasks (no dependencies)
    if (deps.length === 0 && defaults.root_tasks) {
      tiers.set(id, defaults.root_tasks);
      return;
    }

    // High fan-out tasks
    if (depCount >= (config?.soft_rules?.find(r => r.id === 'HIGH_FANOUT')?.threshold || 3)) {
      tiers.set(id, defaults.high_fanout || 'A');
      return;
    }

    // Security tasks
    if (defaults.security_prefix?.some(p => id.startsWith(p))) {
      tiers.set(id, defaults.security_tier || 'A');
      return;
    }

    // Foundation tasks
    if (defaults.foundation_prefix?.some(p => id.startsWith(p))) {
      tiers.set(id, defaults.foundation_tier || 'B');
      return;
    }

    // Default tier
    tiers.set(id, defaults.default_tier || 'C');
  });

  return tiers;
}

// -----------------------------------------------------------------------------
// RULE CHECKING
// -----------------------------------------------------------------------------

function checkHardRules(tasks, overrides, validationRules, config) {
  const errors = [];
  const { graph, taskIds } = buildDependencyGraph(tasks, overrides);

  // Check for cycles
  const cycles = detectCycles(graph);
  if (cycles.length > 0) {
    cycles.forEach(cycle => {
      errors.push({
        rule: 'NO_CYCLES',
        severity: 'error',
        message: `Dependency cycle detected: ${cycle.join(' -> ')}`,
        tasks: cycle,
        fix: 'Add override_deps_remove in plan-overrides.yaml to break cycle'
      });
    });
  }

  // Check for cross-sprint dependencies
  const crossSprintViolations = detectCrossSprintDeps(tasks, overrides);
  const unresolvedViolations = crossSprintViolations.filter(v => !v.resolved);

  unresolvedViolations.forEach(v => {
    errors.push({
      rule: 'NO_CROSS_SPRINT_UNRESOLVED',
      severity: 'error',
      message: `Cross-sprint dependency: ${v.task} (Sprint ${v.taskSprint}) depends on ${v.dependency} (Sprint ${v.depSprint})`,
      tasks: [v.task, v.dependency],
      fix: 'Add sprint_override or override_deps_remove in plan-overrides.yaml'
    });
  });

  // Check Tier A requirements
  const fanout = computeFanout(tasks);
  const tiers = computeTiers(tasks, overrides, fanout, config);

  tasks.forEach(task => {
    const id = task['Task ID'];
    const tier = overrides?.[id]?.tier || tiers.get(id);

    if (tier === 'A') {
      const override = overrides?.[id] || {};

      if (!override.gate_profile || override.gate_profile.length === 0) {
        errors.push({
          rule: 'TIER_A_GATES_REQUIRED',
          severity: 'error',
          message: `Tier A task ${id} missing gate_profile`,
          tasks: [id],
          fix: 'Add gate_profile array to task in plan-overrides.yaml'
        });
      }

      if (!override.acceptance_owner) {
        errors.push({
          rule: 'TIER_A_OWNER_REQUIRED',
          severity: 'error',
          message: `Tier A task ${id} missing acceptance_owner`,
          tasks: [id],
          fix: 'Add acceptance_owner to task in plan-overrides.yaml'
        });
      }

      if (!override.evidence_required || override.evidence_required.length === 0) {
        errors.push({
          rule: 'TIER_A_EVIDENCE_REQUIRED',
          severity: 'error',
          message: `Tier A task ${id} missing evidence_required`,
          tasks: [id],
          fix: 'Add evidence_required array to task in plan-overrides.yaml'
        });
      }
    }
  });

  // Check dependency resolution
  tasks.forEach(task => {
    const deps = parseDependencies(task['Dependencies'] || task['CleanDependencies']);
    deps.forEach(dep => {
      if (!taskIds.has(dep)) {
        errors.push({
          rule: 'DEPS_RESOLVE',
          severity: 'error',
          message: `Task ${task['Task ID']} has unresolved dependency: ${dep}`,
          tasks: [task['Task ID']],
          fix: 'Fix typo in dependency or add missing task to Sprint_plan.csv'
        });
      }
    });
  });

  return errors;
}

function checkSoftRules(tasks, overrides, validationRules, config, sprint) {
  const warnings = [];
  const fanout = computeFanout(tasks);
  const tiers = computeTiers(tasks, overrides, fanout, config);

  // Filter by sprint if specified
  const sprintTasks = sprint !== undefined
    ? tasks.filter(t => parseInt(t['Target Sprint'], 10) === sprint)
    : tasks;

  // Check validation coverage
  const missingValidation = checkValidationCoverage(sprintTasks, validationRules, sprint);
  missingValidation.forEach(m => {
    warnings.push({
      rule: 'MISSING_VALIDATION',
      severity: 'warning',
      message: `Task ${m.task_id} has no validation commands in validation.yaml`,
      tasks: [m.task_id],
      priority: 'high',
      section: m.section
    });
  });

  // Check AI/predictive tasks
  sprintTasks.forEach(task => {
    const id = task['Task ID'];
    const desc = task['Description'] || '';

    if (desc.toLowerCase().includes('predictive') ||
        desc.toLowerCase().includes('ai-optimized') ||
        desc.toLowerCase().includes('ai-generated')) {
      const override = overrides?.[id];
      if (!override || !override.notes?.includes('MVP')) {
        warnings.push({
          rule: 'AI_TASKS_MVP',
          severity: 'warning',
          message: `AI/Predictive task ${id} should have MVP criteria defined`,
          tasks: [id],
          priority: 'medium'
        });
      }
    }
  });

  // Check high fan-out tasks
  const threshold = config?.soft_rules?.find(r => r.id === 'HIGH_FANOUT')?.threshold || 3;
  sprintTasks.forEach(task => {
    const id = task['Task ID'];
    const count = fanout.get(id) || 0;

    if (count >= threshold) {
      warnings.push({
        rule: 'HIGH_FANOUT',
        severity: 'info',
        message: `Task ${id} has ${count} direct dependents (high fan-out)`,
        tasks: [id],
        priority: 'high',
        dependentCount: count
      });
    }
  });

  // Check Tier B without gates
  sprintTasks.forEach(task => {
    const id = task['Task ID'];
    const tier = overrides?.[id]?.tier || tiers.get(id);
    const override = overrides?.[id];

    if (tier === 'B' && (!override?.gate_profile || override.gate_profile.length === 0)) {
      warnings.push({
        rule: 'TIER_B_MISSING_GATES',
        severity: 'warning',
        message: `Tier B task ${id} missing gate_profile`,
        tasks: [id],
        priority: 'medium'
      });
    }
  });

  // Check waivers
  sprintTasks.forEach(task => {
    const id = task['Task ID'];
    const override = overrides?.[id];

    if (override?.debt_allowed === true || override?.debt_allowed === 'yes') {
      warnings.push({
        rule: 'WAIVER_USED',
        severity: 'info',
        message: `Task ${id} has debt_allowed=true`,
        tasks: [id],
        priority: 'low',
        waiver_expiry: override.waiver_expiry
      });
    }

    if (override?.waiver_expiry) {
      const expiry = new Date(override.waiver_expiry);
      const now = new Date();
      const daysUntilExpiry = Math.floor((expiry - now) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
        warnings.push({
          rule: 'WAIVER_EXPIRING',
          severity: 'warning',
          message: `Task ${id} waiver expires in ${daysUntilExpiry} days (${override.waiver_expiry})`,
          tasks: [id],
          priority: 'high',
          days_until_expiry: daysUntilExpiry
        });
      } else if (daysUntilExpiry <= 0) {
        warnings.push({
          rule: 'WAIVER_EXPIRING',
          severity: 'error',
          message: `Task ${id} waiver has EXPIRED (${override.waiver_expiry})`,
          tasks: [id],
          priority: 'critical',
          days_until_expiry: daysUntilExpiry
        });
      }
    }

    if (override?.exception_policy) {
      warnings.push({
        rule: 'EXCEPTION_POLICY',
        severity: 'info',
        message: `Task ${id} uses exception_policy: ${override.exception_policy}`,
        tasks: [id],
        priority: 'medium',
        policy: override.exception_policy
      });
    }
  });

  return warnings;
}

// -----------------------------------------------------------------------------
// REVIEW QUEUE GENERATION
// -----------------------------------------------------------------------------

function generateReviewQueue(tasks, overrides, validationRules, config, errors, warnings, sprint) {
  const queue = [];
  const fanout = computeFanout(tasks);
  const tiers = computeTiers(tasks, overrides, fanout, config);
  const reviewConfig = config?.review_queue || {};

  // Filter by sprint if specified
  const sprintTasks = sprint !== undefined
    ? tasks.filter(t => parseInt(t['Target Sprint'], 10) === sprint)
    : tasks;

  sprintTasks.forEach(task => {
    const id = task['Task ID'];
    const tier = overrides?.[id]?.tier || tiers.get(id);
    const override = overrides?.[id] || {};
    const dependentCount = fanout.get(id) || 0;

    const reasons = [];
    const evidenceMissing = [];

    // Check Tier A inclusion
    if (reviewConfig.include_tier_a && tier === 'A') {
      reasons.push('Tier A task - requires explicit validation');
    }

    // Check high fan-out
    if (reviewConfig.include_high_fanout &&
        dependentCount >= (reviewConfig.fanout_threshold || 3)) {
      reasons.push(`High fan-out (${dependentCount} dependents)`);
    }

    // Check waivers
    if (reviewConfig.include_waivers &&
        (override.debt_allowed === true || override.waiver_expiry)) {
      reasons.push('Has waiver or debt_allowed');
    }

    // Check for errors related to this task
    const taskErrors = errors.filter(e => e.tasks?.includes(id));
    if (taskErrors.length > 0) {
      reasons.push(`Has ${taskErrors.length} error(s)`);
      taskErrors.forEach(e => {
        if (e.rule === 'TIER_A_EVIDENCE_REQUIRED') {
          evidenceMissing.push('evidence_required not defined');
        }
      });
    }

    // Check for warnings
    const taskWarnings = warnings.filter(w => w.tasks?.includes(id));
    const missingValidation = taskWarnings.find(w => w.rule === 'MISSING_VALIDATION');
    if (missingValidation) {
      reasons.push('Missing validation.yaml entry');
    }

    // Add to queue if has reasons
    if (reasons.length > 0) {
      queue.push({
        task_id: id,
        tier,
        section: task['Section'],
        status: task['Status'],
        owner: override.acceptance_owner || task['Owner'],
        reasons,
        evidence_missing: evidenceMissing.length > 0 ? evidenceMissing : undefined,
        dependent_count: dependentCount > 0 ? dependentCount : undefined,
        waiver_expiry: override.waiver_expiry,
        priority: tier === 'A' ? 'critical' :
                  dependentCount >= 3 ? 'high' :
                  taskErrors.length > 0 ? 'high' : 'medium'
      });
    }
  });

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  queue.sort((a, b) => (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3));

  return queue;
}

// -----------------------------------------------------------------------------
// REPORT GENERATION
// -----------------------------------------------------------------------------

function generateReport(tasks, overrides, validationRules, config, errors, warnings, reviewQueue, sprint) {
  const fanout = computeFanout(tasks);
  const tiers = computeTiers(tasks, overrides, fanout, config);

  const sprintTasks = sprint !== undefined
    ? tasks.filter(t => parseInt(t['Target Sprint'], 10) === sprint)
    : tasks;

  const tierCounts = { A: 0, B: 0, C: 0 };
  sprintTasks.forEach(task => {
    const tier = overrides?.[task['Task ID']]?.tier || tiers.get(task['Task ID']) || 'C';
    tierCounts[tier]++;
  });

  return {
    meta: {
      generated_at: new Date().toISOString(),
      schema_version: '1.0.0',
      sprint_scope: sprint !== undefined ? sprint : 'all'
    },
    summary: {
      total_tasks: sprintTasks.length,
      tier_breakdown: tierCounts,
      error_count: errors.length,
      warning_count: warnings.length,
      review_queue_size: reviewQueue.length,
      validation_coverage: {
        tasks_with_validation: sprintTasks.filter(t =>
          validationRules && validationRules[t['Task ID']]
        ).length,
        tasks_without_validation: sprintTasks.filter(t =>
          !validationRules || !validationRules[t['Task ID']]
        ).length,
        coverage_percentage: validationRules
          ? Math.round((sprintTasks.filter(t => validationRules[t['Task ID']]).length / sprintTasks.length) * 100)
          : 0
      }
    },
    errors,
    warnings,
    review_queue: reviewQueue,
    tasks_by_tier: {
      A: sprintTasks.filter(t => (overrides?.[t['Task ID']]?.tier || tiers.get(t['Task ID'])) === 'A').map(t => t['Task ID']),
      B: sprintTasks.filter(t => (overrides?.[t['Task ID']]?.tier || tiers.get(t['Task ID'])) === 'B').map(t => t['Task ID']),
      C: sprintTasks.filter(t => (overrides?.[t['Task ID']]?.tier || tiers.get(t['Task ID'])) === 'C').map(t => t['Task ID'])
    }
  };
}

// -----------------------------------------------------------------------------
// MAIN
// -----------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const sprintArg = args.find(a => a.startsWith('--sprint='));
  const sprint = sprintArg ? parseInt(sprintArg.split('=')[1], 10) : 0; // Default to Sprint 0

  console.log('========================================');
  console.log('Plan Linter v1.0.0');
  console.log('========================================\n');

  // Load configuration
  let config;
  try {
    config = loadYAML(CONFIG_PATH);
    console.log(`Loaded config from ${CONFIG_PATH}`);
  } catch (err) {
    console.error(`Error loading config: ${err.message}`);
    process.exit(3);
  }

  const paths = { ...DEFAULT_PATHS, ...config?.inputs, ...config?.outputs };

  // Load input files
  let sprintPlanContent, overrides, validationRules;

  try {
    sprintPlanContent = fs.readFileSync(path.join(ROOT_DIR, paths.sprint_plan), 'utf8');
    console.log(`Loaded Sprint plan from ${paths.sprint_plan}`);
  } catch (err) {
    console.error(`Error loading Sprint plan: ${err.message}`);
    process.exit(2);
  }

  overrides = loadYAML(path.join(ROOT_DIR, paths.plan_overrides));
  if (overrides) {
    console.log(`Loaded overrides from ${paths.plan_overrides}`);
  }

  validationRules = loadYAML(path.join(ROOT_DIR, paths.validation_rules));
  if (validationRules) {
    console.log(`Loaded validation rules from ${paths.validation_rules}`);
  }

  // Parse Sprint plan
  const tasks = parseCSV(sprintPlanContent);
  console.log(`\nParsed ${tasks.length} tasks from Sprint plan`);

  if (sprint !== undefined) {
    const sprintTasks = tasks.filter(t => parseInt(t['Target Sprint'], 10) === sprint);
    console.log(`Filtering to Sprint ${sprint}: ${sprintTasks.length} tasks\n`);
  }

  // Run checks
  console.log('Running hard rules...');
  const errors = checkHardRules(tasks, overrides, validationRules, config);

  console.log('Running soft rules...');
  const warnings = checkSoftRules(tasks, overrides, validationRules, config, sprint);

  console.log('Generating review queue...');
  const reviewQueue = generateReviewQueue(tasks, overrides, validationRules, config, errors, warnings, sprint);

  // Generate report
  const report = generateReport(tasks, overrides, validationRules, config, errors, warnings, reviewQueue, sprint);

  // Output results
  console.log('\n========================================');
  console.log('RESULTS');
  console.log('========================================\n');

  console.log(`Total tasks (Sprint ${sprint}): ${report.summary.total_tasks}`);
  console.log(`Tier breakdown: A=${report.summary.tier_breakdown.A}, B=${report.summary.tier_breakdown.B}, C=${report.summary.tier_breakdown.C}`);
  console.log(`Validation coverage: ${report.summary.validation_coverage.coverage_percentage}%`);
  console.log(`\nErrors: ${errors.length}`);
  console.log(`Warnings: ${warnings.length}`);
  console.log(`Review queue items: ${reviewQueue.length}`);

  if (errors.length > 0) {
    console.log('\n--- ERRORS ---');
    errors.forEach(e => {
      console.log(`  [${e.rule}] ${e.message}`);
      if (verbose) console.log(`    Fix: ${e.fix}`);
    });
  }

  if (verbose && warnings.length > 0) {
    console.log('\n--- WARNINGS ---');
    warnings.forEach(w => {
      console.log(`  [${w.rule}] ${w.message}`);
    });
  }

  // Write output files
  const reviewQueuePath = path.join(ROOT_DIR, paths.review_queue);
  fs.mkdirSync(path.dirname(reviewQueuePath), { recursive: true });
  fs.writeFileSync(reviewQueuePath, JSON.stringify({
    meta: {
      generated_at: new Date().toISOString(),
      sprint_scope: sprint,
      total_items: reviewQueue.length
    },
    items: reviewQueue
  }, null, 2));
  console.log(`\nReview queue written to ${paths.review_queue}`);

  const reportPath = path.join(ROOT_DIR, paths.lint_report);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Lint report written to ${paths.lint_report}`);

  // Exit code
  if (errors.length > 0) {
    console.log('\n[FAILED] Hard rule violations detected');
    process.exit(1);
  }

  console.log('\n[PASSED] No hard rule violations');
  process.exit(0);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(2);
});
