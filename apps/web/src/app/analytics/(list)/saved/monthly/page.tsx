'use client';

import SavedReportView from '@/components/analytics/SavedReportView';
import type { SavedReportConfig } from '@/components/analytics/SavedReportView';

const MONTHLY_CONFIG: SavedReportConfig = {
  reportType: 'monthly',
  defaultPeriod: '30d',
  title: 'Monthly Revenue',
  description: 'Last 30 days: revenue breakdown, lead sources, and pipeline metrics',
  breadcrumbLabel: 'Monthly Revenue',
};

export default function MonthlyReportPage() {
  return <SavedReportView config={MONTHLY_CONFIG} />;
}
