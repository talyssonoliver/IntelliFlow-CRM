#!/usr/bin/env node

/**
 * SonarQube Analysis Tracker
 * Fetches and displays analysis results locally
 */

import https from 'node:https';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SONARQUBE_URL = 'http://localhost:9000';
const PROJECT_KEY = 'IntelliFlow';

function getSeverityEmoji(severity) {
  if (severity === 'BLOCKER' || severity === 'CRITICAL') {
    return '🔴';
  }
  if (severity === 'MAJOR') {
    return '🟠';
  }
  if (severity === 'MINOR') {
    return '🟡';
  }
  return '⚪'; // INFO
}

// Load token from environment
const SONAR_TOKEN = process.env.SONAR_TOKEN;
if (!SONAR_TOKEN) {
  console.error('❌ SONAR_TOKEN not found in environment');
  process.exit(1);
}

function makeRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const url = `${SONARQUBE_URL}/api${endpoint}`;
    const auth = Buffer.from(`${SONAR_TOKEN}:`).toString('base64');

    const options = {
      headers: {
        Authorization: `Basic ${auth}`,
        'User-Agent': 'SonarQube-Tracker',
      },
    };

    const client = url.startsWith('https://') ? https : http;

    client
      .get(url, options, res => {
        let data = '';

        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
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

async function trackAnalysis() {
  try {
    console.log('📊 Fetching SonarQube analysis results...\n');

    // Get project measures
    const measures = await makeRequest(
      `/measures/component?component=${PROJECT_KEY}&metricKeys=bugs,vulnerabilities,security_hotspots,code_smells,coverage,duplicated_lines_density,ncloc,ncloc_language_distribution`
    );

    if (!measures.component) {
      console.error('❌ Project not found. Please ensure SonarQube analysis has been run.');
      process.exit(1);
    }

    const metrics = {};
    for (const measure of measures.component.measures) {
      metrics[measure.metric] = measure.value;
    }

    console.log('📈 PROJECT METRICS');
    console.log('-'.repeat(18));
    console.log(`🐛 Bugs: ${metrics.bugs || 0}`);
    console.log(`🔒 Vulnerabilities: ${metrics.vulnerabilities || 0}`);
    console.log(`🔥 Security Hotspots: ${metrics.security_hotspots || 0}`);
    console.log(`💩 Code Smells: ${metrics.code_smells || 0}`);
    console.log(`📈 Coverage: ${metrics.coverage ? metrics.coverage + '%' : 'N/A'}`);
    console.log(
      `📄 Duplications: ${metrics.duplicated_lines_density ? metrics.duplicated_lines_density + '%' : 'N/A'}`
    );
    console.log(`📏 Lines of Code: ${metrics.ncloc || 0}`);

    // Get issues
    console.log('\n🔍 RECENT ISSUES');
    console.log('-'.repeat(15));

    const issues = await makeRequest(`/issues/search?componentKeys=${PROJECT_KEY}&ps=10&s=SEVERITY&asc=false`);

    if (issues.issues && issues.issues.length > 0) {
      let index = 0;
      for (const issue of issues.issues) {
        index++;
        const severityEmoji = getSeverityEmoji(issue.severity);
        console.log(`${index}. ${severityEmoji} ${issue.type}: ${issue.message}`);
        console.log(`   📁 ${issue.component.split(':').pop()}:${issue.line || 'N/A'}`);
      }

      if (issues.total > 10) {
        console.log(`\n... and ${issues.total - 10} more issues`);
      }
    } else {
      console.log('✅ No open issues found!');
    }

    console.log('\n🔗 DASHBOARD');
    console.log('-'.repeat(12));
    console.log(`View full results: ${SONARQUBE_URL}/dashboard?id=${PROJECT_KEY}`);
  } catch (error) {
    console.error('❌ Error fetching analysis results:', error.message);
    process.exit(1);
  }
}

try {
  await trackAnalysis();
} catch (error) {
  console.error('❌ Error fetching analysis results:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
