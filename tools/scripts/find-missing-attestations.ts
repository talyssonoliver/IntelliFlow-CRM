import { readdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const attestationsDir = 'artifacts/attestations';

interface AttestationStatus {
  taskId: string;
  hasAttestation: boolean;
  hasContextAck: boolean;
  hasContextPack: boolean;
}

const results: AttestationStatus[] = [];
const missing: string[] = [];

const dirs = readdirSync(attestationsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

console.log(`Found ${dirs.length} attestation directories\n`);

for (const dir of dirs) {
  const dirPath = join(attestationsDir, dir);
  const hasAttestation = existsSync(join(dirPath, 'attestation.json'));
  const hasContextAck = existsSync(join(dirPath, 'context_ack.json'));
  const hasContextPack = existsSync(join(dirPath, 'context_pack.md'));

  results.push({ taskId: dir, hasAttestation, hasContextAck, hasContextPack });

  if (!hasAttestation && hasContextAck) {
    missing.push(dir);
  }
}

console.log('=== MISSING attestation.json (but have context_ack.json) ===');
missing.forEach(m => console.log(`  - ${m}`));
console.log(`\nTotal missing: ${missing.length}`);

// Output as JSON for processing
writeFileSync('artifacts/missing-attestations.json', JSON.stringify(missing, null, 2));
console.log('\nList saved to artifacts/missing-attestations.json');
