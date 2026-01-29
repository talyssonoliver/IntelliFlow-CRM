/**
 * Usage Examples for IntelliFlow AI Worker
 *
 * This file demonstrates how to use the AI Worker components
 */

import {
  leadScoringChain,
  qualificationAgent,
  createQualificationTask,
  costTracker,
} from '../index';

/**
 * Example 1: Simple Lead Scoring
 */
async function example1_SimpleLeadScoring() {
  console.log('=== Example 1: Simple Lead Scoring ===\n');

  const lead = {
    email: 'john.doe@acme.com',
    firstName: 'John',
    lastName: 'Doe',
    company: 'Acme Corp',
    title: 'VP of Sales',
    phone: '+1-555-0123',
    source: 'WEBSITE',
  };

  try {
    const result = await leadScoringChain.scoreLead(lead);

    console.log(`Lead Score: ${result.score}/100`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`Model: ${result.modelVersion}\n`);

    console.log('Scoring Factors:');
    result.factors.forEach((factor, index) => {
      console.log(`  ${index + 1}. ${factor.name} (${factor.impact} points)`);
      console.log(`     ${factor.reasoning}`);
    });

    // Validate the result
    const validation = leadScoringChain.validateScoringResult(result);
    console.log(`\nValidation: ${validation.valid ? 'PASSED' : 'FAILED'}`);
    if (!validation.valid) {
      console.log('Issues:', validation.issues);
    }
  } catch (error) {
    console.error('Scoring failed:', error);
  }
}

/**
 * Example 2: Batch Lead Scoring
 */
async function example2_BatchLeadScoring() {
  console.log('\n=== Example 2: Batch Lead Scoring ===\n');

  const leads = [
    {
      email: 'ceo@enterprise.com',
      firstName: 'Alice',
      lastName: 'Smith',
      company: 'Enterprise Inc',
      title: 'CEO',
      source: 'REFERRAL',
    },
    {
      email: 'bob@startup.io',
      firstName: 'Bob',
      company: 'Startup Inc',
      source: 'WEBSITE',
    },
    {
      email: 'contact@gmail.com',
      source: 'COLD_CALL',
    },
  ];

  try {
    console.log(`Scoring ${leads.length} leads...\n`);

    const results = await leadScoringChain.scoreLeads(leads);

    results.forEach((result, index) => {
      console.log(`Lead ${index + 1}: ${leads[index].email}`);
      console.log(`  Score: ${result.score}/100`);
      console.log(`  Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    });

    // Get cost statistics
    const stats = costTracker.getStatistics();
    console.log(`\nTotal Cost: $${stats.totalCost.toFixed(4)}`);
  } catch (error) {
    console.error('Batch scoring failed:', error);
  }
}

/**
 * Example 3: Lead Qualification with Agent
 */
async function example3_LeadQualification() {
  console.log('\n=== Example 3: Lead Qualification ===\n');

  const qualificationInput = {
    leadId: 'lead-12345',
    email: 'john.doe@acme.com',
    firstName: 'John',
    lastName: 'Doe',
    company: 'Acme Corp',
    title: 'VP of Sales',
    phone: '+1-555-0123',
    source: 'WEBSITE',
    score: 85,
    recentActivities: ['Visited pricing page 3 times', 'Downloaded whitepaper', 'Requested demo'],
    companyData: {
      industry: 'Technology',
      size: '500-1000 employees',
      revenue: '$50M-$100M',
      location: 'San Francisco, CA',
    },
  };

  try {
    const task = createQualificationTask(qualificationInput, {
      userId: 'user-123',
      sessionId: 'session-456',
    });

    console.log('Qualifying lead...\n');

    const result = await qualificationAgent.execute(task);

    if (result.success && result.output) {
      console.log(`Qualified: ${result.output.qualified ? 'YES' : 'NO'}`);
      console.log(`Qualification Level: ${result.output.qualificationLevel}`);
      console.log(`Confidence: ${(result.output.confidence * 100).toFixed(1)}%`);
      console.log(
        `Conversion Probability: ${(result.output.estimatedConversionProbability * 100).toFixed(1)}%\n`
      );

      console.log('Reasoning:');
      console.log(result.output.reasoning);

      console.log('\nStrengths:');
      result.output.strengths.forEach((strength) => {
        console.log(`  ✓ ${strength}`);
      });

      console.log('\nConcerns:');
      result.output.concerns.forEach((concern) => {
        console.log(`  ! ${concern}`);
      });

      console.log('\nRecommended Actions:');
      result.output.recommendedActions.forEach((action) => {
        console.log(`  [${action.priority}] ${action.action}`);
        console.log(`      → ${action.reasoning}`);
      });

      console.log('\nNext Steps:');
      result.output.nextSteps.forEach((step, index) => {
        console.log(`  ${index + 1}. ${step}`);
      });

      console.log(`\nAgent Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`Duration: ${result.duration}ms`);
    } else {
      console.error('Qualification failed:', result.error);
    }
  } catch (error) {
    console.error('Qualification error:', error);
  }
}

/**
 * Example 4: Cost Tracking and Reporting
 */
async function example4_CostTracking() {
  console.log('\n=== Example 4: Cost Tracking ===\n');

  // Get current daily cost
  const dailyCost = costTracker.getDailyCost();
  console.log(`Current Daily Cost: $${dailyCost.toFixed(4)}\n`);

  // Get detailed statistics
  const stats = costTracker.getStatistics();

  console.log('Statistics:');
  console.log(`  Total Operations: ${stats.totalOperations}`);
  console.log(`  Total Cost: $${stats.totalCost.toFixed(4)}`);
  console.log(`  Average Cost per Operation: $${stats.averageCostPerOperation.toFixed(6)}`);
  console.log(`  Total Input Tokens: ${stats.totalInputTokens.toLocaleString()}`);
  console.log(`  Total Output Tokens: ${stats.totalOutputTokens.toLocaleString()}\n`);

  console.log('Cost by Model:');
  Object.entries(stats.costByModel).forEach(([model, cost]) => {
    console.log(`  ${model}: $${cost.toFixed(4)}`);
  });

  console.log('\nCost by Operation:');
  Object.entries(stats.costByOperation).forEach(([operation, cost]) => {
    console.log(`  ${operation}: $${cost.toFixed(4)}`);
  });

  // Generate full report
  console.log('\n' + costTracker.generateReport());
}

/**
 * Example 5: Error Handling and Confidence Thresholds
 */
async function example5_ErrorHandlingAndThresholds() {
  console.log('\n=== Example 5: Error Handling & Confidence Thresholds ===\n');

  const CONFIDENCE_THRESHOLD = 0.7; // 70% confidence required

  const lead = {
    email: 'incomplete@test.com',
    source: 'UNKNOWN',
  };

  try {
    const result = await leadScoringChain.scoreLead(lead);

    console.log(`Score: ${result.score}/100`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%\n`);

    // Check confidence threshold
    if (result.confidence < CONFIDENCE_THRESHOLD) {
      console.log(`⚠️  LOW CONFIDENCE - Manual review required`);
      console.log(
        `   Confidence ${(result.confidence * 100).toFixed(1)}% is below threshold ${(CONFIDENCE_THRESHOLD * 100).toFixed(1)}%`
      );

      // In a real system, you would:
      // 1. Flag for manual review
      // 2. Send notification to sales team
      // 3. Log for quality monitoring
    } else {
      console.log(`✓ HIGH CONFIDENCE - Can auto-process`);
    }

    // Validate result quality
    const validation = leadScoringChain.validateScoringResult(result);
    if (!validation.valid) {
      console.log(`\n⚠️  QUALITY ISSUES DETECTED:`);
      validation.issues.forEach((issue) => {
        console.log(`   - ${issue}`);
      });
    }
  } catch (error) {
    console.error('❌ Scoring failed:', error);
    console.log('\nFallback strategy:');
    console.log('  1. Use default score based on source');
    console.log('  2. Flag for manual review');
    console.log('  3. Retry with different parameters');
  }
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('\n🚀 IntelliFlow AI Worker - Usage Examples\n');
  console.log('='.repeat(60) + '\n');

  try {
    await example1_SimpleLeadScoring();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await example2_BatchLeadScoring();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await example3_LeadQualification();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await example4_CostTracking();

    await example5_ErrorHandlingAndThresholds();

    console.log('\n' + '='.repeat(60));
    console.log('✅ All examples completed successfully!');
    console.log('='.repeat(60) + '\n');
  } catch (error) {
    console.error('\n❌ Example failed:', error);
    process.exit(1);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export {
  example1_SimpleLeadScoring,
  example2_BatchLeadScoring,
  example3_LeadQualification,
  example4_CostTracking,
  example5_ErrorHandlingAndThresholds,
};
