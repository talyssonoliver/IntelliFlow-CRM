import fs from 'node:fs';
const pattern = process.argv[2] || '';
const d = JSON.parse(fs.readFileSync('artifacts/test-failures/web.json', 'utf8'));
const cwd = process.cwd().replace(/\\/g, '/');
const files = new Set();
for (const f of d.testResults.filter((r) => r.status !== 'passed')) {
  for (const a of (f.assertionResults || []).filter((x) => x.status === 'failed')) {
    const msg = (a.failureMessages || []).join('\n');
    if (msg.includes(pattern)) {
      files.add(f.name.replace(/\\/g, '/').replace(cwd, ''));
      break;
    }
  }
}
[...files].forEach((f) => console.log(f));
