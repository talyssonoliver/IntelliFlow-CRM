#!/usr/bin/env node
/**
 * Compare a tree snapshot (tree_intelliflow_crm.txt) with the artifacts listed
 * in the Sprint plan CSV. Reports which artifacts are present, missing, or
 * potentially misplaced, plus duplicate expectations.
 *
 * Usage:
 *   node scripts/compare-tree-to-sprint-plan.js
 *   node scripts/compare-tree-to-sprint-plan.js --tree path/to/tree.txt --plan path/to/Sprint_plan.csv --out path/to/report.txt --extras-out path/to/extras.txt --include ARTIFACT,EVIDENCE --status Completed
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const defaultTreePath = path.join(repoRoot, 'tree_intelliflow_crm.txt');
const defaultPlanPath = path.join(
  repoRoot,
  'apps',
  'project-tracker',
  'docs',
  'metrics',
  '_global',
  'Sprint_plan.csv',
);
const defaultOutPath = path.join(repoRoot, 'artifacts', 'misc', 'tree-vs-sprint-report.txt');
const defaultExtrasOutPath = path.join(repoRoot, 'artifacts', 'misc', 'tree-vs-sprint-extras.txt');
const defaultStatuses = ['COMPLETED'];

function normalizePath(rawPath) {
  if (!rawPath) {
    return '';
  }
  const cleaned = rawPath.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
  const normalized = path.posix.normalize(cleaned);
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    treeFile: defaultTreePath,
    planFile: defaultPlanPath,
    includeTypes: ['ARTIFACT', 'EVIDENCE'],
    outFile: defaultOutPath,
    extrasOutFile: defaultExtrasOutPath,
    statuses: defaultStatuses,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if ((arg === '--tree' || arg === '-t') && args[i + 1]) {
      options.treeFile = path.resolve(args[i + 1]);
      i += 1;
    } else if ((arg === '--plan' || arg === '-p') && args[i + 1]) {
      options.planFile = path.resolve(args[i + 1]);
      i += 1;
    } else if (arg === '--include' && args[i + 1]) {
      options.includeTypes = args[i + 1]
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean);
      i += 1;
    } else if ((arg === '--out' || arg === '-o') && args[i + 1]) {
      options.outFile = path.resolve(args[i + 1]);
      i += 1;
    } else if (arg === '--extras-out' && args[i + 1]) {
      options.extrasOutFile = path.resolve(args[i + 1]);
      i += 1;
    } else if ((arg === '--status' || arg === '--statuses') && args[i + 1]) {
      const parsed = args[i + 1]
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean);
      options.statuses =
        parsed.includes('ALL') || parsed.includes('*') ? [] : parsed;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log('Compare a tree snapshot against Sprint plan artifacts.');
  console.log('');
  console.log('Options:');
  console.log('  --tree, -t <path>     Path to tree_intelliflow_crm.txt (default: repo root)');
  console.log('  --plan, -p <path>     Path to Sprint_plan.csv (default: apps/project-tracker/docs/metrics/_global/Sprint_plan.csv)');
  console.log('  --include <types>     Comma-separated prefixes to track (default: ARTIFACT,EVIDENCE)');
  console.log('  --out, -o <path>      Where to write the report (default: artifacts/misc/tree-vs-sprint-report.txt)');
  console.log('  --extras-out <path>   Where to write non-plan file list (default: artifacts/misc/tree-vs-sprint-extras.txt)');
  console.log('  --status <statuses>   Comma-separated task statuses to include (default: Completed)');
  console.log('  --help, -h            Show this help');
}

function parseTree(treeFile) {
  if (!fs.existsSync(treeFile)) {
    throw new Error(`Tree file not found: ${treeFile}`);
  }

  const content = fs.readFileSync(treeFile, 'utf8');
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    throw new Error(`Tree file is empty: ${treeFile}`);
  }

  const rootLine = lines.shift();
  const root = normalizePath(rootLine.replace(/\/$/, ''));
  const paths = [];
  const skipped = [];
  const stack = [];
  const treePattern = /^(?<indent>(?:\| {3}| {4})*)(?:\|-- |\+-- )(?<name>.+)$/;

  for (const line of lines) {
    const match = line.match(treePattern);
    if (!match) {
      skipped.push(line);
      continue;
    }

    const indent = match.groups.indent || '';
    const depth = indent.length / 4;
    let name = match.groups.name.trim();
    name = name.replace(/\/$/, '');

    stack[depth] = name;
    stack.length = depth + 1;

    const relativePath = normalizePath(stack.slice(0, depth + 1).join('/'));
    if (relativePath) {
      paths.push(relativePath);
    }
  }

  return { root, paths, skipped };
}

// Minimal CSV parser to avoid external dependencies; handles quoted fields and escaped quotes.
function parseCsv(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentField += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

function parseSprintPlan(planFile, includeTypes, allowedStatuses) {
  if (!fs.existsSync(planFile)) {
    throw new Error(`Sprint plan not found: ${planFile}`);
  }

  const content = fs.readFileSync(planFile, 'utf8');
  const rows = parseCsv(content);
  if (rows.length === 0) {
    throw new Error(`Sprint plan is empty: ${planFile}`);
  }

  const header = rows.shift().map((col) => col.trim());
  const headerIndex = new Map();
  header.forEach((col, idx) => headerIndex.set(col.toLowerCase(), idx));

  const taskIdx = headerIndex.get('task id');
  const artifactIdx = headerIndex.get('artifacts to track');
  const statusIdx = headerIndex.get('status');

  if (taskIdx === undefined || artifactIdx === undefined) {
    throw new Error('Expected "Task ID" and "Artifacts To Track" columns in Sprint plan.');
  }

  const entries = [];
  const pathToTasks = new Map();
  let skippedEntries = 0;

  for (const row of rows) {
    if (!row || row.length === 0) {
      continue;
    }

    const taskId = (row[taskIdx] || '').trim();
    const status = statusIdx !== undefined ? (row[statusIdx] || '').trim().toUpperCase() : '';
    if (
      statusIdx !== undefined &&
      Array.isArray(allowedStatuses) &&
      allowedStatuses.length > 0 &&
      !allowedStatuses.includes(status)
    ) {
      continue;
    }

    const artifactsField = row[artifactIdx] || '';
    const parts = artifactsField.split(';');

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) {
        continue;
      }

      const [rawType, ...rest] = trimmed.split(':');
      if (!rest.length) {
        skippedEntries += 1;
        continue;
      }

      const type = rawType.trim().toUpperCase();
      if (!includeTypes.includes(type)) {
        skippedEntries += 1;
        continue;
      }

      const rawPath = rest.join(':').trim();
      const normalizedPath = normalizePath(rawPath);
      const entry = { taskId, type, rawPath, normalizedPath };
      entries.push(entry);

      const existing = pathToTasks.get(normalizedPath) || [];
      existing.push({ taskId, type });
      pathToTasks.set(normalizedPath, existing);
    }
  }

  return { entries, pathToTasks, skippedEntries };
}

function buildReport(actualPaths, expectedEntries, pathToTasks) {
  const actualSet = new Set(actualPaths.map((p) => normalizePath(p)));
  const actualByBasename = new Map();
  for (const filePath of actualSet) {
    const base = path.posix.basename(filePath);
    const existing = actualByBasename.get(base) || [];
    existing.push(filePath);
    actualByBasename.set(base, existing);
  }

  const expectedBasenames = new Set(
    expectedEntries.map((entry) => path.posix.basename(entry.normalizedPath)),
  );
  const relevantActualSet = new Set();
  actualSet.forEach((p) => {
    if (expectedBasenames.has(path.posix.basename(p))) {
      relevantActualSet.add(p);
    }
  });

  const found = [];
  const missing = [];
  const misplaced = [];

  for (const entry of expectedEntries) {
    if (actualSet.has(entry.normalizedPath)) {
      found.push(entry);
      continue;
    }

    const base = path.posix.basename(entry.normalizedPath);
    const alternatives = (actualByBasename.get(base) || []).filter(
      (candidate) => candidate !== entry.normalizedPath,
    );

    if (alternatives.length > 0) {
      misplaced.push({ entry, alternatives });
    } else {
      missing.push(entry);
    }
  }

  const duplicatesInPlan = [];
  pathToTasks.forEach((tasks, artifactPath) => {
    if (tasks.length > 1) {
      duplicatesInPlan.push({ artifactPath, tasks });
    }
  });

  const diskDuplicates = [];
  actualByBasename.forEach((pathsForBase, base) => {
    if (pathsForBase.length > 1 && expectedBasenames.has(base)) {
      diskDuplicates.push({ base, paths: pathsForBase });
    }
  });

  const expectedSet = new Set(expectedEntries.map((e) => e.normalizedPath));
  const extras = [];
  actualSet.forEach((p) => {
    if (!expectedSet.has(p)) {
      extras.push(p);
    }
  });

  return {
    found,
    missing,
    misplaced,
    duplicatesInPlan,
    diskDuplicates,
    extras,
    stats: {
      totalExpected: expectedEntries.length,
      totalActual: actualSet.size,
      totalActualRelevant: relevantActualSet.size,
    },
  };
}

function renderSection(title, rows, lines) {
  if (!rows || rows.length === 0) return;
  lines.push('');
  lines.push(title);
  rows.forEach((line) => lines.push(`- ${line}`));
}

function renderReport(report, context) {
  const lines = [];
  lines.push('========================================');
  lines.push('Tree vs Sprint Plan Artifact Check');
  lines.push('========================================');
  lines.push(`Tree root: ${context.root}`);
  lines.push(`Tree file: ${context.treeFile}`);
  lines.push(`Sprint plan: ${context.planFile}`);
  lines.push(`Tracked types: ${context.includeTypes.join(', ')}`);
  lines.push(
    `Tracked statuses: ${
      context.statuses && context.statuses.length > 0 ? context.statuses.join(', ') : 'ALL'
    }`,
  );
  lines.push('');

  lines.push('Summary');
  lines.push(`  Expected artifacts: ${report.stats.totalExpected}`);
  lines.push(
    `  Entries on disk (matching expected basenames): ${report.stats.totalActualRelevant} (total in tree: ${report.stats.totalActual})`,
  );
  lines.push(`  Found in expected location: ${report.found.length}`);
  lines.push(`  Missing: ${report.missing.length}`);
  lines.push(`  Potentially misplaced: ${report.misplaced.length}`);
  lines.push(`  Duplicate expectations in plan: ${report.duplicatesInPlan.length}`);
  lines.push(`  Potential duplicates on disk (by basename): ${report.diskDuplicates.length}`);

  renderSection(
    'Missing artifacts:',
    report.missing.map((entry) => `[${entry.taskId}] ${entry.type} ${entry.normalizedPath || entry.rawPath}`),
    lines,
  );

  renderSection(
    'Potentially misplaced (basename exists elsewhere):',
    report.misplaced.map((item) => {
      const alt = item.alternatives.join(', ');
      return `[${item.entry.taskId}] ${item.entry.type} ${item.entry.normalizedPath || item.entry.rawPath} -> candidates: ${alt}`;
    }),
    lines,
  );

  renderSection(
    'Duplicate expectations in Sprint plan (same path claimed by multiple tasks):',
    report.duplicatesInPlan.map((dup) => {
      const tasks = dup.tasks.map((t) => `${t.taskId} (${t.type})`).join(', ');
      return `${dup.artifactPath} <- ${tasks}`;
    }),
    lines,
  );

  renderSection(
    'Potential duplicates on disk (same basename in multiple locations):',
    report.diskDuplicates.map((dup) => `${dup.base} -> ${dup.paths.join(', ')}`),
    lines,
  );

  return lines.join('\n');
}

function main() {
  try {
    const options = parseArgs();
    const tree = parseTree(options.treeFile);
    const plan = parseSprintPlan(options.planFile, options.includeTypes, options.statuses);
    const report = buildReport(tree.paths, plan.entries, plan.pathToTasks);
    const rendered = renderReport(report, {
      root: tree.root,
      treeFile: options.treeFile,
      planFile: options.planFile,
      includeTypes: options.includeTypes,
      statuses: options.statuses,
    });
    fs.mkdirSync(path.dirname(options.outFile), { recursive: true });
    fs.writeFileSync(options.outFile, rendered, 'utf8');

    if (options.extrasOutFile) {
      const extrasLines = [];
      extrasLines.push('========================================');
      extrasLines.push('Files NOT referenced in Sprint plan (by status/types filters)');
      extrasLines.push('========================================');
      extrasLines.push(`Tree file: ${options.treeFile}`);
      extrasLines.push(`Sprint plan: ${options.planFile}`);
      extrasLines.push(
        `Statuses: ${options.statuses && options.statuses.length > 0 ? options.statuses.join(', ') : 'ALL'}`,
      );
      extrasLines.push(
        `Include types: ${options.includeTypes && options.includeTypes.length > 0 ? options.includeTypes.join(', ') : 'ALL'}`,
      );
      extrasLines.push(`Total extras: ${report.extras.length}`);
      extrasLines.push('');

      const groups = new Map();
      report.extras.forEach((p) => {
        const parts = p.split('/');
        const group = parts.length > 1 ? parts[0] : '(root)';
        const list = groups.get(group) || [];
        list.push(p);
        groups.set(group, list);
      });

      Array.from(groups.keys())
        .sort()
        .forEach((group) => {
          const list = groups.get(group) || [];
          extrasLines.push(`${group} (${list.length})`);
          list
            .slice()
            .sort()
            .forEach((entry) => extrasLines.push(`- ${entry}`));
          extrasLines.push('');
        });

      fs.mkdirSync(path.dirname(options.extrasOutFile), { recursive: true });
      fs.writeFileSync(options.extrasOutFile, extrasLines.join('\n'), 'utf8');
      console.log(`Wrote extras report to ${options.extrasOutFile}`);
    }

    console.log(`Wrote report to ${options.outFile}`);
    console.log(
      `Summary: expected ${report.stats.totalExpected}, relevant on disk ${report.stats.totalActualRelevant} (tree total ${report.stats.totalActual}), found ${report.found.length}, missing ${report.missing.length}, misplaced ${report.misplaced.length}, plan duplicates ${report.duplicatesInPlan.length}, disk basename duplicates ${report.diskDuplicates.length}`,
    );
  } catch (error) {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
