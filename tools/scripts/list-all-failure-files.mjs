import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('artifacts/test-failures/web.json', 'utf8'));
const cwd = process.cwd().replace(/\\/g, '/');
const resolved = new Set([
  // Resolved by iterations 5-19 (baseline stale; won't re-check these)
  '/apps/web/src/components/tickets/__tests__/TicketDetail.coverage.test.tsx',
  '/apps/web/src/lib/adr/__tests__/adr-service.b11.test.ts',
  '/apps/web/src/app/settings/__tests__/page.test.tsx',
  '/apps/web/src/components/ai-monitoring/__tests__/QueueSchedulerPanel.test.tsx',
  '/apps/web/src/components/accounts/__tests__/AccountContactsList.test.tsx',
  '/apps/web/src/components/accounts/__tests__/AccountOpportunitiesList.test.tsx',
  '/apps/web/src/components/accounts/__tests__/RevenueChart.test.tsx',
  '/apps/web/src/components/contacts/__tests__/ContactList.test.tsx',
  '/apps/web/src/components/documents/__tests__/ACLManager.test.tsx',
  '/apps/web/src/components/documents/__tests__/DocumentList.test.tsx',
  '/apps/web/src/components/documents/__tests__/VersionHistory.test.tsx',
  '/apps/web/src/components/tasks/__tests__/TaskList.test.tsx',
  '/apps/web/src/app/contacts/[id]/__tests__/page.test.tsx',
  '/apps/web/src/app/settings/leads/__tests__/CustomFieldsTab.test.tsx',
  '/apps/web/src/components/ai-monitoring/__tests__/DriftDashboard.test.tsx',
  '/apps/web/src/lib/export/__tests__/pdf.test.ts',
  '/apps/web/src/lib/export/__tests__/csv.test.ts',
  '/apps/web/src/app/deals/(list)/new/__tests__/page.test.tsx',
  '/apps/web/src/app/api/openapi/__tests__/route.test.ts',
  '/apps/web/src/components/dashboard/widgets/__tests__/RecentActivityWidget.test.tsx',
  '/apps/web/src/app/email/__tests__/_layout-shell.test.tsx',
  '/apps/web/src/app/(public)/mfa/verify/__tests__/page.test.tsx',
  '/apps/web/src/app/(public)/auth/callback/__tests__/page.test.tsx',
  '/apps/web/src/app/(public)/login/__tests__/page.test.tsx',
  '/apps/web/src/app/api/quality-reports/__tests__/route.supplementary.test.ts',
]);
// Known flaky / needs-human
const defer = new Set([
  '/apps/web/src/components/tickets/__tests__/TicketDetail.test.tsx',
]);
const files = [];
for (const f of d.testResults.filter((r) => r.status !== 'passed')) {
  const rel = f.name.replace(/\\/g, '/').replace(cwd, '');
  if (resolved.has(rel) || defer.has(rel)) continue;
  const nFails = (f.assertionResults || []).filter((a) => a.status === 'failed').length;
  files.push({ file: rel, nFails });
}
files.sort((a, b) => b.nFails - a.nFails);
console.log('Remaining failing files:', files.length);
console.log('Total residual failures:', files.reduce((a, f) => a + f.nFails, 0));
files.slice(0, 20).forEach((f) => console.log(`  ${f.nFails}  ${f.file}`));
