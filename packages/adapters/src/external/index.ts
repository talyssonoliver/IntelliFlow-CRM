/**
 * External Service Adapters
 * Implementations of external service ports
 */

export * from './InMemoryEventBus';
export * from './InMemoryCache';
export * from './MockAIService';
// OllamaAIService and LiteLLMAIService are intentionally NOT re-exported from the
// barrel: each statically imports a heavy LLM SDK (@langchain/ollama,
// @langchain/openai — ~600ms each at cold start). Re-exporting here would pull
// them into the barrel's eager module graph and defeat container.ts's lazy
// provider loading. They are built as their own tsup entry points and imported
// on demand via '@intelliflow/adapters/external/OllamaAIService' (and …/LiteLLMAIService).
export * from './GuardrailsAIService';
export * from './MockNotificationServiceAdapter';
export * from './RealNotificationServiceAdapter';
export * from './HttpPortalDeliverySyncAdapter';
