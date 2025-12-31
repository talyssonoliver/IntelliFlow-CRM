// IntelliFlow CRM - Validation Schemas
// Centralized Zod schemas for type-safe validation

// Common schemas (includes Value Object transformers)
export * from './common';

// Environment validation (2025 best practice: validate at startup)
export * from './env';

// Base composable schemas (DRY principle)
export * from './base-schemas';

// Entity Schemas
export * from './lead';
export * from './contact';
export * from './account';
export * from './opportunity';
export * from './task';
export * from './ticket';
export * from './case';

// Public Forms
export * from './contact-form';
