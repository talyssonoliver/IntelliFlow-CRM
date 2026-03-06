/**
 * AI Chains Index
 *
 * Central export point for all AI chains in the ai-worker.
 * This file makes chains discoverable and provides a clean API for consumers.
 *
 * Chains included:
 * - AutoResponseChain: IFC-029 Auto-Response with Approval Gate
 * - LeadScoringChain: Lead scoring with confidence metrics
 * - SentimentAnalysisChain: Sentiment analysis with emotion detection
 * - ChurnRiskChain: IFC-095 Churn risk prediction
 * - EmbeddingChain: Text embedding generation
 * - RAGContextChain: IFC-039 Retrieval-Augmented Generation
 */

// =============================================================================
// Auto-Response Chain (IFC-029)
// =============================================================================
export {
  AutoResponseChain,
  type AutoResponseInput,
  type AutoResponseOutput,
  type ValidationResult,
} from './auto-response.chain';

// =============================================================================
// Lead Scoring Chain
// =============================================================================
export {
  LeadScoringChain,
  leadInputSchema,
  type LeadInput,
  type ScoringResult,
} from './scoring.chain';

// =============================================================================
// Sentiment Analysis Chain (IFC-039)
// =============================================================================
export {
  SentimentAnalysisChain,
  sentimentChain,
  sentimentInputSchema,
  sentimentResultSchema,
  type SentimentInput,
  type SentimentResult,
  SENTIMENT_LABELS,
  EMOTION_LABELS,
  URGENCY_LEVELS,
  type SentimentLabel,
  type EmotionLabel,
  type UrgencyLevel,
} from './sentiment.chain';

// =============================================================================
// Churn Risk Chain (IFC-095)
// =============================================================================
export {
  ChurnRiskChain,
  churnRiskChain,
  churnRiskInputSchema,
  churnRiskResultSchema,
  riskFactorSchema,
  RISK_LEVEL_CONFIG,
  type ChurnRiskInput,
  type ChurnRiskResult,
  type RiskFactor,
  type ChurnRiskLevel,
} from './churn-risk.chain';

// =============================================================================
// Embedding Chain
// =============================================================================
export {
  EmbeddingChain,
  embeddingChain,
  embeddingInputSchema,
  embeddingResultSchema,
  type EmbeddingInput,
  type EmbeddingResult,
  type BatchEmbeddingResult,
} from './embedding.chain';

// =============================================================================
// RAG Context Chain (IFC-039)
// =============================================================================
export {
  RAGContextChain,
  ragContextChain,
  createRAGContextChain,
  RAG_SOURCES,
  ragContextInputSchema,
  ragContextResultSchema,
  contextItemSchema,
  type RAGSource,
  type RAGContextInput,
  type RAGContextResult,
  type ContextItem,
  type IRetrievalService,
} from './rag-context.chain';

// =============================================================================
// Ticket Routing Chain (IFC-067)
// =============================================================================
export {
  TicketRoutingChain,
  ticketRoutingChain,
  getTicketRoutingChain,
  ticketRoutingInputSchema as chainTicketRoutingInputSchema,
  ticketRoutingResultSchema as chainTicketRoutingResultSchema,
  type TicketRoutingInput,
  type TicketRoutingResult,
  type AgentCandidate,
} from './ticket-routing.chain';

// =============================================================================
// Insight Generation Chain
// =============================================================================
export {
  InsightGenerationChain,
  insightGenerationChain,
  getInsightGenerationChain,
  InsightGenerationInputSchema,
  GeneratedInsightSchema,
  type InsightGenerationInput,
  type GeneratedInsight,
} from './insight-generation.chain';

// =============================================================================
// Chain Utilities
// =============================================================================
export {
  leadInputSchema as chainLeadInputSchema,
  type LeadInput as ChainLeadInput,
  type ScoringResult as ChainScoringResult,
} from './chain-utils';
