/**
 * AI Hallucination Checker
 * Detects and measures hallucination rates in AI model outputs.
 * Target: Maintain hallucination rate <5% (KPI requirement)
 *
 * @module hallucination-checker
 * @task IFC-117
 */

import pino from 'pino';

const logger = pino({
  name: 'hallucination-checker',
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Types of hallucination detected
 */
export type HallucinationType =
  | 'factual_error' // Incorrect facts not supported by context
  | 'fabricated_entity' // Made-up names, companies, products
  | 'inconsistent_logic' // Self-contradictory statements
  | 'unsupported_claim' // Claims without evidence in context
  | 'temporal_error' // Wrong dates, times, or sequences
  | 'numerical_error' // Incorrect calculations or statistics
  | 'attribution_error' // Misattributed quotes or sources
  | 'context_drift'; // Response unrelated to query context

/**
 * Hallucination check result for a single output
 */
export interface HallucinationResult {
  id: string;
  timestamp: Date;
  model: string;
  inputContext: string;
  output: string;
  hallucinated: boolean;
  confidence: number;
  hallucinationTypes: HallucinationType[];
  evidence: string[];
  groundTruthSources: string[];
  score: number; // 0 = no hallucination, 1 = complete hallucination
}

/**
 * Aggregated hallucination statistics
 */
export interface HallucinationStats {
  totalChecks: number;
  hallucinationsDetected: number;
  hallucinationRate: number;
  byType: Record<HallucinationType, number>;
  byModel: Record<string, { total: number; hallucinated: number; rate: number }>;
  averageConfidence: number;
  periodStart: Date;
  periodEnd: Date;
  kpiCompliant: boolean; // True if rate < 5%
}

/**
 * Configuration for hallucination detection
 */
export interface HallucinationCheckerConfig {
  maxHallucinationRate: number; // Target: 0.05 (5%)
  confidenceThreshold: number; // Minimum confidence to flag
  enableFactChecking: boolean;
  enableLogicChecking: boolean;
  enableEntityValidation: boolean;
  groundTruthSources: string[];
}

/**
 * Semantic similarity check result
 */
interface SemanticCheck {
  similarity: number;
  alignedClaims: string[];
  unsupportedClaims: string[];
}

/**
 * Hallucination Checker Service
 * Uses multiple detection strategies to identify AI hallucinations
 */
export class HallucinationChecker {
  private results: HallucinationResult[] = [];
  private readonly knownEntities: Set<string> = new Set();
  private readonly factDatabase: Map<string, string> = new Map();

  constructor(private readonly config: HallucinationCheckerConfig) {
    logger.info({ config }, 'HallucinationChecker initialized');
    this.initializeKnownEntities();
  }

  /**
   * Check an AI output for hallucinations
   */
  async checkOutput(params: {
    id: string;
    model: string;
    inputContext: string;
    output: string;
    groundTruth?: string[];
  }): Promise<HallucinationResult> {
    const startTime = Date.now();

    const hallucinationTypes: HallucinationType[] = [];
    const evidence: string[] = [];
    let totalScore = 0;
    let checksPerformed = 0;

    // 1. Check for fabricated entities
    if (this.config.enableEntityValidation) {
      const entityCheck = this.checkForFabricatedEntities(params.output);
      if (entityCheck.fabricated.length > 0) {
        hallucinationTypes.push('fabricated_entity');
        evidence.push(`Fabricated entities: ${entityCheck.fabricated.join(', ')}`);
        totalScore += entityCheck.score;
      }
      checksPerformed++;
    }

    // 2. Check for factual errors against ground truth
    if (this.config.enableFactChecking && params.groundTruth) {
      const factCheck = this.checkFactualAccuracy(params.output, params.groundTruth);
      if (factCheck.errors.length > 0) {
        hallucinationTypes.push('factual_error');
        evidence.push(...factCheck.errors.map(e => `Factual error: ${e}`));
        totalScore += factCheck.score;
      }
      checksPerformed++;
    }

    // 3. Check for logical consistency
    if (this.config.enableLogicChecking) {
      const logicCheck = this.checkLogicalConsistency(params.output);
      if (!logicCheck.consistent) {
        hallucinationTypes.push('inconsistent_logic');
        evidence.push(...logicCheck.contradictions.map(c => `Contradiction: ${c}`));
        totalScore += logicCheck.score;
      }
      checksPerformed++;
    }

    // 4. Check for unsupported claims
    const claimCheck = this.checkClaimSupport(params.output, params.inputContext);
    if (claimCheck.unsupportedClaims.length > 0) {
      hallucinationTypes.push('unsupported_claim');
      evidence.push(...claimCheck.unsupportedClaims.map(c => `Unsupported: ${c}`));
      totalScore += claimCheck.score;
    }
    checksPerformed++;

    // 5. Check for context drift
    const driftCheck = this.checkContextDrift(params.inputContext, params.output);
    if (driftCheck.drifted) {
      hallucinationTypes.push('context_drift');
      evidence.push(`Context drift detected: ${driftCheck.reason}`);
      totalScore += driftCheck.score;
    }
    checksPerformed++;

    // 6. Check for numerical errors
    const numCheck = this.checkNumericalAccuracy(params.output);
    if (numCheck.errors.length > 0) {
      hallucinationTypes.push('numerical_error');
      evidence.push(...numCheck.errors.map(e => `Numerical error: ${e}`));
      totalScore += numCheck.score;
    }
    checksPerformed++;

    // Calculate final score
    const score = checksPerformed > 0 ? totalScore / checksPerformed : 0;
    const hallucinated = score >= this.config.confidenceThreshold;

    const result: HallucinationResult = {
      id: params.id,
      timestamp: new Date(),
      model: params.model,
      inputContext: params.inputContext.slice(0, 500), // Truncate for storage
      output: params.output.slice(0, 1000),
      hallucinated,
      confidence: Math.min(1, score * 2), // Scale confidence
      hallucinationTypes,
      evidence,
      groundTruthSources: params.groundTruth ?? [],
      score,
    };

    this.results.push(result);

    const duration = Date.now() - startTime;

    if (hallucinated) {
      logger.warn(
        {
          id: params.id,
          model: params.model,
          score: score.toFixed(4),
          types: hallucinationTypes,
          evidenceCount: evidence.length,
          durationMs: duration,
        },
        'Hallucination detected'
      );
    } else {
      logger.debug(
        {
          id: params.id,
          model: params.model,
          score: score.toFixed(4),
          durationMs: duration,
        },
        'Hallucination check passed'
      );
    }

    return result;
  }

  /**
   * Get hallucination statistics
   */
  getStats(startTime?: Date, endTime?: Date): HallucinationStats {
    const start = startTime ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = endTime ?? new Date();

    const filteredResults = this.results.filter(
      r => r.timestamp >= start && r.timestamp <= end
    );

    const totalChecks = filteredResults.length;
    const hallucinationsDetected = filteredResults.filter(r => r.hallucinated).length;
    const hallucinationRate = totalChecks > 0 ? hallucinationsDetected / totalChecks : 0;

    // Count by type
    const byType: Record<HallucinationType, number> = {
      factual_error: 0,
      fabricated_entity: 0,
      inconsistent_logic: 0,
      unsupported_claim: 0,
      temporal_error: 0,
      numerical_error: 0,
      attribution_error: 0,
      context_drift: 0,
    };

    for (const result of filteredResults) {
      for (const type of result.hallucinationTypes) {
        byType[type]++;
      }
    }

    // Count by model
    const byModel: Record<string, { total: number; hallucinated: number; rate: number }> = {};
    for (const result of filteredResults) {
      if (!byModel[result.model]) {
        byModel[result.model] = { total: 0, hallucinated: 0, rate: 0 };
      }
      byModel[result.model].total++;
      if (result.hallucinated) {
        byModel[result.model].hallucinated++;
      }
    }

    for (const model of Object.keys(byModel)) {
      byModel[model].rate = byModel[model].total > 0
        ? byModel[model].hallucinated / byModel[model].total
        : 0;
    }

    // Average confidence
    const avgConfidence = filteredResults.length > 0
      ? filteredResults.reduce((sum, r) => sum + r.confidence, 0) / filteredResults.length
      : 0;

    return {
      totalChecks,
      hallucinationsDetected,
      hallucinationRate,
      byType,
      byModel,
      averageConfidence: avgConfidence,
      periodStart: start,
      periodEnd: end,
      kpiCompliant: hallucinationRate < this.config.maxHallucinationRate,
    };
  }

  /**
   * Get recent hallucination results
   */
  getRecentResults(limit: number = 100): HallucinationResult[] {
    return [...this.results]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Add known entity for validation
   */
  addKnownEntity(entity: string): void {
    this.knownEntities.add(entity.toLowerCase());
  }

  /**
   * Add fact to database
   */
  addFact(key: string, value: string): void {
    this.factDatabase.set(key.toLowerCase(), value);
  }

  /**
   * Check for fabricated entities in output
   */
  private checkForFabricatedEntities(output: string): {
    fabricated: string[];
    score: number;
  } {
    const fabricated: string[] = [];

    // Extract potential entity names (capitalized phrases)
    const entityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
    const matches = output.match(entityPattern) || [];

    // Check against known entities (simplified check)
    // In production, this would use named entity recognition and knowledge bases
    for (const match of matches) {
      // Check if entity exists in known set or appears fabricated
      if (this.looksLikeFabricatedEntity(match)) {
        fabricated.push(match);
      }
    }

    const score = matches.length > 0 ? fabricated.length / matches.length : 0;

    return { fabricated, score };
  }

  /**
   * Heuristic check for fabricated entity names
   */
  private looksLikeFabricatedEntity(entity: string): boolean {
    // Check for common hallucination patterns
    const fabricationPatterns = [
      /^Dr\.\s+[A-Z][a-z]+\s+[A-Z][a-z]+stein$/i, // Made-up doctor names
      /^[A-Z][a-z]+\s+Institute\s+of\s+[A-Z]/i, // Fake institutes
      /^[A-Z][a-z]+\s+University\s+of\s+[A-Z]/i, // Fake universities
      /^The\s+[A-Z][a-z]+\s+Foundation$/i, // Fake foundations
    ];

    for (const pattern of fabricationPatterns) {
      if (pattern.test(entity)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check factual accuracy against ground truth
   */
  private checkFactualAccuracy(
    output: string,
    groundTruth: string[]
  ): { errors: string[]; score: number } {
    const errors: string[] = [];

    // Extract factual claims from output
    const claims = this.extractClaims(output);

    // Check each claim against ground truth
    for (const claim of claims) {
      let supported = false;
      for (const truth of groundTruth) {
        if (this.claimSupportedBySource(claim, truth)) {
          supported = true;
          break;
        }
      }
      if (!supported && this.isFactualClaim(claim)) {
        errors.push(claim);
      }
    }

    const score = claims.length > 0 ? errors.length / claims.length : 0;

    return { errors, score };
  }

  /**
   * Check logical consistency of output
   */
  private checkLogicalConsistency(output: string): {
    consistent: boolean;
    contradictions: string[];
    score: number;
  } {
    const contradictions: string[] = [];

    // Split into sentences
    const sentences = output.split(/[.!?]+/).filter(s => s.trim().length > 0);

    // Check for contradictory pairs
    for (let i = 0; i < sentences.length; i++) {
      for (let j = i + 1; j < sentences.length; j++) {
        if (this.areContradictory(sentences[i], sentences[j])) {
          contradictions.push(`"${sentences[i].trim()}" vs "${sentences[j].trim()}"`);
        }
      }
    }

    const score = sentences.length > 0 ? contradictions.length / sentences.length : 0;

    return {
      consistent: contradictions.length === 0,
      contradictions,
      score,
    };
  }

  /**
   * Check if output claims are supported by input context
   */
  private checkClaimSupport(output: string, context: string): SemanticCheck & { score: number } {
    const claims = this.extractClaims(output);
    const alignedClaims: string[] = [];
    const unsupportedClaims: string[] = [];

    for (const claim of claims) {
      if (this.claimSupportedBySource(claim, context)) {
        alignedClaims.push(claim);
      } else if (this.isFactualClaim(claim)) {
        unsupportedClaims.push(claim);
      }
    }

    const total = alignedClaims.length + unsupportedClaims.length;
    const similarity = total > 0 ? alignedClaims.length / total : 1;
    const score = total > 0 ? unsupportedClaims.length / total : 0;

    return { similarity, alignedClaims, unsupportedClaims: unsupportedClaims.slice(0, 5), score };
  }

  /**
   * Check for context drift between input and output
   */
  private checkContextDrift(
    context: string,
    output: string
  ): { drifted: boolean; reason: string; score: number } {
    // Extract key topics from context
    const contextTopics = this.extractTopics(context);
    const outputTopics = this.extractTopics(output);

    // Check overlap
    const contextSet = new Set(contextTopics);
    const overlap = outputTopics.filter(t => contextSet.has(t));

    const overlapRatio = outputTopics.length > 0
      ? overlap.length / outputTopics.length
      : 1;

    const drifted = overlapRatio < 0.3; // Less than 30% topic overlap
    const score = drifted ? 1 - overlapRatio : 0;

    return {
      drifted,
      reason: drifted
        ? `Only ${(overlapRatio * 100).toFixed(1)}% topic overlap with context`
        : '',
      score,
    };
  }

  /**
   * Check for numerical errors in output
   */
  private checkNumericalAccuracy(output: string): {
    errors: string[];
    score: number;
  } {
    const errors: string[] = [];

    // Extract calculations
    const calcPattern = /(\d+(?:\.\d+)?)\s*[+\-*/]\s*(\d+(?:\.\d+)?)\s*=\s*(\d+(?:\.\d+)?)/g;
    let match;

    while ((match = calcPattern.exec(output)) !== null) {
      const num1 = parseFloat(match[1]);
      const operator = match[0].match(/[+\-*/]/)?.[0];
      const num2 = parseFloat(match[2]);
      const result = parseFloat(match[3]);

      let expected: number;
      switch (operator) {
        case '+': expected = num1 + num2; break;
        case '-': expected = num1 - num2; break;
        case '*': expected = num1 * num2; break;
        case '/': expected = num2 !== 0 ? num1 / num2 : NaN; break;
        default: continue;
      }

      if (!isNaN(expected) && Math.abs(expected - result) > 0.001) {
        errors.push(`${num1} ${operator} ${num2} = ${result} (should be ${expected})`);
      }
    }

    // Check percentage claims
    const percentPattern = /(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)\s*(?:is|=)\s*(\d+(?:\.\d+)?)/gi;
    while ((match = percentPattern.exec(output)) !== null) {
      const percent = parseFloat(match[1]) / 100;
      const total = parseFloat(match[2]);
      const result = parseFloat(match[3]);
      const expected = percent * total;

      if (Math.abs(expected - result) > 0.01) {
        errors.push(`${match[1]}% of ${total} = ${result} (should be ${expected.toFixed(2)})`);
      }
    }

    const totalNumericalClaims = (output.match(/\d+/g) || []).length;
    const score = totalNumericalClaims > 0 ? errors.length / totalNumericalClaims : 0;

    return { errors, score };
  }

  /**
   * Extract claims from text
   */
  private extractClaims(text: string): string[] {
    // Split into sentences and filter for factual claims
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    return sentences.map(s => s.trim());
  }

  /**
   * Check if claim is supported by source text
   */
  private claimSupportedBySource(claim: string, source: string): boolean {
    // Simple keyword overlap check
    // In production, use semantic similarity via embeddings
    const claimWords = claim.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const sourceWords = new Set(source.toLowerCase().split(/\s+/));

    const matchCount = claimWords.filter(w => sourceWords.has(w)).length;
    const matchRatio = claimWords.length > 0 ? matchCount / claimWords.length : 0;

    return matchRatio > 0.5; // >50% keyword overlap
  }

  /**
   * Check if text is a factual claim vs opinion/question
   */
  private isFactualClaim(text: string): boolean {
    const factualPatterns = [
      /\b(is|are|was|were|has|have|had)\b/i,
      /\b(in \d{4}|since \d{4}|from \d{4})\b/i,
      /\b(according to|research shows|studies indicate)\b/i,
      /\d+(\.\d+)?%/,
      /\$[\d,]+/,
    ];

    return factualPatterns.some(p => p.test(text));
  }

  /**
   * Check if two sentences are contradictory
   */
  private areContradictory(sent1: string, sent2: string): boolean {
    // Simple negation check
    const s1 = sent1.toLowerCase();
    const s2 = sent2.toLowerCase();

    // Check for direct negation patterns
    const negationPairs = [
      ['is', "isn't"],
      ['is', 'is not'],
      ['are', "aren't"],
      ['are', 'are not'],
      ['can', "can't"],
      ['can', 'cannot'],
      ['will', "won't"],
      ['will', 'will not'],
      ['always', 'never'],
      ['all', 'none'],
    ];

    for (const [pos, neg] of negationPairs) {
      if (s1.includes(pos) && s2.includes(neg) || s1.includes(neg) && s2.includes(pos)) {
        // Check if they're about the same subject
        const subjectWords = s1.split(/\s+/).slice(0, 3).join(' ');
        if (s2.includes(subjectWords)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Extract key topics from text
   */
  private extractTopics(text: string): string[] {
    // Extract noun phrases and key terms
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4)
      .filter(w => !this.isStopWord(w));

    // Get unique topics
    return [...new Set(words)];
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'about', 'after', 'before', 'being', 'between', 'could', 'during',
      'every', 'first', 'found', 'great', 'going', 'having', 'never',
      'other', 'really', 'should', 'since', 'still', 'their', 'there',
      'these', 'thing', 'think', 'those', 'through', 'under', 'using',
      'where', 'which', 'while', 'would', 'years',
    ]);
    return stopWords.has(word);
  }

  /**
   * Initialize known entities database
   */
  private initializeKnownEntities(): void {
    // Add common entities
    const commonEntities = [
      'Google', 'Microsoft', 'Amazon', 'Apple', 'Meta', 'OpenAI', 'Anthropic',
      'New York', 'London', 'Paris', 'Tokyo', 'Berlin', 'San Francisco',
      'Harvard University', 'MIT', 'Stanford University', 'Oxford University',
    ];

    for (const entity of commonEntities) {
      this.knownEntities.add(entity.toLowerCase());
    }
  }

  /**
   * Clear old results (retention policy)
   */
  pruneResults(maxAgeDays: number = 30): number {
    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
    const originalCount = this.results.length;
    this.results = this.results.filter(r => r.timestamp > cutoff);
    return originalCount - this.results.length;
  }
}

/**
 * Default hallucination checker configuration
 */
export const defaultHallucinationConfig: HallucinationCheckerConfig = {
  maxHallucinationRate: 0.05, // 5% KPI target
  confidenceThreshold: 0.3,
  enableFactChecking: true,
  enableLogicChecking: true,
  enableEntityValidation: true,
  groundTruthSources: [],
};

/**
 * Global hallucination checker instance
 */
export const hallucinationChecker = new HallucinationChecker(defaultHallucinationConfig);

/**
 * Prometheus metrics format for hallucination detection
 */
export function getHallucinationMetrics(): string {
  const stats = hallucinationChecker.getStats();

  let metrics = '';

  metrics += `# HELP intelliflow_ai_hallucination_total Total hallucination checks performed\n`;
  metrics += `# TYPE intelliflow_ai_hallucination_total counter\n`;
  metrics += `intelliflow_ai_hallucination_total ${stats.totalChecks}\n`;

  metrics += `# HELP intelliflow_ai_hallucination_detected Total hallucinations detected\n`;
  metrics += `# TYPE intelliflow_ai_hallucination_detected counter\n`;
  metrics += `intelliflow_ai_hallucination_detected ${stats.hallucinationsDetected}\n`;

  metrics += `# HELP intelliflow_ai_hallucination_rate Current hallucination rate (0-1)\n`;
  metrics += `# TYPE intelliflow_ai_hallucination_rate gauge\n`;
  metrics += `intelliflow_ai_hallucination_rate ${stats.hallucinationRate.toFixed(4)}\n`;

  metrics += `# HELP intelliflow_ai_hallucination_kpi_compliant Whether rate is below 5% target (1=yes, 0=no)\n`;
  metrics += `# TYPE intelliflow_ai_hallucination_kpi_compliant gauge\n`;
  metrics += `intelliflow_ai_hallucination_kpi_compliant ${stats.kpiCompliant ? 1 : 0}\n`;

  // By type
  metrics += `# HELP intelliflow_ai_hallucination_by_type Hallucinations by type\n`;
  metrics += `# TYPE intelliflow_ai_hallucination_by_type counter\n`;
  for (const [type, count] of Object.entries(stats.byType)) {
    metrics += `intelliflow_ai_hallucination_by_type{type="${type}"} ${count}\n`;
  }

  // By model
  metrics += `# HELP intelliflow_ai_hallucination_by_model Hallucination rate by model\n`;
  metrics += `# TYPE intelliflow_ai_hallucination_by_model gauge\n`;
  for (const [model, data] of Object.entries(stats.byModel)) {
    metrics += `intelliflow_ai_hallucination_by_model{model="${model}"} ${data.rate.toFixed(4)}\n`;
  }

  return metrics;
}
