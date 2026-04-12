// Compliance Dashboard Types
// Task: IFC-100 - Compliance Dashboard Enhancement

// ============================================
// Compliance Timeline Types
// ============================================

export type ComplianceEventType = 'audit' | 'certification' | 'review' | 'assessment' | 'renewal';
export type ComplianceEventStatus = 'scheduled' | 'completed' | 'overdue' | 'cancelled';

export interface ComplianceEvent {
  id: string;
  title: string;
  date: string; // ISO 8601
  type: ComplianceEventType;
  standard: string; // e.g., 'ISO 27001', 'GDPR', 'SOC 2'
  status: ComplianceEventStatus;
  description?: string;
}

export interface ComplianceTimelineResponse {
  events: ComplianceEvent[];
  currentMonth: string;
  upcomingCount: number;
}

// ============================================
// Risk Heat Map Types
// ============================================

export type RiskProbability = 'low' | 'medium' | 'high';
export type RiskImpact = 'low' | 'medium' | 'high';
export type RiskStatus = 'accepted' | 'mitigated' | 'requires_action';

export interface Risk {
  id: string;
  title: string;
  probability: RiskProbability;
  impact: RiskImpact;
  status: RiskStatus;
  category: string;
  owner?: string;
  mitigationPlan?: string;
  dueDate?: string;
}

export interface RiskSummary {
  total: number;
  byStatus: Record<RiskStatus, number>;
  byProbability: Record<RiskProbability, number>;
  byImpact: Record<RiskImpact, number>;
}

export interface RiskHeatMapResponse {
  risks: Risk[];
  summary: RiskSummary;
  lastUpdated: string;
}

// ============================================
// Compliance Detail Types (for Drilldowns)
// ============================================

export type ControlStatus = 'passed' | 'failed' | 'not_applicable' | 'in_progress';

export interface ComplianceControl {
  id: string;
  name: string;
  status: ControlStatus;
  lastAssessed: string;
  evidence?: string;
  notes?: string;
}

export interface HistoricalScore {
  date: string;
  score: number;
}

export interface RecentChange {
  date: string;
  action: string;
  user: string;
}

export interface ComplianceDetailResponse {
  standardId: string;
  standardName: string;
  score: number;
  trend: number;
  status: 'compliant' | 'critical' | 'attention';
  controls: ComplianceControl[];
  historicalScores: HistoricalScore[];
  recentChanges: RecentChange[];
  nextAuditDate?: string;
  certificationExpiry?: string;
}

// ============================================
// Export Data Types
// ============================================

export interface ComplianceStandardSummary {
  name: string;
  score: number;
  status: string;
  controlsPassed: number;
  controlsTotal: number;
}

export interface ComplianceExportData {
  generatedAt: string;
  overallScore: number;
  standards: ComplianceStandardSummary[];
  risks: Risk[];
  upcomingEvents: ComplianceEvent[];
}

// ============================================
// API Response Wrapper
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
