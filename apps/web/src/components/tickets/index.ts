/**
 * Ticket Management Components (PG-137)
 *
 * Barrel exports for all ticket UI components.
 */

// Types
export type {
  TicketListItem,
  TicketDetailData,
  TicketStats,
  TicketFilterOptions,
  BulkActionType,
  ResolutionInput,
  TicketActivity,
  TicketCustomer,
  TicketAccount,
  TicketAttachment,
  TicketNextStep,
  TicketRelated,
  TicketSLA,
  TicketAIInsights,
} from './types';

// Components — added as they are implemented
export { SLAIndicator } from './SLAIndicator';
export { TicketList } from './TicketList';
export { TicketCard } from './TicketCard';
export { TicketDetail } from './TicketDetail';
export { EscalationAlert } from './EscalationAlert';
export { TicketForm } from './TicketForm';
export { CustomerPortalView } from './CustomerPortalView';
