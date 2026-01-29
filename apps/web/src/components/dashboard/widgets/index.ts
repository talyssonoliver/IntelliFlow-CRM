// Dashboard Widget Registry
// Maps widget types to their React components

import type { ComponentType } from 'react';

// Dashboard widgets (matching actual dashboard)
import { TotalLeadsWidget } from './TotalLeadsWidget';
import { SalesRevenueWidget } from './SalesRevenueWidget';
import { ActiveDealsWidget } from './ActiveDealsWidget';
import { OpenTicketsWidget } from './OpenTicketsWidget';
import { PipelineSummaryWidget } from './PipelineSummaryWidget';
import { UpcomingTasksWidget } from './UpcomingTasksWidget';
import { DealsWonWidget } from './DealsWonWidget';

// Additional widgets for customization
import { RevenueWidget } from './RevenueWidget';
import { ActiveLeadsWidget } from './ActiveLeadsWidget';
import { ConversionRateWidget } from './ConversionRateWidget';
import { PendingTasksWidget } from './PendingTasksWidget';
import { RecentActivityWidget } from './RecentActivityWidget';
import { PipelineWidget } from './PipelineWidget';
import { TopPerformersWidget } from './TopPerformersWidget';
import { UpcomingEventsWidget } from './UpcomingEventsWidget';
import { TeamChatWidget } from './TeamChatWidget';
import { TrafficSourcesWidget } from './TrafficSourcesWidget';
import { GrowthTrendsWidget } from './GrowthTrendsWidget';

export interface WidgetProps {
  config?: Record<string, unknown>;
}

// Widget registry mapping type strings to React components
export const widgetRegistry: Record<string, ComponentType<WidgetProps>> = {
  // Dashboard widgets
  'total-leads': TotalLeadsWidget,
  'sales-revenue': SalesRevenueWidget,
  'active-deals': ActiveDealsWidget,
  'open-tickets': OpenTicketsWidget,
  'pipeline-summary': PipelineSummaryWidget,
  'upcoming-tasks': UpcomingTasksWidget,
  'deals-won': DealsWonWidget,
  'recent-activity': RecentActivityWidget,

  // Additional customization widgets
  'revenue': RevenueWidget,
  'active-leads': ActiveLeadsWidget,
  'conversion-rate': ConversionRateWidget,
  'pending-tasks': PendingTasksWidget,
  'pipeline': PipelineWidget,
  'top-performers': TopPerformersWidget,
  'upcoming-events': UpcomingEventsWidget,
  'team-chat': TeamChatWidget,
  'traffic-sources': TrafficSourcesWidget,
  'growth-trends': GrowthTrendsWidget,
};

// Re-export all widgets
export { TotalLeadsWidget } from './TotalLeadsWidget';
export { SalesRevenueWidget } from './SalesRevenueWidget';
export { ActiveDealsWidget } from './ActiveDealsWidget';
export { OpenTicketsWidget } from './OpenTicketsWidget';
export { PipelineSummaryWidget } from './PipelineSummaryWidget';
export { UpcomingTasksWidget } from './UpcomingTasksWidget';
export { DealsWonWidget } from './DealsWonWidget';
export { RevenueWidget } from './RevenueWidget';
export { ActiveLeadsWidget } from './ActiveLeadsWidget';
export { ConversionRateWidget } from './ConversionRateWidget';
export { PendingTasksWidget } from './PendingTasksWidget';
export { RecentActivityWidget } from './RecentActivityWidget';
export { PipelineWidget } from './PipelineWidget';
export { TopPerformersWidget } from './TopPerformersWidget';
export { UpcomingEventsWidget } from './UpcomingEventsWidget';
export { TeamChatWidget } from './TeamChatWidget';
export { TrafficSourcesWidget } from './TrafficSourcesWidget';
export { GrowthTrendsWidget } from './GrowthTrendsWidget';
