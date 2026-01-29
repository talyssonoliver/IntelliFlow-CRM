#!/usr/bin/env node
/**
 * Package-by-Package Review Prioritization
 * Analyzes all workspace packages and generates priority review list
 *
 * Usage:
 *   node scripts/prioritize-reviews.js                    # Sprint 0, new path
 *   node scripts/prioritize-reviews.js --sprint=3         # Sprint 3
 *   node scripts/prioritize-reviews.js --legacy           # Legacy artifacts/reports path
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Parse arguments
const args = process.argv.slice(2);
const sprintArg = args.find((a) => a.startsWith('--sprint='));
const sprint = sprintArg ? Number.parseInt(sprintArg.split('=')[1], 10) : 0;
const useLegacy = args.includes('--legacy');

// Determine report directory
let REPORT_DIR;
if (useLegacy) {
  console.warn(
    '⚠️  Warning: --legacy is deprecated. Use sprint-based paths instead.'
  );
  REPORT_DIR = path.join(__dirname, '../artifacts/reports/package-review');
} else {
  // Sprint-based canonical path
  REPORT_DIR = path.join(
    __dirname,
    '..',
    '.specify',
    'sprints',
    `sprint-${sprint}`,
    'reports',
    'code-review',
    'package-review'
  );
}

// Ensure report directory exists
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// Try to load monorepo-level coverage (aggregated from all packages)
let monorepoSonarCoverage = null;
const monorepoSonarCoveragePath = path.join(
  __dirname,
  '../artifacts/coverage/coverage-summary.json'
);
if (fs.existsSync(monorepoSonarCoveragePath)) {
  try {
    monorepoSonarCoverage = JSON.parse(
      fs.readFileSync(monorepoSonarCoveragePath, 'utf8')
    );
    console.log('📊 Using monorepo coverage data from artifacts/coverage/');
  } catch {
    console.warn('⚠️  Could not parse monorepo coverage data');
  }
}

console.log('🔍 Analyzing all workspace packages...');
console.log(`   Sprint: ${sprint}`);
console.log(`   Output: ${REPORT_DIR}\n`);

// Get all workspace packages
const workspacesJson = execSync('pnpm list -r --depth -1 --json', { 
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'ignore']
});

const workspaces = JSON.parse(workspacesJson);

const packageAnalysis = [];

for (const pkg of workspaces) {
  // Skip project-tracker (temporary dev tool, will be removed after MVP)
  if (pkg.name === '@intelliflow/project-tracker') {
    console.log(`⏭️  Skipping ${pkg.name} (excluded from analysis)`);
    continue;
  }

  const analysis = {
    name: pkg.name,
    path: pkg.path,
    version: pkg.version,
    private: pkg.private,
    score: 0,
    metrics: {},
    risks: [],
    priority: 'LOW'
  };

  console.log(`📦 Analyzing ${pkg.name}...`);

  try {
    // 1. Check if package.json exists
    const pkgJsonPath = path.join(pkg.path, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      
      // Count dependencies
      const depCount = Object.keys(pkgJson.dependencies || {}).length;
      const devDepCount = Object.keys(pkgJson.devDependencies || {}).length;
      analysis.metrics.dependencies = depCount;
      analysis.metrics.devDependencies = devDepCount;
      
      // High dependency count increases risk
      if (depCount > 20) {
        analysis.risks.push('High dependency count');
        analysis.score += 10;
      }
      
      // Check for scripts in package
      let hasTests = !!(pkgJson.scripts?.test || pkgJson.scripts?.['test:unit']);
      analysis.metrics.hasTypeCheck = !!pkgJson.scripts?.typecheck;
      analysis.metrics.hasBuild = !!pkgJson.scripts?.build;
      
      // If no test script in package, check root (monorepo pattern)
      if (!hasTests) {
        const rootPkgJsonPath = path.join(__dirname, '../package.json');
        if (fs.existsSync(rootPkgJsonPath)) {
          const rootPkgJson = JSON.parse(fs.readFileSync(rootPkgJsonPath, 'utf8'));
          hasTests = !!(rootPkgJson.scripts?.test || rootPkgJson.scripts?.['test:unit']);
          if (hasTests) {
            analysis.metrics.testsInRoot = true;
          }
        }
      }
      
      analysis.metrics.hasTests = hasTests;
      
      // Missing critical scripts increases risk
      if (!analysis.metrics.hasTests) {
        analysis.risks.push('No test script');
        analysis.score += 20;
      }
      if (!analysis.metrics.hasTypeCheck) {
        analysis.risks.push('No typecheck script');
        analysis.score += 10;
      }
    }

    // 2. Count source files
    const srcPath = path.join(pkg.path, 'src');
    if (fs.existsSync(srcPath)) {
      const countFiles = (dir) => {
        let count = 0;
        let lines = 0;
        const files = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const file of files) {
          const fullPath = path.join(dir, file.name);
          if (file.isDirectory()) {
            const subCount = countFiles(fullPath);
            count += subCount.count;
            lines += subCount.lines;
          } else if (file.name.match(/\.(ts|tsx|js|jsx)$/)) {
            count++;
            try {
              const content = fs.readFileSync(fullPath, 'utf8');
              lines += content.split('\n').length;
            } catch {
              // File read error - skip this file and continue counting
              console.warn(`   ⚠ Could not read file: ${fullPath}`);
            }
          }
        }
        return { count, lines };
      };

      const fileMetrics = countFiles(srcPath);
      analysis.metrics.sourceFiles = fileMetrics.count;
      analysis.metrics.linesOfCode = fileMetrics.lines;
      
      // Large packages need more review
      if (fileMetrics.count > 50) {
        analysis.risks.push('Large package (>50 files)');
        analysis.score += 15;
      }
      if (fileMetrics.lines > 5000) {
        analysis.risks.push('High LOC (>5000 lines)');
        analysis.score += 15;
      }
    } else {
      analysis.metrics.sourceFiles = 0;
      analysis.metrics.linesOfCode = 0;
    }

    // 3. Check for test coverage
    // First try per-package coverage, then fall back to monorepo coverage
    const coveragePath = path.join(pkg.path, 'coverage/coverage-summary.json');
    let foundCoverage = false;

    if (fs.existsSync(coveragePath)) {
      try {
        const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
        const total = coverage.total;
        analysis.metrics.coverage = {
          lines: total.lines.pct,
          statements: total.statements.pct,
          functions: total.functions.pct,
          branches: total.branches.pct,
          source: 'package'
        };
        foundCoverage = true;
      } catch {
        // Coverage file exists but couldn't be parsed
      }
    }

    // Fall back to monorepo coverage if per-package not found
    if (!foundCoverage && monorepoSonarCoverage) {
      // Try to find this package's coverage in the monorepo data
      // Keys are relative paths like "/packages/domain/src/..."
      const pkgRelativePath = path.relative(
        path.join(__dirname, '..'),
        pkg.path
      );

      let totalLines = 0;
      let coveredLines = 0;
      let totalBranches = 0;
      let coveredBranches = 0;

      // Search for files matching this package
      for (const [filePath, fileCoverage] of Object.entries(
        monorepoSonarCoverage
      )) {
        if (filePath !== 'total' && filePath.includes(pkgRelativePath)) {
          if (fileCoverage.lines) {
            totalLines += fileCoverage.lines.total || 0;
            coveredLines += fileCoverage.lines.covered || 0;
          }
          if (fileCoverage.branches) {
            totalBranches += fileCoverage.branches.total || 0;
            coveredBranches += fileCoverage.branches.covered || 0;
          }
        }
      }

      if (totalLines > 0) {
        const linePct = Math.round((coveredLines / totalLines) * 100);
        const branchPct =
          totalBranches > 0
            ? Math.round((coveredBranches / totalBranches) * 100)
            : 0;
        analysis.metrics.coverage = {
          lines: linePct,
          statements: linePct,
          functions: 0, // Not available in summary
          branches: branchPct,
          source: 'monorepo'
        };
        foundCoverage = true;
      }
    }

    if (foundCoverage) {
      const total = analysis.metrics.coverage;
      // Low coverage increases risk
      if (total.lines < 50) {
        analysis.risks.push('Low test coverage (<50%)');
        analysis.score += 25;
      } else if (total.lines < 70) {
        analysis.risks.push('Medium test coverage (<70%)');
        analysis.score += 10;
      }
    } else {
      analysis.risks.push('No coverage data');
      analysis.score += 15;
    }

    // 4. Critical packages get higher priority
    const criticalPackages = [
      'domain',
      'application',
      'api',
      'platform',
      'db',
      'validators',
      'auth'
    ];
    
    if (criticalPackages.some(c => pkg.name.includes(c))) {
      analysis.risks.push('Critical business logic');
      analysis.score += 20;
    }

    // 5. Check for incomplete work markers in comments
    if (fs.existsSync(srcPath)) {
      try {
        const grep = execSync(
          String.raw`grep -r "TODO\|FIXME\|HACK\|XXX" "${srcPath}" 2>/dev/null | wc -l`,
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
        ).trim();
        const todoCount = Number.parseInt(grep, 10) || 0;
        analysis.metrics.todoComments = todoCount;

        if (todoCount > 10) {
          analysis.risks.push(`Many incomplete work markers (${todoCount})`);
          analysis.score += 10;
        }
      } catch {
        // grep returned non-zero (no matches found) - this is expected
        analysis.metrics.todoComments = 0;
      }
    }

    // Determine priority based on score
    if (analysis.score >= 60) {
      analysis.priority = 'CRITICAL';
    } else if (analysis.score >= 40) {
      analysis.priority = 'HIGH';
    } else if (analysis.score >= 20) {
      analysis.priority = 'MEDIUM';
    }

    packageAnalysis.push(analysis);
    console.log(`   ✓ Score: ${analysis.score}, Priority: ${analysis.priority}`);

  } catch (error) {
    console.error(`   ✗ Error analyzing ${pkg.name}:`, error.message);
  }
}

// Sort by priority (score descending)
packageAnalysis.sort((a, b) => b.score - a.score);

// Generate reports
console.log('\n📊 Generating reports...\n');

// 1. JSON report (STOA-compatible)
const jsonReport = {
  // STOA-compatible metadata
  timestamp: new Date().toISOString(),
  sprint: sprint,
  mode: 'package-review',
  scope: 'Full monorepo package analysis',
  reportPath: REPORT_DIR,

  // Analysis summary
  totalPackages: packageAnalysis.length,
  priorityCounts: {
    CRITICAL: packageAnalysis.filter((p) => p.priority === 'CRITICAL').length,
    HIGH: packageAnalysis.filter((p) => p.priority === 'HIGH').length,
    MEDIUM: packageAnalysis.filter((p) => p.priority === 'MEDIUM').length,
    LOW: packageAnalysis.filter((p) => p.priority === 'LOW').length
  },
  coverageSource: monorepoSonarCoverage ? 'monorepo' : 'per-package',
  packages: packageAnalysis
};

fs.writeFileSync(
  path.join(REPORT_DIR, 'package-analysis.json'),
  JSON.stringify(jsonReport, null, 2)
);

// 2. Markdown report
let mdReport = `# Code Review Priority Analysis\n\n`;
mdReport += `**Generated:** ${new Date().toLocaleString()}\n`;
mdReport += `**Total Packages:** ${packageAnalysis.length}\n\n`;

mdReport += `## Priority Summary\n\n`;
mdReport += `| Priority | Count |\n`;
mdReport += `|----------|-------|\n`;
mdReport += `| 🔴 CRITICAL | ${jsonReport.priorityCounts.CRITICAL} |\n`;
mdReport += `| 🟠 HIGH | ${jsonReport.priorityCounts.HIGH} |\n`;
mdReport += `| 🟡 MEDIUM | ${jsonReport.priorityCounts.MEDIUM} |\n`;
mdReport += `| 🟢 LOW | ${jsonReport.priorityCounts.LOW} |\n\n`;

mdReport += `## Package Details (Sorted by Priority)\n\n`;

for (const pkg of packageAnalysis) {
  const priorityIcon = {
    CRITICAL: '🔴',
    HIGH: '🟠',
    MEDIUM: '🟡',
    LOW: '🟢'
  }[pkg.priority];

  mdReport += `### ${priorityIcon} ${pkg.name} (Score: ${pkg.score})\n\n`;
  mdReport += `**Priority:** ${pkg.priority}\n\n`;
  
  if (pkg.risks.length > 0) {
    mdReport += `**Risks:**\n`;
    for (const risk of pkg.risks) {
      mdReport += `- ${risk}\n`;
    }
    mdReport += `\n`;
  }
  
  mdReport += `**Metrics:**\n`;
  mdReport += `- Source files: ${pkg.metrics.sourceFiles || 0}\n`;
  mdReport += `- Lines of code: ${pkg.metrics.linesOfCode || 0}\n`;
  mdReport += `- Dependencies: ${pkg.metrics.dependencies || 0}\n`;
  
  if (pkg.metrics.coverage) {
    mdReport += `- Test coverage: ${pkg.metrics.coverage.lines}% lines, ${pkg.metrics.coverage.branches}% branches\n`;
  } else {
    mdReport += `- Test coverage: N/A\n`;
  }
  
  if (pkg.metrics.todoComments) {
    mdReport += `- TODO/FIXME comments: ${pkg.metrics.todoComments}\n`;
  }
  
  mdReport += `\n---\n\n`;
}

fs.writeFileSync(
  path.join(REPORT_DIR, 'REVIEW-PRIORITY.md'),
  mdReport
);

// 3. CSV report for spreadsheet import
let csvReport = 'Package,Priority,Score,SourceFiles,LOC,Dependencies,Coverage,Risks\n';
for (const pkg of packageAnalysis) {
  const coverage = pkg.metrics.coverage ? `${pkg.metrics.coverage.lines}%` : 'N/A';
  const risks = pkg.risks.join('; ');
  csvReport += `"${pkg.name}","${pkg.priority}",${pkg.score},${pkg.metrics.sourceFiles || 0},${pkg.metrics.linesOfCode || 0},${pkg.metrics.dependencies || 0},"${coverage}","${risks}"\n`;
}

fs.writeFileSync(
  path.join(REPORT_DIR, 'package-review-priorities.csv'),
  csvReport
);

// Display summary
console.log('=' .repeat(60));
console.log('📊 CODE REVIEW PRIORITY SUMMARY');
console.log('='.repeat(60));
console.log(`\n🔴 CRITICAL Priority: ${jsonReport.priorityCounts.CRITICAL} packages`);
console.log(`🟠 HIGH Priority: ${jsonReport.priorityCounts.HIGH} packages`);
console.log(`🟡 MEDIUM Priority: ${jsonReport.priorityCounts.MEDIUM} packages`);
console.log(`🟢 LOW Priority: ${jsonReport.priorityCounts.LOW} packages`);

console.log('\n📦 Top 5 Packages to Review:\n');
for (let i = 0; i < Math.min(5, packageAnalysis.length); i++) {
  const pkg = packageAnalysis[i];
  console.log(`${i + 1}. ${pkg.name} (${pkg.priority}, Score: ${pkg.score})`);
  console.log(`   Risks: ${pkg.risks.join(', ')}`);
}

console.log(`\n📁 Reports saved to: ${REPORT_DIR}`);
console.log(`   • package-analysis.json (detailed data)`);
console.log(`   • REVIEW-PRIORITY.md (human-readable)`);
console.log(`   • package-review-priorities.csv (spreadsheet import)`);

console.log('\n✅ Analysis complete!\n');
