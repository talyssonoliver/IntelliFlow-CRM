/**
 * Intelligence Components (IFC-095)
 *
 * AI-powered insight components for the IntelliFlow CRM.
 * Used in Contact 360 and Lead 360 views.
 *
 * @see Sprint 8 - IFC-095: Churn Risk & Next Best Action
 */

export {
  ChurnRiskCard,
  ChurnRiskCardSkeleton,
  churnRiskCardVariants,
  getRiskLevelConfig,
  type ChurnRiskLevel,
  type RiskFactor,
  type ChurnRiskData,
  type ChurnRiskCardProps,
} from './ChurnRiskCard';

export {
  NextBestActionCard,
  NextBestActionCardSkeleton,
  nbaCardVariants,
  getActionConfig,
  getPriorityConfig,
  type NBAActionType,
  type NBAPriority,
  type NextBestActionData,
  type NextBestActionCardProps,
} from './NextBestActionCard';
