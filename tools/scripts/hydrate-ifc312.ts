import { hydrateContext, writeHydratedContext } from './lib/stoa/context-hydration.js';

async function main() {
  const repoRoot = process.cwd();
  const context = await hydrateContext('IFC-312', repoRoot, '.specify');
  const outputPath = writeHydratedContext(context, repoRoot, 19, '.specify');
  console.log('Wrote:', outputPath);
  console.log('Context hash:', context.contextHash);
  console.log('Deps:', context.dependencyArtifacts.length);
  console.log('Patterns:', context.codebasePatterns.length);
}

main().catch((e: any) => {
  console.error('ERROR:', e && e.stack ? e.stack : e);
  process.exit(1);
});
