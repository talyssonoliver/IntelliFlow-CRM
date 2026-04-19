/**
 * Zep Memory Adapter - Module Exports
 *
 * Task: IFC-086 - Model Versioning with Zep
 *
 * @deprecated 2026-04-19 - this adapter has zero callers in apps/*\/src/
 * (verified via 2026-04-17 audit and 2026-04-19 re-audit). The live memory
 * surface is now PrismaConversationSearchRepository plus pgvector RAG
 * (rag-context.chain and RetrievalService). Removal is deferred pending
 * explicit owner approval because the file has 2 test files and a domain
 * config constant.
 */

export * from './zep-client';
