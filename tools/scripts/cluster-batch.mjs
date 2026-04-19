import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('artifacts/test-failures/web.json', 'utf8'));
const cwd = process.cwd().replace(/\\/g, '/');
const handled = new Set([
  '/apps/web/src/components/tickets/__tests__/TicketDetail.coverage.test.tsx',
  '/apps/web/src/lib/adr/__tests__/adr-service.b11.test.ts',
  '/apps/web/src/lib/adr/__tests__/adr-service.test.ts',
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
  '/apps/web/src/lib/shared/__tests__/password-validation.test.ts',
  '/apps/web/src/app/governance/compliance/__tests__/page.test.tsx',
  '/apps/web/src/components/notifications/__tests__/NotificationBell.test.tsx',
  '/apps/web/src/components/email/__tests__/EmailPage.test.tsx',
  '/apps/web/src/app/leads/[id]/__tests__/convert-lead.test.tsx',
  '/apps/web/src/components/governance/__tests__/PerformanceReportView.test.tsx',
  '/apps/web/src/components/billing/__tests__/billing-portal.test.tsx',
  '/apps/web/src/lib/shared/__tests__/timezone-utils.test.ts',
  '/apps/web/src/components/email/__tests__/email-coverage.supplementary.test.tsx',
  '/apps/web/src/components/developer/__tests__/app-metrics.test.tsx',
  '/apps/web/src/components/tickets/__tests__/TicketList.coverage.test.tsx',
  '/apps/web/src/components/ai-monitoring/__tests__/ActiveAgentsDashboard.test.tsx',
  '/apps/web/src/components/status/__tests__/status-monitor.test.tsx',
  '/apps/web/src/components/shared/__tests__/job-detail-template.test.tsx',
  '/apps/web/src/app/api/compliance/__tests__/compliance-api.additional.test.ts',
  '/apps/web/src/components/ai-monitoring/__tests__/AgentLogsViewer.test.tsx',
  '/apps/web/src/components/ai-intelligence/__tests__/ExperimentsDashboard.test.tsx',
  '/apps/web/src/components/billing/__tests__/payment-methods.supplementary.test.tsx',
  '/apps/web/src/components/billing/__tests__/subscription-manager.supplementary.test.tsx',
  '/apps/web/src/components/tickets/__tests__/TicketDetail.test.tsx', // deferred
]);
const files = [];
for (const f of d.testResults.filter((r) => r.status !== 'passed')) {
  const rel = f.name.replace(/\\/g, '/').replace(cwd, '');
  if (handled.has(rel)) continue;
  const nFails = (f.assertionResults || []).filter((a) => a.status === 'failed').length;
  files.push({ file: rel, nFails });
}
files.sort((a, b) => b.nFails - a.nFails);
console.log('Remaining files:', files.length);
console.log('Total residual:', files.reduce((a, f) => a + f.nFails, 0));
files.slice(0, 30).forEach((f) => console.log(`  ${f.nFails}  ${f.file}`));
