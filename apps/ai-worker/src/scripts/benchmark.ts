/**
 * AI Performance Benchmark Script
 *
 * Tests AI operations for:
 * - Latency
 * - Cost
 * - Accuracy/Quality
 * - Throughput
 */

import { leadScoringChain, LeadInput } from '../chains/scoring.chain';
import { qualificationAgent, createQualificationTask } from '../agents/qualification.agent';
import { costTracker } from '../utils/cost-tracker';
import pino from 'pino';

const logger = pino({
  name: 'benchmark',
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

interface BenchmarkResult {
  operation: string;
  iterations: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  totalCost: number;
  averageCost: number;
  successRate: number;
}

/**
 * Benchmark lead scoring
 */
async function benchmarkLeadScoring(iterations: number = 10): Promise<BenchmarkResult> {
  logger.info({ iterations }, 'Benchmarking lead scoring...');

  const sampleLeads: LeadInput[] = [
    {
      email: 'john.doe@acme.com',
      firstName: 'John',
      lastName: 'Doe',
      company: 'Acme Corp',
      title: 'VP Sales',
      phone: '+1-555-0123',
      source: 'WEBSITE',
    },
    {
      email: 'jane@startup.io',
      firstName: 'Jane',
      company: 'Startup Inc',
      source: 'REFERRAL',
    },
    {
      email: 'bob@gmail.com',
      source: 'COLD_CALL',
    },
  ];

  const durations: number[] = [];
  let successes = 0;
  const startCost = costTracker.getDailyCost();

  for (let i = 0; i < iterations; i++) {
    const lead = sampleLeads[i % sampleLeads.length];
    const startTime = Date.now();

    try {
      await leadScoringChain.scoreLead(lead);
      const duration = Date.now() - startTime;
      durations.push(duration);
      successes++;
    } catch (error) {
      logger.error({ error, iteration: i }, 'Scoring failed');
    }
  }

  const endCost = costTracker.getDailyCost();
  const totalCost = endCost - startCost;

  return {
    operation: 'Lead Scoring',
    iterations,
    totalDuration: durations.reduce((a, b) => a + b, 0),
    averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
    minDuration: Math.min(...durations),
    maxDuration: Math.max(...durations),
    totalCost,
    averageCost: totalCost / iterations,
    successRate: successes / iterations,
  };
}

/**
 * Benchmark lead qualification
 */
async function benchmarkLeadQualification(iterations: number = 5): Promise<BenchmarkResult> {
  logger.info({ iterations }, 'Benchmarking lead qualification...');

  const sampleInput = {
    leadId: 'bench-123',
    email: 'john.doe@acme.com',
    firstName: 'John',
    lastName: 'Doe',
    company: 'Acme Corp',
    title: 'VP Sales',
    phone: '+1-555-0123',
    source: 'WEBSITE',
    score: 85,
    companyData: {
      industry: 'Technology',
      size: '500-1000',
      revenue: '$10M-$50M',
      location: 'San Francisco, CA',
    },
  };

  const durations: number[] = [];
  let successes = 0;
  const startCost = costTracker.getDailyCost();

  for (let i = 0; i < iterations; i++) {
    const task = createQualificationTask({
      ...sampleInput,
      leadId: `bench-${i}`,
    });

    const startTime = Date.now();

    try {
      await qualificationAgent.execute(task);
      const duration = Date.now() - startTime;
      durations.push(duration);
      successes++;
    } catch (error) {
      logger.error({ error, iteration: i }, 'Qualification failed');
    }
  }

  const endCost = costTracker.getDailyCost();
  const totalCost = endCost - startCost;

  return {
    operation: 'Lead Qualification',
    iterations,
    totalDuration: durations.reduce((a, b) => a + b, 0),
    averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
    minDuration: Math.min(...durations),
    maxDuration: Math.max(...durations),
    totalCost,
    averageCost: totalCost / iterations,
    successRate: successes / iterations,
  };
}

/**
 * Print benchmark results
 */
function printResults(results: BenchmarkResult[]): void {
  console.log('\n' + '='.repeat(80));
  console.log('AI PERFORMANCE BENCHMARK RESULTS');
  console.log('='.repeat(80) + '\n');

  results.forEach((result) => {
    console.log(`Operation: ${result.operation}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Success Rate: ${(result.successRate * 100).toFixed(1)}%`);
    console.log(`\nLatency:`);
    console.log(`  Average: ${result.averageDuration.toFixed(0)}ms`);
    console.log(`  Min: ${result.minDuration.toFixed(0)}ms`);
    console.log(`  Max: ${result.maxDuration.toFixed(0)}ms`);
    console.log(`\nCost:`);
    console.log(`  Total: $${result.totalCost.toFixed(4)}`);
    console.log(`  Average per operation: $${result.averageCost.toFixed(4)}`);
    console.log(`\nThroughput:`);
    console.log(
      `  ${((result.iterations / result.totalDuration) * 1000 * 60).toFixed(1)} ops/minute`
    );
    console.log('\n' + '-'.repeat(80) + '\n');
  });

  // Overall summary
  const totalCost = results.reduce((sum, r) => sum + r.totalCost, 0);
  const totalOps = results.reduce((sum, r) => sum + r.iterations, 0);

  console.log('SUMMARY:');
  console.log(`Total Operations: ${totalOps}`);
  console.log(`Total Cost: $${totalCost.toFixed(4)}`);
  console.log(`Average Cost per Operation: $${(totalCost / totalOps).toFixed(4)}`);
  console.log('\n' + '='.repeat(80) + '\n');

  // Cost report
  console.log(costTracker.generateReport());
}

/**
 * Main benchmark runner
 */
async function runBenchmarks() {
  logger.info('🚀 Starting AI benchmarks...\n');

  try {
    const results: BenchmarkResult[] = [];

    // Benchmark lead scoring
    const scoringResult = await benchmarkLeadScoring(10);
    results.push(scoringResult);

    // Small delay between benchmarks
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Benchmark lead qualification (fewer iterations as it's more expensive)
    const qualificationResult = await benchmarkLeadQualification(5);
    results.push(qualificationResult);

    // Print results
    printResults(results);

    logger.info('✅ Benchmarks completed successfully');
  } catch (error) {
    logger.error({ error }, '❌ Benchmark failed');
    process.exit(1);
  }
}

// Run benchmarks
runBenchmarks().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
