#!/usr/bin/env node

/**
 * Quick SonarQube Quality Gate Status Checker
 */

import http from 'node:http';
import https from 'node:https';

const SONARQUBE_URL = 'http://localhost:9000';
const PROJECT_KEY = 'IntelliFlow';

// Load token from environment
const SONAR_TOKEN = process.env.SONAR_TOKEN;
if (!SONAR_TOKEN) {
  console.error('❌ SONAR_TOKEN not found');
  process.exit(1);
}

function makeRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const url = `${SONARQUBE_URL}/api${endpoint}`;
    const auth = Buffer.from(`${SONAR_TOKEN}:`).toString('base64');

    const options = {
      headers: {
        Authorization: `Basic ${auth}`,
        'User-Agent': 'SonarQube-Status-Checker',
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

async function checkQualityGate() {
  try {
    const qualityGate = await makeRequest(`/qualitygates/project_status?projectKey=${PROJECT_KEY}`);

    if (!qualityGate.projectStatus) {
      console.error('❌ Project not found');
      process.exit(1);
    }

    const status = qualityGate.projectStatus.status;
    let statusEmoji = '❌'; // ERROR
    if (status === 'OK') {
      statusEmoji = '✅';
    } else if (status === 'WARN') {
      statusEmoji = '⚠️';
    }

    console.log(`${statusEmoji} Quality Gate: ${status}`);

    if (qualityGate.projectStatus.conditions) {
      for (const condition of qualityGate.projectStatus.conditions) {
        let condStatus = '❌'; // ERROR
        if (condition.status === 'OK') {
          condStatus = '✅';
        } else if (condition.status === 'WARN') {
          condStatus = '⚠️';
        }
        console.log(`${condStatus} ${condition.metricKey}: ${condition.actualValue || 'N/A'}`);
      }
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

try {
  await checkQualityGate();
} catch (error) {
  console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
