#!/usr/bin/env node

/**
 * SonarQube Comprehensive Analysis Report Generator
 * Generates detailed local reports for tracking and fixing issues
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const SONARQUBE_URL = 'http://localhost:9000';
const PROJECT_KEY = 'IntelliFlow';
const REPORT_DIR = 'sonar-reports';

function stripQuotes(value) {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value.at(-1);
  if ((first === '"' || first === "'") && first === last) return value.slice(1, -1);
  return value;
}

function parseDotenvLine(line) {
  const raw = line.trim();
  if (!raw || raw.startsWith('#')) return null;
  const normalized = raw.startsWith('export ') ? raw.slice('export '.length).trim() : raw;
  const idx = normalized.indexOf('=');
  if (idx <= 0) return null;
  const key = normalized.slice(0, idx).trim();
  if (!key || key.includes(' ')) return null;
  const value = stripQuotes(normalized.slice(idx + 1).trim());
  return { key, value };
}

function loadDotenvLocal() {
  const envPath = path.join(REPO_ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;

  try {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const entry = parseDotenvLine(line);
      if (entry && process.env[entry.key] === undefined) {
        process.env[entry.key] = entry.value;
      }
    }
  } catch {
    // ignore
  }
}

loadDotenvLocal();

const SONAR_TOKEN = process.env.SONAR_TOKEN;
const SONARQUBE_ADMIN_USER = process.env.SONARQUBE_ADMIN_USER;
const SONARQUBE_ADMIN_PASSWORD = process.env.SONARQUBE_ADMIN_PASSWORD;

const authUser = SONARQUBE_ADMIN_USER || SONAR_TOKEN;
const authPass = SONARQUBE_ADMIN_USER ? SONARQUBE_ADMIN_PASSWORD : '';

if (!authUser) {
  console.error(
    '❌ No SonarQube credentials found (set SONAR_TOKEN, or SONARQUBE_ADMIN_USER + SONARQUBE_ADMIN_PASSWORD).'
  );
  process.exit(1);
}

function makeRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const url = `${SONARQUBE_URL}/api${endpoint}`;
    const auth = Buffer.from(`${authUser}:${authPass ?? ''}`).toString('base64');

    const options = {
      headers: {
        Authorization: `Basic ${auth}`,
        'User-Agent': 'SonarQube-Report-Generator',
      },
    };

    const client = url.startsWith('https://') ? https : http;

    client
      .get(url, options, (res) => {
        const status = res.statusCode || 0;
        let data = '';

        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (status >= 400) {
            reject(new Error(`HTTP ${String(status)}: ${data.slice(0, 300)}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}`));
          }
        });
      })
      .on('error', reject);
  });
}

function formatSeverity(severity) {
  const severityMap = {
    BLOCKER: '🔴 BLOCKER',
    CRITICAL: '🔴 CRITICAL',
    MAJOR: '🟠 MAJOR',
    MINOR: '🟡 MINOR',
    INFO: '⚪ INFO',
  };
  return severityMap[severity] || severity;
}

function formatType(type) {
  const typeMap = {
    BUG: '🐛 Bug',
    VULNERABILITY: '🔒 Vulnerability',
    CODE_SMELL: '💩 Code Smell',
    SECURITY_HOTSPOT: '🔥 Security Hotspot',
  };
  return typeMap[type] || type;
}

const severityOrder = { BLOCKER: 0, CRITICAL: 1, MAJOR: 2, MINOR: 3, INFO: 4 };

function generateMetricsTable(metrics) {
  let table = `## 📈 Project Metrics\n\n`;
  table += `| Metric | Value |\n`;
  table += `|--------|-------|\n`;
  table += `| 🐛 Bugs | ${metrics.bugs || 0} |\n`;
  table += `| 🔒 Vulnerabilities | ${metrics.vulnerabilities || 0} |\n`;
  table += `| 🔥 Security Hotspots | ${metrics.security_hotspots || 0} |\n`;
  table += `| 💩 Code Smells | ${metrics.code_smells || 0} |\n`;
  table += `| 📈 Coverage | ${metrics.coverage ? metrics.coverage + '%' : 'N/A'} |\n`;
  table += `| 📄 Duplications | ${metrics.duplicated_lines_density ? metrics.duplicated_lines_density + '%' : 'N/A'} |\n`;
  table += `| 📏 Lines of Code | ${metrics.ncloc || 0} |\n`;
  table += `| 🔧 Complexity | ${metrics.complexity || 'N/A'} |\n`;
  table += `| 🧠 Cognitive Complexity | ${metrics.cognitive_complexity || 'N/A'} |\n`;
  table += `| ⚠️ Violations | ${metrics.violations || 0} |\n\n`;
  return table;
}

function generateIssueDetails(issue, index) {
  let details = `#### ${index}. ${formatSeverity(issue.severity)} - ${formatType(issue.type)}\n\n`;
  details += `**Message:** ${issue.message}\n\n`;
  const line = issue.line || issue.textRange?.startLine || 'N/A';
  details += `**Location:** Line ${line}`;
  if (issue.textRange && issue.textRange.startLine !== issue.textRange.endLine) {
    details += `-${issue.textRange.endLine}`;
  }
  details += `\n\n`;

  if (issue.rule) {
    details += `**Rule:** ${issue.rule}\n\n`;
  }

  if (issue.debt) {
    details += `**Technical Debt:** ${issue.debt}\n\n`;
  }

  if (issue.tags && issue.tags.length > 0) {
    details += `**Tags:** ${issue.tags.join(', ')}\n\n`;
  }

  if (issue.comments && issue.comments.length > 0) {
    details += `**Comments:**\n`;
    for (const comment of issue.comments) {
      details += `- ${comment.markdown || comment.html}\n`;
    }
    details += `\n`;
  }

  details += `---\n\n`;
  return details;
}

function groupIssuesByFile(allIssues) {
  const issuesByFile = {};
  for (const issue of allIssues) {
    const filePath = issue.component.split(':').slice(1).join(':') || issue.component;
    if (!issuesByFile[filePath]) {
      issuesByFile[filePath] = [];
    }
    issuesByFile[filePath].push(issue);
  }
  return issuesByFile;
}

function generateFileIssuesSection(issuesByFile) {
  let section = `## 🔍 Issues by File\n\n`;
  const sortedFiles = Object.keys(issuesByFile).sort(
    (a, b) => issuesByFile[b].length - issuesByFile[a].length
  );

  const totalIssues = Object.values(issuesByFile).reduce((sum, issues) => sum + issues.length, 0);
  section += `**Total Issues:** ${totalIssues}\n\n`;

  for (const filePath of sortedFiles) {
    const fileIssues = issuesByFile[filePath];
    section += `### 📁 ${filePath} (${fileIssues.length} issues)\n\n`;

    fileIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    let index = 0;
    for (const issue of fileIssues) {
      index++;
      section += generateIssueDetails(issue, index);
    }
  }

  return section;
}

function generateSummaries(allIssues) {
  let summary = `## 📊 Issues Summary by Severity\n\n`;
  const severityCounts = {};
  for (const issue of allIssues) {
    severityCounts[issue.severity] = (severityCounts[issue.severity] || 0) + 1;
  }

  const sortedSeverities = Object.keys(severityCounts).sort(
    (a, b) => severityOrder[a] - severityOrder[b]
  );
  for (const severity of sortedSeverities) {
    summary += `- ${formatSeverity(severity)}: ${severityCounts[severity]}\n`;
  }

  summary += `\n## 📊 Issues Summary by Type\n\n`;
  const typeCounts = {};
  for (const issue of allIssues) {
    typeCounts[issue.type] = (typeCounts[issue.type] || 0) + 1;
  }

  for (const type of Object.keys(typeCounts)) {
    summary += `- ${formatType(type)}: ${typeCounts[type]}\n`;
  }

  return summary;
}

function generateCoverageAnalysis(metrics) {
  const sonarCoverage = Number.parseFloat(metrics.coverage || '0');
  const linesToCover = Number(metrics.lines_to_cover || 0);
  const uncoveredLines = Number(metrics.uncovered_lines || 0);
  const coveredLines = linesToCover - uncoveredLines;
  const branchCoverage = metrics.branch_coverage
    ? Number.parseFloat(metrics.branch_coverage)
    : null;

  // Read Istanbul merged coverage if available
  let istanbulStats = null;
  const coverageSummaryPath = path.join(
    REPO_ROOT,
    'artifacts',
    'coverage',
    'coverage-summary.json'
  );
  try {
    if (fs.existsSync(coverageSummaryPath)) {
      const summary = JSON.parse(fs.readFileSync(coverageSummaryPath, 'utf8'));
      const total = summary.total;
      istanbulStats = {
        lines: total.lines?.pct ?? null,
        statements: total.statements?.pct ?? null,
        functions: total.functions?.pct ?? null,
        branches: total.branches?.pct ?? null,
        fileCount: Object.keys(summary).filter((k) => k !== 'total').length,
      };
    }
  } catch {
    /* ignore */
  }

  let section = `## 📊 Coverage Analysis\n\n`;
  section += `| Metric | SonarQube | Istanbul (tested files) |\n`;
  section += `|--------|-----------|------------------------|\n`;
  section += `| Line Coverage | ${sonarCoverage}% | ${istanbulStats?.lines == null ? 'N/A' : istanbulStats.lines + '%'} |\n`;
  if (branchCoverage != null || istanbulStats?.branches != null) {
    section += `| Branch Coverage | ${branchCoverage == null ? 'N/A' : branchCoverage + '%'} | ${istanbulStats?.branches == null ? 'N/A' : istanbulStats.branches + '%'} |\n`;
  }
  if (istanbulStats?.functions != null) {
    section += `| Function Coverage | — | ${istanbulStats.functions}% |\n`;
  }
  if (istanbulStats?.statements != null) {
    section += `| Statement Coverage | — | ${istanbulStats.statements}% |\n`;
  }
  section += `| Lines to Cover | ${linesToCover.toLocaleString()} | ${istanbulStats?.fileCount == null ? 'N/A' : istanbulStats.fileCount + ' files'} |\n`;
  section += `| Covered Lines | ${coveredLines.toLocaleString()} | — |\n`;
  section += `| Uncovered Lines | ${uncoveredLines.toLocaleString()} | — |\n`;
  section += `\n`;

  if (istanbulStats?.lines != null && istanbulStats.lines > sonarCoverage) {
    const gap = (istanbulStats.lines - sonarCoverage).toFixed(1);
    section += `> **⚠️ Coverage Gap: ${gap} percentage points**\n`;
    section += `> SonarQube counts **all** ${linesToCover.toLocaleString()} coverable lines (including source files with no tests → 0%), `;
    section += `while Istanbul reports only the ${istanbulStats.fileCount} files that have test coverage. `;
    section += `To close this gap, add tests for uncovered source files.\n\n`;
  }

  return section;
}

function generateCriticalIssuesSection(bugIssues, vulnIssues, hotspotIssues) {
  const hasBugs = bugIssues.length > 0;
  const hasVulns = vulnIssues.length > 0;
  const hasHotspots = hotspotIssues.length > 0;

  if (!hasBugs && !hasVulns && !hasHotspots) return '';

  let section = `## 🚨 Critical Issues (Bugs, Vulnerabilities & Security Hotspots)\n\n`;

  if (hasBugs) {
    section += `### 🐛 Bugs (${bugIssues.length})\n\n`;
    section += `| Severity | File | Line | Message |\n`;
    section += `|----------|------|------|---------|\n`;
    for (const bug of bugIssues) {
      const file = bug.component.split(':').slice(1).join(':') || bug.component;
      const line = bug.line || bug.textRange?.startLine || '—';
      section += `| ${formatSeverity(bug.severity)} | ${file} | ${line} | ${bug.message} |\n`;
    }
    section += `\n`;
  }

  if (hasVulns) {
    section += `### 🔒 Vulnerabilities (${vulnIssues.length})\n\n`;
    section += `| Severity | File | Line | Message |\n`;
    section += `|----------|------|------|---------|\n`;
    for (const vuln of vulnIssues) {
      const file = vuln.component.split(':').slice(1).join(':') || vuln.component;
      const line = vuln.line || vuln.textRange?.startLine || '—';
      section += `| ${formatSeverity(vuln.severity)} | ${file} | ${line} | ${vuln.message} |\n`;
    }
    section += `\n`;
  }

  if (hasHotspots) {
    section += `### 🔥 Security Hotspots (${hotspotIssues.length})\n\n`;
    section += `| Status | File | Line | Message |\n`;
    section += `|--------|------|------|---------|\n`;
    for (const hs of hotspotIssues) {
      const file = hs.component?.split(':').slice(1).join(':') || hs.component || '';
      const line = hs.line || hs.textRange?.startLine || '—';
      section += `| ${hs.vulnerabilityProbability || hs.status || '—'} | ${file} | ${line} | ${hs.message} |\n`;
    }
    section += `\n`;
  }

  return section;
}

function generateIssuesByRule(allIssues) {
  // Count by rule
  const ruleCounts = {};
  const tagCounts = {};
  for (const issue of allIssues) {
    ruleCounts[issue.rule] = (ruleCounts[issue.rule] || 0) + 1;
    for (const tag of issue.tags || []) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  const sortedRules = Object.entries(ruleCounts).sort((a, b) => b[1] - a[1]);
  const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

  let section = `## 📏 Issues by Rule\n\n`;
  section += `| # | Rule | Count | % |\n`;
  section += `|---|------|-------|---|\n`;
  const totalIssues = allIssues.length;
  sortedRules.forEach(([rule, count], i) => {
    const pct = ((count / totalIssues) * 100).toFixed(1);
    section += `| ${i + 1} | \`${rule}\` | ${count} | ${pct}% |\n`;
  });
  section += `\n`;

  if (sortedTags.length > 0) {
    section += `### 🏷️ Most Common Tags\n\n`;
    section += `| Tag | Count |\n`;
    section += `|-----|-------|\n`;
    for (const [tag, count] of sortedTags.slice(0, 15)) {
      section += `| \`${tag}\` | ${count} |\n`;
    }
    section += `\n`;
  }

  return section;
}

function generateReportFooter() {
  let footer = `\n---\n\n`;
  footer += `## 🔗 Links\n\n`;
  footer += `- **Dashboard:** ${SONARQUBE_URL}/dashboard?id=${PROJECT_KEY}\n`;
  footer += `- **Issues:** ${SONARQUBE_URL}/project/issues?id=${PROJECT_KEY}\n`;
  footer += `- **Quality Gate:** ${SONARQUBE_URL}/project/extension/qualitygate?id=${PROJECT_KEY}\n\n`;
  footer += `---\n\n`;
  footer += `*Report generated by SonarQube Report Generator*\n`;
  return footer;
}

function cleanupOldReports() {
  try {
    if (!fs.existsSync(REPORT_DIR)) {
      return;
    }

    const files = fs.readdirSync(REPORT_DIR);
    let removedCount = 0;

    for (const file of files) {
      // Keep README.md and .gitkeep files, remove old analysis reports
      if (file.startsWith('sonar-analysis-') && (file.endsWith('.md') || file.endsWith('.json'))) {
        const filePath = path.join(REPORT_DIR, file);
        fs.unlinkSync(filePath);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`🗑️  Cleaned up ${removedCount} old report file(s)\n`);
    }
  } catch (error) {
    console.warn(`⚠️  Warning: Could not cleanup old reports: ${error.message}`);
  }
}

async function generateComprehensiveReport() {
  try {
    console.log('📊 Generating comprehensive SonarQube analysis report...\n');

    // Create reports directory
    if (!fs.existsSync(REPORT_DIR)) {
      fs.mkdirSync(REPORT_DIR, { recursive: true });
    }

    // Clean up old reports before generating new one
    cleanupOldReports();

    const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-').slice(0, -5);
    const reportFile = path.join(REPORT_DIR, `sonar-analysis-${timestamp}.md`);
    const jsonReportFile = path.join(REPORT_DIR, `sonar-analysis-${timestamp}.json`);

    let report = `# SonarQube Analysis Report - ${PROJECT_KEY}\n\n`;
    report += `**Generated:** ${new Date().toLocaleString()}\n`;
    report += `**Project:** ${PROJECT_KEY}\n`;
    report += `**SonarQube:** ${SONARQUBE_URL}\n\n`;

    report += `---\n\n`;

    // Get project measures
    console.log('📊 Fetching project metrics...');
    const measures = await makeRequest(
      `/measures/component?component=${PROJECT_KEY}&metricKeys=bugs,vulnerabilities,security_hotspots,code_smells,coverage,duplicated_lines_density,ncloc,ncloc_language_distribution,complexity,cognitive_complexity,violations,lines_to_cover,uncovered_lines,branch_coverage,conditions_to_cover,uncovered_conditions`
    );

    if (!measures.component) {
      console.error('❌ Project not found');
      process.exit(1);
    }

    const metrics = {};
    for (const measure of measures.component.measures) {
      metrics[measure.metric] = measure.value;
    }

    report += generateMetricsTable(metrics);

    // Fetch all issues (code smells + bugs + vulns combined)
    console.log('🔍 Fetching all issues...');
    const issues = await makeRequest(
      `/issues/search?componentKeys=${PROJECT_KEY}&ps=500&s=SEVERITY&asc=false`
    );
    const allIssues = issues.issues || [];

    // Issues summary by severity and type (right after metrics)
    report += generateSummaries(allIssues);

    // Fetch bugs, vulnerabilities, and hotspots separately for the critical section
    console.log('🚨 Fetching critical issues (bugs, vulnerabilities, hotspots)...');
    const [bugsResult, vulnsResult, hotspotsResult] = await Promise.all([
      makeRequest(
        `/issues/search?componentKeys=${PROJECT_KEY}&types=BUG&ps=500&statuses=OPEN,CONFIRMED&s=SEVERITY&asc=false`
      ),
      makeRequest(
        `/issues/search?componentKeys=${PROJECT_KEY}&types=VULNERABILITY&ps=500&statuses=OPEN,CONFIRMED&s=SEVERITY&asc=false`
      ),
      makeRequest(`/hotspots/search?project=${PROJECT_KEY}&ps=500`).catch(() => ({ hotspots: [] })),
    ]);

    const bugIssues = bugsResult.issues || [];
    const vulnIssues = vulnsResult.issues || [];
    const hotspotIssues = hotspotsResult.hotspots || [];

    report += generateCriticalIssuesSection(bugIssues, vulnIssues, hotspotIssues);

    // Coverage analysis (SonarQube vs Istanbul) — after critical issues
    report += generateCoverageAnalysis(metrics);

    const jsonReport = {
      timestamp: new Date().toISOString(),
      project: PROJECT_KEY,
      metrics,
      issues: allIssues,
      bugs: bugIssues,
      vulnerabilities: vulnIssues,
      hotspots: hotspotIssues,
    };

    // Save JSON report
    fs.writeFileSync(jsonReportFile, JSON.stringify(jsonReport, null, 2));
    console.log(`📄 JSON report saved: ${jsonReportFile}`);

    // Issues by rule + tags (before file-level detail)
    report += generateIssuesByRule(allIssues);

    const issuesByFile = groupIssuesByFile(allIssues);
    report += generateFileIssuesSection(issuesByFile);
    report += generateReportFooter();

    // Save markdown report
    fs.writeFileSync(reportFile, report);
    console.log(`✅ Report generated successfully: ${reportFile}`);
    console.log(`\n🔗 View in SonarQube: ${SONARQUBE_URL}/dashboard?id=${PROJECT_KEY}`);
  } catch (error) {
    console.error('❌ Error generating report:', error.message);
    process.exit(1);
  }
}

try {
  await generateComprehensiveReport();
} catch (error) {
  console.error(
    '❌ Error generating report:',
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
}
