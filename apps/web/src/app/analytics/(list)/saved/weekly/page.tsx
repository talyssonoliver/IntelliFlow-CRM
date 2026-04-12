'use client';

import SavedReportView from '@/components/analytics/SavedReportView';
import type { SavedReportConfig } from '@/components/analytics/SavedReportView';

const WEEKLY_CONFIG: SavedReportConfig = {
  reportType: 'weekly',
  defaultPeriod: '7d',
  title: 'Weekly Summary',
  description: 'Last 7 days: revenue, leads, pipeline activity, and trend indicators',
  breadcrumbLabel: 'Weekly Summary',
};

export default function WeeklyReportPage() {
  return <SavedReportView config={WEEKLY_CONFIG} />;
}
