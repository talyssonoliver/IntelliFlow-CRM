/**
 * Adapters Layer
 * Infrastructure implementations of ports
 */

export * from './repositories';
export * from './external';

// ICS Generation Service (IFC-158)
export * from './ics/IcsGenerationService';

// Calendar Adapters (IFC-138)
export * from './calendar/microsoft/client';
export * from './calendar/shared';

// ERP Adapters (IFC-099)
export * from './erp/sap/client';

// Payment Adapters (IFC-099)
export * from './payments/stripe/client';
export * from './payments/paypal/client';

// Email Adapters (IFC-099)
export * from './email/gmail/client';
export * from './email/outlook/client';

// Messaging Adapters (IFC-099)
export * from './messaging/slack/client';
export * from './messaging/teams/client';

// Email Service Adapter (IFC-144)
export * from './messaging/email/EmailServiceAdapter';

// Webhook Service Adapter (IFC-144)
export * from './messaging/WebhookServiceAdapter';
