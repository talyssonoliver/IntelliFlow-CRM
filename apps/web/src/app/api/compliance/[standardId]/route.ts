import { NextRequest, NextResponse } from 'next/server';
import type { ComplianceDetailResponse, ComplianceControl, HistoricalScore, RecentChange } from '../types';

// Mock data for compliance standards
// In production, this would come from a database
const COMPLIANCE_STANDARDS: Record<string, Omit<ComplianceDetailResponse, 'standardId'>> = {
  'iso-27001': {
    standardName: 'ISO 27001',
    score: 92,
    trend: 2.4,
    status: 'compliant',
    controls: [
      { id: 'A.5.1', name: 'Policies for information security', status: 'passed', lastAssessed: '2025-12-15' },
      { id: 'A.6.1', name: 'Internal organization', status: 'passed', lastAssessed: '2025-12-15' },
      { id: 'A.6.2', name: 'Mobile devices and teleworking', status: 'passed', lastAssessed: '2025-12-15' },
      { id: 'A.7.1', name: 'Prior to employment', status: 'passed', lastAssessed: '2025-12-15' },
      { id: 'A.7.2', name: 'During employment', status: 'passed', lastAssessed: '2025-12-15' },
      { id: 'A.8.1', name: 'Asset management - Responsibility', status: 'passed', lastAssessed: '2025-12-15' },
      { id: 'A.8.2', name: 'Information classification', status: 'passed', lastAssessed: '2025-12-15' },
      { id: 'A.9.1', name: 'Access control policy', status: 'passed', lastAssessed: '2025-12-15' },
      { id: 'A.9.2', name: 'User access management', status: 'in_progress', lastAssessed: '2025-12-15', notes: 'MFA rollout in progress' },
      { id: 'A.10.1', name: 'Cryptographic controls', status: 'passed', lastAssessed: '2025-12-15' },
      { id: 'A.11.1', name: 'Physical security', status: 'not_applicable', lastAssessed: '2025-12-15', notes: 'Cloud-only infrastructure' },
      { id: 'A.12.1', name: 'Operational procedures', status: 'passed', lastAssessed: '2025-12-15' },
      { id: 'A.13.1', name: 'Network security', status: 'passed', lastAssessed: '2025-12-15' },
      { id: 'A.14.1', name: 'Security in development', status: 'passed', lastAssessed: '2025-12-15' },
    ],
    historicalScores: [
      { date: '2025-07-01', score: 85 },
      { date: '2025-08-01', score: 87 },
      { date: '2025-09-01', score: 88 },
      { date: '2025-10-01', score: 89 },
      { date: '2025-11-01', score: 90 },
      { date: '2025-12-01', score: 92 },
    ],
    recentChanges: [
      { date: '2025-12-15', action: 'Passed surveillance audit', user: 'External Auditor' },
      { date: '2025-12-10', action: 'Updated access control policy', user: 'Security Team' },
      { date: '2025-12-05', action: 'Completed MFA phase 1 rollout', user: 'IT Team' },
    ],
    nextAuditDate: '2026-03-01',
    certificationExpiry: '2027-03-01',
  },
  'iso-42001': {
    standardName: 'ISO 42001',
    score: 45,
    trend: -5.1,
    status: 'critical',
    controls: [
      { id: '4.1', name: 'Understanding the organization', status: 'passed', lastAssessed: '2025-12-01' },
      { id: '4.2', name: 'Understanding stakeholder needs', status: 'in_progress', lastAssessed: '2025-12-01' },
      { id: '5.1', name: 'Leadership and commitment', status: 'passed', lastAssessed: '2025-12-01' },
      { id: '5.2', name: 'AI policy', status: 'failed', lastAssessed: '2025-12-01', notes: 'Policy not yet formalized' },
      { id: '6.1', name: 'Risk assessment', status: 'in_progress', lastAssessed: '2025-12-01' },
      { id: '6.2', name: 'AI objectives', status: 'passed', lastAssessed: '2025-12-01' },
      { id: '7.1', name: 'Resources', status: 'passed', lastAssessed: '2025-12-01' },
      { id: '7.2', name: 'Competence', status: 'in_progress', lastAssessed: '2025-12-01' },
      { id: '8.1', name: 'Operational planning', status: 'failed', lastAssessed: '2025-12-01' },
      { id: '8.2', name: 'AI system impact assessment', status: 'failed', lastAssessed: '2025-12-01' },
      { id: '9.1', name: 'Monitoring and measurement', status: 'in_progress', lastAssessed: '2025-12-01' },
      { id: '10.1', name: 'Continual improvement', status: 'not_applicable', lastAssessed: '2025-12-01' },
    ],
    historicalScores: [
      { date: '2025-07-01', score: 30 },
      { date: '2025-08-01', score: 35 },
      { date: '2025-09-01', score: 42 },
      { date: '2025-10-01', score: 48 },
      { date: '2025-11-01', score: 50 },
      { date: '2025-12-01', score: 45 },
    ],
    recentChanges: [
      { date: '2025-12-01', action: 'Identified bias in lead scoring model', user: 'AI Team' },
      { date: '2025-11-20', action: 'Started AI governance framework', user: 'Compliance Team' },
      { date: '2025-11-15', action: 'Initial gap assessment completed', user: 'External Consultant' },
    ],
    nextAuditDate: '2026-02-01',
  },
  'iso-14001': {
    standardName: 'ISO 14001',
    score: 78,
    trend: 0,
    status: 'attention',
    controls: [
      { id: '4.1', name: 'Context of organization', status: 'passed', lastAssessed: '2025-10-15' },
      { id: '4.2', name: 'Interested parties', status: 'passed', lastAssessed: '2025-10-15' },
      { id: '5.1', name: 'Leadership', status: 'passed', lastAssessed: '2025-10-15' },
      { id: '6.1', name: 'Environmental aspects', status: 'in_progress', lastAssessed: '2025-10-15' },
      { id: '6.2', name: 'Compliance obligations', status: 'passed', lastAssessed: '2025-10-15' },
      { id: '7.1', name: 'Resources', status: 'passed', lastAssessed: '2025-10-15' },
      { id: '8.1', name: 'Operational control', status: 'in_progress', lastAssessed: '2025-10-15' },
      { id: '9.1', name: 'Monitoring', status: 'passed', lastAssessed: '2025-10-15' },
    ],
    historicalScores: [
      { date: '2025-07-01', score: 78 },
      { date: '2025-08-01', score: 78 },
      { date: '2025-09-01', score: 79 },
      { date: '2025-10-01', score: 78 },
      { date: '2025-11-01', score: 78 },
      { date: '2025-12-01', score: 78 },
    ],
    recentChanges: [
      { date: '2025-10-15', action: 'Certification renewed', user: 'External Auditor' },
      { date: '2025-10-01', action: 'Updated sustainability policy', user: 'Operations Team' },
    ],
    nextAuditDate: '2026-04-01',
    certificationExpiry: '2028-10-15',
  },
  'gdpr': {
    standardName: 'GDPR',
    score: 98,
    trend: 0.5,
    status: 'compliant',
    controls: [
      { id: 'Art.5', name: 'Principles of processing', status: 'passed', lastAssessed: '2025-12-01' },
      { id: 'Art.6', name: 'Lawful basis', status: 'passed', lastAssessed: '2025-12-01' },
      { id: 'Art.7', name: 'Consent', status: 'passed', lastAssessed: '2025-12-01' },
      { id: 'Art.12', name: 'Transparent communication', status: 'passed', lastAssessed: '2025-12-01' },
      { id: 'Art.13', name: 'Information to be provided', status: 'passed', lastAssessed: '2025-12-01' },
      { id: 'Art.15', name: 'Right of access', status: 'passed', lastAssessed: '2025-12-01' },
      { id: 'Art.17', name: 'Right to erasure', status: 'passed', lastAssessed: '2025-12-01' },
      { id: 'Art.20', name: 'Data portability', status: 'passed', lastAssessed: '2025-12-01' },
      { id: 'Art.25', name: 'Privacy by design', status: 'passed', lastAssessed: '2025-12-01' },
      { id: 'Art.32', name: 'Security of processing', status: 'passed', lastAssessed: '2025-12-01' },
      { id: 'Art.33', name: 'Breach notification', status: 'passed', lastAssessed: '2025-12-01' },
      { id: 'Art.35', name: 'DPIA', status: 'passed', lastAssessed: '2025-12-01' },
    ],
    historicalScores: [
      { date: '2025-07-01', score: 95 },
      { date: '2025-08-01', score: 96 },
      { date: '2025-09-01', score: 97 },
      { date: '2025-10-01', score: 97 },
      { date: '2025-11-01', score: 98 },
      { date: '2025-12-01', score: 98 },
    ],
    recentChanges: [
      { date: '2025-12-01', action: 'Quarterly compliance review passed', user: 'Legal Team' },
      { date: '2025-11-15', action: 'Updated privacy policy', user: 'Legal Team' },
      { date: '2025-11-01', action: 'DPIA completed for new features', user: 'DPO' },
    ],
    nextAuditDate: '2026-01-15',
  },
  'soc-2': {
    standardName: 'SOC 2',
    score: 89,
    trend: 1.2,
    status: 'compliant',
    controls: [
      { id: 'CC1.1', name: 'COSO Principle 1', status: 'passed', lastAssessed: '2025-11-15' },
      { id: 'CC1.2', name: 'COSO Principle 2', status: 'passed', lastAssessed: '2025-11-15' },
      { id: 'CC2.1', name: 'Communication objectives', status: 'passed', lastAssessed: '2025-11-15' },
      { id: 'CC3.1', name: 'Risk assessment', status: 'passed', lastAssessed: '2025-11-15' },
      { id: 'CC4.1', name: 'Monitoring activities', status: 'in_progress', lastAssessed: '2025-11-15' },
      { id: 'CC5.1', name: 'Control activities', status: 'passed', lastAssessed: '2025-11-15' },
      { id: 'CC6.1', name: 'Logical access', status: 'passed', lastAssessed: '2025-11-15' },
      { id: 'CC7.1', name: 'System operations', status: 'passed', lastAssessed: '2025-11-15' },
      { id: 'CC8.1', name: 'Change management', status: 'passed', lastAssessed: '2025-11-15' },
      { id: 'CC9.1', name: 'Risk mitigation', status: 'in_progress', lastAssessed: '2025-11-15' },
    ],
    historicalScores: [
      { date: '2025-07-01', score: 82 },
      { date: '2025-08-01', score: 84 },
      { date: '2025-09-01', score: 86 },
      { date: '2025-10-01', score: 87 },
      { date: '2025-11-01', score: 88 },
      { date: '2025-12-01', score: 89 },
    ],
    recentChanges: [
      { date: '2025-11-15', action: 'Readiness assessment completed', user: 'External Auditor' },
      { date: '2025-11-01', action: 'Updated control documentation', user: 'Compliance Team' },
    ],
    nextAuditDate: '2026-02-15',
  },
  'owasp': {
    standardName: 'OWASP Top 10',
    score: 96,
    trend: 3.0,
    status: 'compliant',
    controls: [
      { id: 'A01', name: 'Broken Access Control', status: 'passed', lastAssessed: '2025-11-01' },
      { id: 'A02', name: 'Cryptographic Failures', status: 'passed', lastAssessed: '2025-11-01' },
      { id: 'A03', name: 'Injection', status: 'passed', lastAssessed: '2025-11-01' },
      { id: 'A04', name: 'Insecure Design', status: 'passed', lastAssessed: '2025-11-01' },
      { id: 'A05', name: 'Security Misconfiguration', status: 'passed', lastAssessed: '2025-11-01' },
      { id: 'A06', name: 'Vulnerable Components', status: 'in_progress', lastAssessed: '2025-11-01', notes: 'Ongoing dependency updates' },
      { id: 'A07', name: 'Auth Failures', status: 'passed', lastAssessed: '2025-11-01' },
      { id: 'A08', name: 'Data Integrity Failures', status: 'passed', lastAssessed: '2025-11-01' },
      { id: 'A09', name: 'Logging Failures', status: 'passed', lastAssessed: '2025-11-01' },
      { id: 'A10', name: 'SSRF', status: 'passed', lastAssessed: '2025-11-01' },
    ],
    historicalScores: [
      { date: '2025-07-01', score: 88 },
      { date: '2025-08-01', score: 90 },
      { date: '2025-09-01', score: 92 },
      { date: '2025-10-01', score: 94 },
      { date: '2025-11-01', score: 93 },
      { date: '2025-12-01', score: 96 },
    ],
    recentChanges: [
      { date: '2025-11-01', action: 'Monthly vulnerability scan completed', user: 'Security Team' },
      { date: '2025-10-15', action: 'Remediated 3 medium findings', user: 'Engineering Team' },
    ],
    nextAuditDate: '2026-03-20',
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ standardId: string }> }
) {
  try {
    const { standardId } = await params;
    const standardData = COMPLIANCE_STANDARDS[standardId];

    if (!standardData) {
      return NextResponse.json(
        { success: false, error: `Unknown standard: ${standardId}` },
        { status: 404 }
      );
    }

    const response: ComplianceDetailResponse = {
      standardId,
      ...standardData,
    };

    return NextResponse.json(
      { success: true, data: response },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Compliance detail API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load compliance details' },
      { status: 500 }
    );
  }
}
