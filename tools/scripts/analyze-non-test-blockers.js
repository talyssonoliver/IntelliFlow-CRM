const fs = require('fs');
const path = require('path');

const auditDir = path.join(__dirname, '../../artifacts/reports/sprint-audit');
const results = [];

for (let i = 0; i <= 15; i++) {
  const f = path.join(auditDir, `sprint-${i}-latest/audit.json`);
  if (!fs.existsSync(f)) continue;

  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const bi = j.blocking_issues || [];

  const nonTestLint = bi.filter((b) => {
    const msg = (b.issue || b.message || b.description || '').toLowerCase();
    return !msg.includes('pnpm test') && !msg.includes('pnpm lint');
  });

  if (nonTestLint.length > 0) {
    results.push({ sprint: i, count: nonTestLint.length, issues: nonTestLint });
  }
}

let totalNonTestLint = 0;
const categorized = {};

for (const r of results) {
  console.log(`\n--- Sprint ${r.sprint} (${r.count} non-test/lint blockers) ---`);
  totalNonTestLint += r.count;

  for (const b of r.issues) {
    const msg = b.issue || b.message || b.description || 'unknown';
    const sev = b.severity || '?';
    const task = b.taskId || b.task_id || '?';
    console.log(`  [${sev}] ${task}: ${msg}`);

    // Categorize
    let cat = 'other';
    const ml = msg.toLowerCase();
    if (ml.includes('dod criteria')) cat = 'dod_unverified';
    else if (ml.includes('placeholder')) cat = 'placeholders';
    else if (ml.includes('artifact')) cat = 'missing_artifacts';
    else if (ml.includes('attestation')) cat = 'attestation';
    else if (ml.includes('waiver') || ml.includes('expired')) cat = 'expired_waivers';
    else if (ml.includes('kpi')) cat = 'kpi';
    else if (ml.includes('context_ack')) cat = 'context_ack';

    if (!categorized[cat]) categorized[cat] = [];
    categorized[cat].push({ sprint: r.sprint, task, severity: sev, message: msg });
  }
}

console.log(`\n\n=== SUMMARY ===`);
console.log(`Total non-test/lint blocking issues: ${totalNonTestLint}`);
console.log(`\nBy category:`);
for (const [cat, items] of Object.entries(categorized)) {
  console.log(`  ${cat}: ${items.length}`);
}
