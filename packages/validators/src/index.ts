// IntelliFlow CRM - Validation Schemas
// Centralized Zod schemas for type-safe validation

// Common schemas (includes Value Object transformers)
export * from './common';

// Environment validation (2025 best practice: validate at startup)
export * from './config';

// Base composable schemas (DRY principle)
export * from './base-schemas';

// Entity Schemas
export * from './lead';

// Auth Schemas
export * from './auth';
export * from './contact';
export * from './account';
export * from './opportunity';
export * from './task';
export * from './ticket';
export * from './case';
export * from './appointment';

// Public Forms
export * from './contact-form';

// AI Output Schemas (agent outputs with confidence scores)
export * from './ai';

// Feedback Schemas (IFC-024: Human-in-the-Loop)
export * from './feedback';

// Experiment Schemas (IFC-025: A/B Testing Framework)
export * from './experiment';

// Chain Version Schemas (IFC-086: Model Versioning with Zep)
export * from './chain-version';

// Timeline Schemas
export * from './timeline';

// Bulk Operation Schemas
export * from './bulk-operations';

// Billing Schemas (PG-025: Billing Portal)
export * from './billing';

// Platform Metrics Schemas (IFC-078: Platform Engineering Foundation)
export * from './platform-metrics';

// Auto-Response Schemas (IFC-029: Auto-Response with Approval Gate)
export * from './auto-response';

// Event Schemas (IFC-150: Domain Events Infrastructure)
export * from './events';

// Home Page Schemas (IFC-182: Home Page Router)
export * from './home';

// Notifications Schemas (IFC-183: Notifications Router)
export * from './notifications';

// AI Output Review Schemas (IFC-176)
export * from './ai-review';

// Activity Feed Schemas (IFC-069)
export * from './activity-feed';

// Module & Plan Tier Schemas (IFC-208)
export * from './module';

// Routing Schemas (PG-132)
export * from './routing';

// Email Schemas (read state, unread counts)
export * from './email';

// SLA Policy Schemas (PG-173)
export * from './sla-policy';

// Ticket Category Schemas (PG-173)
export * from './ticket-category';

// Feedback Survey Schemas (IFC-068: Feedback Analytics Dashboard)
export * from './feedback-survey';

// Ticket Routing Schemas (IFC-067: Automatic Ticket Routing Engine)
export * from './ticket-routing';

// User Schemas (IFC-191: User Timezone Support)
export * from './user';

// Calendar Schemas (custom calendar management)
export * from './calendar';

// Lead Settings Schemas (PG-178)
export * from './lead-settings';

// Help Article Schemas (IFC-299)
export * from './help-article';
