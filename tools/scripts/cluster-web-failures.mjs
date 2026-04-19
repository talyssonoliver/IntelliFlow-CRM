import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('artifacts/test-failures/web.json', 'utf8'));
const clusters = {};
const cwd = process.cwd().replace(/\\/g, '/');
for (const f of d.testResults.filter((r) => r.status !== 'passed')) {
  const rel = f.name.replace(/\\/g, '/').replace(cwd, '');
  for (const a of (f.assertionResults || []).filter((x) => x.status === 'failed')) {
    const msg = (a.failureMessages || []).join('\n').slice(0, 800);
    const lines = msg.split('\n').map((l) => l.trim()).filter(Boolean);
    const errLine =
      lines.find((l) => /Error:|TypeError:|ReferenceError:|SyntaxError:|AssertionError|Expected|Unable to find|Test timed out/.test(l)) ||
      lines[0] ||
      'unknown';
    const sig = errLine.replace(/\d+/g, 'N').replace(/\s+/g, ' ').slice(0, 180);
    if (!clusters[sig]) clusters[sig] = { count: 0, files: new Set(), sample: msg };
    clusters[sig].count++;
    clusters[sig].files.add(rel);
  }
}
const sorted = Object.entries(clusters).sort((a, b) => b[1].count - a[1].count);
console.log('Total signatures:', sorted.length);
console.log('Total failures:', sorted.reduce((a, [, d]) => a + d.count, 0));
for (const [sig, data] of sorted.slice(0, 20)) {
  console.log('---');
  console.log('COUNT:', data.count, '| UNIQUE_FILES:', data.files.size);
  console.log('SIG:', sig);
  const files = [...data.files].slice(0, 3);
  files.forEach((fl) => console.log('  -', fl));
}
