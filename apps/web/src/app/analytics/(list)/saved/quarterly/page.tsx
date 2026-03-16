'use client';

import SavedReportView from '@/components/analytics/SavedReportView';
import type { SavedReportConfig } from '@/components/analytics/SavedReportView';

const QUARTERLY_CONFIG: SavedReportConfig = {
  reportType: 'quarterly',
  defaultPeriod: '90d',
  title: 'Q4 Performance',
  description: 'Quarterly performance summary with year-over-year comparison',
  breadcrumbLabel: 'Q4 Performance',
};

export default function QuarterlyReportPage() {
  return <SavedReportView config={QUARTERLY_CONFIG} />;
}
