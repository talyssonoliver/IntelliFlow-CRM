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

function loadDotenvLocal() {
  const envPath = path.join(REPO_ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;

  try {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const raw = line.trim();
      if (!raw || raw.startsWith('#')) continue;
      const normalized = raw.startsWith('export ') ? raw.slice('export '.length).trim() : raw;
      const idx = normalized.indexOf('=');
      if (idx <= 0) continue;
      const key = normalized.slice(0, idx).trim();
      let value = normalized.slice(idx + 1).trim();
      if (!key || key.includes(' ')) continue;
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
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
  console.error('❌ No SonarQube credentials found (set SONAR_TOKEN, or SONARQUBE_ADMIN_USER + SONARQUBE_ADMIN_PASSWORD).');
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
      .get(url, options, res => {
        const status = res.statusCode || 0;
        let data = '';

        res.on('data', chunk => (data += chunk));
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
  details += `**Location:** Line ${issue.line || 'N/A'}`;
  if (issue.textRange) {
    details += ` (columns ${issue.textRange.startOffset}-${issue.textRange.endOffset})`;
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
  const sortedFiles = Object.keys(issuesByFile).sort((a, b) => issuesByFile[b].length - issuesByFile[a].length);
  
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

  const sortedSeverities = Object.keys(severityCounts).sort((a, b) => severityOrder[a] - severityOrder[b]);
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
      `/measures/component?component=${PROJECT_KEY}&metricKeys=bugs,vulnerabilities,security_hotspots,code_smells,coverage,duplicated_lines_density,ncloc,ncloc_language_distribution,complexity,cognitive_complexity,violations`
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

    // Get all issues
    console.log('🔍 Fetching issues...');
    const issues = await makeRequest(`/issues/search?componentKeys=${PROJECT_KEY}&ps=500&s=SEVERITY&asc=false`);

    const allIssues = issues.issues || [];
    const jsonReport = { timestamp: new Date().toISOString(), project: PROJECT_KEY, metrics, issues: allIssues };

    // Save JSON report
    fs.writeFileSync(jsonReportFile, JSON.stringify(jsonReport, null, 2));
    console.log(`📄 JSON report saved: ${jsonReportFile}`);

    const issuesByFile = groupIssuesByFile(allIssues);
    report += generateFileIssuesSection(issuesByFile);
    report += generateSummaries(allIssues);
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
  console.error('❌ Error generating report:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
