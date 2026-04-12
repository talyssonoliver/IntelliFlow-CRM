/**
 * Intelligence Domain Module (IFC-095)
 *
 * Value objects and events for AI-powered intelligence features:
 * - Churn risk scoring
 * - Next best action recommendations
 * - Customer health assessments
 *
 * @module @intelliflow/domain/intelligence
 */

// Value Objects
export * from './ChurnRiskScore';
export * from './NextBestAction';

// Domain Events
export * from './events/ChurnRiskAssessedEvent';
