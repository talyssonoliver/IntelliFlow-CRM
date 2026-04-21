import { hydrateContext, writeHydratedContext } from './lib/stoa/context-hydration.ts';

const repoRoot = process.cwd();
try {
  const context = await hydrateContext('IFC-312', repoRoot, '.specify');
  const outputPath = writeHydratedContext(context, repoRoot, '.specify');
  console.log('Wrote:', outputPath);
  console.log('Context hash:', context.contextHash);
  console.log('Deps:', context.dependencyArtifacts.length);
  console.log('Patterns:', context.codebasePatterns.length);
} catch (e) {
  console.error('ERROR:', e && e.stack ? e.stack : e);
  process.exit(1);
}
