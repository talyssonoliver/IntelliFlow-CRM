/**
 * AI Mock Data Fixtures for IntelliFlow CRM E2E Tests (IFC-026)
 *
 * Provides deterministic test data for AI features:
 * - Lead scores with confidence levels
 * - Agent actions with all statuses
 * - AI predictions
 *
 * @see IFC-026 - Playwright E2E Testing for AI Features
 */

export interface MockLeadScore {
  leadId: string;
  score: number;
  confidence: number;
  factors: Array<{ name: string; impact: 'positive' | 'negative'; weight: number }>;
  modelVersion: string;
  scoredAt: Date;
}

export interface MockAgentAction {
  id: string;
  actionType: 'lead_update' | 'email_draft' | 'deal_stage_change' | 'task_create';
  entityId: string;
  entityType: 'lead' | 'contact' | 'deal' | 'task';
  entityName: string;
  previousState: Record<string, unknown>;
  proposedState: Record<string, unknown>;
  description: string;
  aiReasoning: string;
  confidenceScore: number;
  status: 'pending' | 'approved' | 'rejected' | 'rolled_back' | 'expired';
  agentName: string;
  createdAt: Date;
  expiresAt?: Date;
}

export interface MockPrediction {
  entityId: string;
  entityType: string;
  prediction: string;
  probability: number;
  confidence: number;
  factors: string[];
}

export interface MockAIData {
  leadScores?: MockLeadScore[];
  agentActions?: MockAgentAction[];
  predictions?: MockPrediction[];
}

/**
 * Confidence threshold constants matching domain rules
 * Note: Agent approvals page uses 0-100 integer scale
 */
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 80,
  MEDIUM: 60,
  LOW: 0,
} as const;

/**
 * Mock lead scores covering all confidence levels including boundary values
 */
export const mockLeadScores: MockLeadScore[] = [
  {
    leadId: 'lead-001',
    score: 92,
    confidence: 0.95,
    factors: [
      { name: 'Company Size', impact: 'positive', weight: 0.3 },
      { name: 'Email Engagement', impact: 'positive', weight: 0.25 },
      { name: 'Website Visits', impact: 'positive', weight: 0.2 },
    ],
    modelVersion: 'v2.1.0',
    scoredAt: new Date('2026-01-20T10:30:00Z'),
  },
  {
    leadId: 'lead-002',
    score: 75,
    confidence: 0.82,
    factors: [
      { name: 'Industry Match', impact: 'positive', weight: 0.35 },
      { name: 'Budget Unknown', impact: 'negative', weight: 0.15 },
    ],
    modelVersion: 'v2.1.0',
    scoredAt: new Date('2026-01-19T14:15:00Z'),
  },
  {
    leadId: 'lead-003',
    score: 45,
    confidence: 0.65,
    factors: [
      { name: 'Low Engagement', impact: 'negative', weight: 0.4 },
      { name: 'Small Company', impact: 'negative', weight: 0.2 },
    ],
    modelVersion: 'v2.1.0',
    scoredAt: new Date('2026-01-18T09:00:00Z'),
  },
  // Boundary cases for threshold verification
  {
    leadId: 'lead-boundary-high',
    score: 80,
    confidence: 0.8,
    factors: [{ name: 'Boundary Test', impact: 'positive', weight: 0.5 }],
    modelVersion: 'v2.1.0',
    scoredAt: new Date('2026-01-20T12:00:00Z'),
  },
  {
    leadId: 'lead-boundary-high-minus',
    score: 79,
    confidence: 0.79,
    factors: [{ name: 'Boundary Test', impact: 'positive', weight: 0.5 }],
    modelVersion: 'v2.1.0',
    scoredAt: new Date('2026-01-20T12:00:00Z'),
  },
  {
    leadId: 'lead-boundary-medium',
    score: 60,
    confidence: 0.6,
    factors: [{ name: 'Boundary Test', impact: 'positive', weight: 0.5 }],
    modelVersion: 'v2.1.0',
    scoredAt: new Date('2026-01-20T12:00:00Z'),
  },
  {
    leadId: 'lead-boundary-medium-minus',
    score: 59,
    confidence: 0.59,
    factors: [{ name: 'Boundary Test', impact: 'negative', weight: 0.5 }],
    modelVersion: 'v2.1.0',
    scoredAt: new Date('2026-01-20T12:00:00Z'),
  },
];

/**
 * Mock agent actions covering all statuses
 */
export const mockAgentActions: MockAgentAction[] = [
  {
    id: 'action-pending-001',
    actionType: 'lead_update',
    entityId: 'lead-001',
    entityType: 'lead',
    entityName: 'Acme Corp',
    previousState: { status: 'new', score: 75 },
    proposedState: { status: 'qualified', score: 92 },
    description: 'Update lead status based on engagement analysis',
    aiReasoning:
      'Lead has shown consistent engagement over the past 2 weeks with 5 email opens and 3 website visits. Company size (500+ employees) matches our ICP.',
    confidenceScore: 85,
    status: 'pending',
    agentName: 'Lead Scoring Agent',
    createdAt: new Date('2026-01-22T08:00:00Z'),
    expiresAt: new Date('2026-01-22T20:00:00Z'),
  },
  {
    id: 'action-pending-002',
    actionType: 'email_draft',
    entityId: 'contact-001',
    entityType: 'contact',
    entityName: 'Jane Smith',
    previousState: {},
    proposedState: { subject: 'Follow-up: Your Demo Request', body: '...' },
    description: 'Draft follow-up email after demo request',
    aiReasoning:
      'Contact requested a demo 3 days ago. Optimal follow-up window is 2-4 days based on historical data.',
    confidenceScore: 78,
    status: 'pending',
    agentName: 'Outreach Agent',
    createdAt: new Date('2026-01-21T15:30:00Z'),
    expiresAt: new Date('2026-01-23T15:30:00Z'),
  },
  {
    id: 'action-approved-001',
    actionType: 'deal_stage_change',
    entityId: 'deal-001',
    entityType: 'deal',
    entityName: 'Enterprise Deal - TechCorp',
    previousState: { stage: 'proposal' },
    proposedState: { stage: 'negotiation' },
    description: 'Move deal to negotiation stage',
    aiReasoning: 'Proposal was sent 5 days ago with positive verbal feedback. Time to advance.',
    confidenceScore: 92,
    status: 'approved',
    agentName: 'Pipeline Intelligence Agent',
    createdAt: new Date('2026-01-20T10:00:00Z'),
  },
  {
    id: 'action-rejected-001',
    actionType: 'task_create',
    entityId: 'lead-002',
    entityType: 'lead',
    entityName: 'Beta Industries',
    previousState: {},
    proposedState: { task: 'Schedule discovery call' },
    description: 'Create follow-up task for lead',
    aiReasoning: 'Lead has been inactive for 7 days. Recommend scheduling a discovery call.',
    confidenceScore: 65,
    status: 'rejected',
    agentName: 'Task Automation Agent',
    createdAt: new Date('2026-01-19T11:00:00Z'),
  },
  {
    id: 'action-rolledback-001',
    actionType: 'lead_update',
    entityId: 'lead-004',
    entityType: 'lead',
    entityName: 'Gamma Solutions',
    previousState: { status: 'qualified' },
    proposedState: { status: 'unqualified' },
    description: 'Disqualify lead based on budget constraints',
    aiReasoning: 'Lead indicated budget is below our minimum threshold.',
    confidenceScore: 88,
    status: 'rolled_back',
    agentName: 'Lead Scoring Agent',
    createdAt: new Date('2026-01-18T09:00:00Z'),
  },
  {
    id: 'action-expired-001',
    actionType: 'email_draft',
    entityId: 'contact-002',
    entityType: 'contact',
    entityName: 'Bob Johnson',
    previousState: {},
    proposedState: { subject: 'Quick question', body: '...' },
    description: 'Send personalized outreach',
    aiReasoning: 'Contact profile matches our success patterns.',
    confidenceScore: 72,
    status: 'expired',
    agentName: 'Outreach Agent',
    createdAt: new Date('2026-01-15T10:00:00Z'),
    expiresAt: new Date('2026-01-16T10:00:00Z'),
  },
];

/**
 * Mock predictions for deals and leads
 */
export const mockPredictions: MockPrediction[] = [
  {
    entityId: 'deal-001',
    entityType: 'deal',
    prediction: 'Will close within 30 days',
    probability: 0.78,
    confidence: 0.85,
    factors: ['Strong engagement', 'Budget confirmed', 'Decision maker involved'],
  },
  {
    entityId: 'lead-001',
    entityType: 'lead',
    prediction: 'High likelihood to convert',
    probability: 0.92,
    confidence: 0.88,
    factors: ['ICP match', 'Active engagement', 'Enterprise company'],
  },
];

/**
 * Factory function to create custom lead scores
 */
export function createMockLeadScore(overrides?: Partial<MockLeadScore>): MockLeadScore {
  return {
    leadId: `lead-${Date.now()}`,
    score: 75,
    confidence: 0.8,
    factors: [{ name: 'Test Factor', impact: 'positive', weight: 0.5 }],
    modelVersion: 'v2.1.0',
    scoredAt: new Date(),
    ...overrides,
  };
}

/**
 * Factory function to create custom agent actions
 */
export function createMockAgentAction(overrides?: Partial<MockAgentAction>): MockAgentAction {
  return {
    id: `action-${Date.now()}`,
    actionType: 'lead_update',
    entityId: 'lead-001',
    entityType: 'lead',
    entityName: 'Test Entity',
    previousState: {},
    proposedState: {},
    description: 'Test action',
    aiReasoning: 'Test reasoning for AI action',
    confidenceScore: 80,
    status: 'pending',
    agentName: 'Test Agent',
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Get confidence level based on score (0-100 scale)
 */
export function getConfidenceLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= CONFIDENCE_THRESHOLDS.HIGH) return 'high';
  if (score >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'medium';
  return 'low';
}

/**
 * Complete mock data set
 */
export const mockAIData: MockAIData = {
  leadScores: mockLeadScores,
  agentActions: mockAgentActions,
  predictions: mockPredictions,
};
