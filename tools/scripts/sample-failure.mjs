import fs from 'node:fs';
const pattern = process.argv[2] || '';
const d = JSON.parse(fs.readFileSync('artifacts/test-failures/web.json', 'utf8'));
const cwd = process.cwd().replace(/\\/g, '/');
let count = 0;
for (const f of d.testResults.filter((r) => r.status !== 'passed')) {
  for (const a of (f.assertionResults || []).filter((x) => x.status === 'failed')) {
    const msg = (a.failureMessages || []).join('\n');
    if (msg.includes(pattern)) {
      console.log('FILE:', f.name.replace(/\\/g, '/').replace(cwd, ''));
      console.log('TEST:', a.title);
      console.log(msg.split('\n').slice(0, 12).join('\n'));
      console.log('---');
      if (++count >= 3) process.exit(0);
    }
  }
}
