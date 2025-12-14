/**
 * IntelliFlow CRM AI Worker
 * Entry point for AI processing services
 */

import dotenv from 'dotenv';
import pino from 'pino';

// Load environment variables
dotenv.config();

const logger = pino({
  name: 'ai-worker',
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

// Export all public APIs
export { aiConfig, loadAIConfig, calculateCost } from './config/ai.config';
export { costTracker, CostTracker } from './utils/cost-tracker';
export { leadScoringChain, LeadScoringChain } from './chains/scoring.chain';
export { BaseAgent } from './agents/base.agent';
export {
  qualificationAgent,
  LeadQualificationAgent,
  createQualificationTask,
} from './agents/qualification.agent';

// Export types
export type { AIConfig, AIProvider, ModelName } from './config/ai.config';
export type { UsageMetrics, CostStatistics } from './utils/cost-tracker';
export type { LeadInput, ScoringResult } from './chains/scoring.chain';
export type {
  AgentContext,
  AgentTask,
  AgentResult,
  BaseAgentConfig,
} from './agents/base.agent';
export type {
  QualificationInput,
  QualificationOutput,
} from './agents/qualification.agent';

/**
 * Initialize the AI Worker
 */
async function initializeWorker() {
  logger.info('🤖 IntelliFlow AI Worker starting...');

  try {
    // Validate configuration
    const { aiConfig } = await import('./config/ai.config');

    logger.info(
      {
        provider: aiConfig.provider,
        model:
          aiConfig.provider === 'openai' ? aiConfig.openai.model : aiConfig.ollama.model,
        costTrackingEnabled: aiConfig.costTracking.enabled,
        cacheEnabled: aiConfig.performance.cacheEnabled,
      },
      'AI Worker configuration loaded'
    );

    // Initialize cost tracker
    const { costTracker } = await import('./utils/cost-tracker');
    logger.info('Cost tracker initialized');

    // Initialize chains
    const { leadScoringChain } = await import('./chains/scoring.chain');
    logger.info('Lead scoring chain initialized');

    // Initialize agents
    const { qualificationAgent } = await import('./agents/qualification.agent');
    logger.info('Qualification agent initialized');

    logger.info('✅ AI Worker initialized successfully');

    // Return public API
    return {
      aiConfig,
      costTracker,
      leadScoringChain,
      qualificationAgent,
    };
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      '❌ Failed to initialize AI Worker'
    );
    throw error;
  }
}

/**
 * Shutdown the AI Worker gracefully
 */
async function shutdown() {
  logger.info('🛑 AI Worker shutting down...');

  try {
    // Generate final cost report
    const { costTracker } = await import('./utils/cost-tracker');
    const report = costTracker.generateReport();
    logger.info('\n' + report);

    logger.info('✅ AI Worker shutdown complete');
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      '❌ Error during shutdown'
    );
  }
}

/**
 * Handle process signals for graceful shutdown
 */
function setupSignalHandlers() {
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT signal');
    await shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM signal');
    await shutdown();
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    logger.error(
      {
        error: error.message,
        stack: error.stack,
      },
      'Uncaught exception'
    );
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error(
      {
        reason,
      },
      'Unhandled promise rejection'
    );
    process.exit(1);
  });
}

/**
 * Main entry point
 */
async function main() {
  setupSignalHandlers();

  try {
    const worker = await initializeWorker();

    // Keep the process running
    logger.info('AI Worker is ready and waiting for tasks...');

    // In a production setup, this would connect to a message queue
    // or start an HTTP server to receive tasks
    // For now, we just keep the process alive
    await new Promise(() => {
      // Keep alive indefinitely
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Fatal error in main'
    );
    process.exit(1);
  }
}

// Run the worker if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export initialize function for programmatic use
export { initializeWorker, shutdown };
