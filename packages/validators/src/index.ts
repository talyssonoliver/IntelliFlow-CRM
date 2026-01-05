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
