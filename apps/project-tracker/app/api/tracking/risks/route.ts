import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import {
  type Risk,
  type RiskStatus,
  type RiskAuditEntry,
  type RiskSummary,
  isValidTransition,
  normalizeStatus,
  sanitizeCSVField,
  AddRiskSchema,
  EditRiskSchema,
} from '../../../../lib/risk-domain';

const ARTIFACTS_DIR = path.join(process.cwd(), '..', '..', 'artifacts');
const RISK_REGISTER_PATH = path.join(ARTIFACTS_DIR, 'reports', 'risk-register.csv');
const AUDIT_TRAIL_PATH = path.join(ARTIFACTS_DIR, 'reports', 'risk-register-history.json');

export const dynamic = 'force-dynamic';

const CSV_HEADERS = [
  'Risk ID',
  'Category',
  'Description',
  'Likelihood (1-5)',
  'Impact (1-5)',
  'Score',
  'Mitigation Strategy',
  'Owner',
  'Status',
  'Review Date',
  'Escalation Path',
  'Evidence',
  'Notes',
];

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function escapeCSVValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function parseRiskRegister(): Promise<{ risks: Risk[]; lastUpdated: string | null }> {
  try {
    const content = await fs.readFile(RISK_REGISTER_PATH, 'utf-8');
    const stats = await fs.stat(RISK_REGISTER_PATH);
    const lines = content.split('\n').filter((line) => line.trim());

    if (lines.length < 2) {
      return { risks: [], lastUpdated: stats.mtime.toISOString() };
    }

    const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase());
    const risks: Risk[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < 3) continue;

      const firstValue = values[0]?.trim() || '';
      if (!firstValue.startsWith('RISK-')) continue;

      const getValue = (key: string): string => {
        const idx = headers.findIndex((h) => h.includes(key));
        return idx >= 0 ? values[idx] || '' : '';
      };

      const impact = parseInt(getValue('impact')) || 3;
      const likelihood = parseInt(getValue('likelihood')) || 3;
      const score = parseInt(getValue('score')) || impact * likelihood;
      const rawStatus = getValue('status') || 'Open';

      risks.push({
        id: getValue('id') || `RISK-${i}`,
        category: getValue('category') || 'General',
        description: getValue('description') || values[1] || '',
        impact,
        likelihood,
        score,
        status: normalizeStatus(rawStatus),
        owner: getValue('owner') || 'Unassigned',
        mitigation: getValue('mitigation') || '',
        lastReviewed:
          getValue('reviewed') || getValue('date') || new Date().toISOString().split('T')[0],
        escalationPath: getValue('escalation') || '',
        evidence: getValue('evidence') || '',
        notes: getValue('notes') || '',
        reviewDate:
          getValue('review date') || getValue('date') || new Date().toISOString().split('T')[0],
      });
    }

    return { risks, lastUpdated: stats.mtime.toISOString() };
  } catch (error) {
    console.error('Error parsing risk register:', error);
    return { risks: [], lastUpdated: null };
  }
}

function calculateSummary(risks: Risk[]): RiskSummary {
  return {
    total: risks.length,
    open: risks.filter((r) => r.status === 'Open').length,
    mitigated: risks.filter((r) => r.status === 'Mitigated').length,
    monitoring: risks.filter((r) => r.status === 'Monitoring').length,
    closed: risks.filter((r) => r.status === 'Closed').length,
    inProgress: risks.filter((r) => r.status === 'In Progress').length,
    accepted: risks.filter((r) => r.status === 'Accepted').length,
    highRisk: risks.filter((r) => r.score >= 15).length,
    mediumRisk: risks.filter((r) => r.score >= 6 && r.score < 15).length,
    lowRisk: risks.filter((r) => r.score < 6).length,
  };
}

async function appendAuditEntry(entry: RiskAuditEntry): Promise<void> {
  let entries: RiskAuditEntry[] = [];
  try {
    const content = await fs.readFile(AUDIT_TRAIL_PATH, 'utf-8');
    entries = JSON.parse(content);
  } catch {
    // File doesn't exist yet
  }
  entries.push(entry);
  await fs.writeFile(AUDIT_TRAIL_PATH, JSON.stringify(entries, null, 2));
}

function riskToCSVLine(risk: Risk): string {
  return [
    escapeCSVValue(risk.id),
    escapeCSVValue(sanitizeCSVField(risk.category)),
    escapeCSVValue(sanitizeCSVField(risk.description)),
    String(risk.likelihood),
    String(risk.impact),
    String(risk.score),
    escapeCSVValue(sanitizeCSVField(risk.mitigation)),
    escapeCSVValue(sanitizeCSVField(risk.owner)),
    escapeCSVValue(risk.status),
    escapeCSVValue(risk.reviewDate),
    escapeCSVValue(sanitizeCSVField(risk.escalationPath)),
    escapeCSVValue(sanitizeCSVField(risk.evidence)),
    escapeCSVValue(sanitizeCSVField(risk.notes)),
  ].join(',');
}

export async function GET() {
  try {
    const { risks, lastUpdated } = await parseRiskRegister();
    const summary = calculateSummary(risks);

    return NextResponse.json({
      status: 'ok',
      risks,
      summary,
      lastUpdated,
    });
  } catch (error) {
    console.error('Error reading risk register:', error);
    return NextResponse.json({ status: 'error', message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'add') {
      const parseResult = AddRiskSchema.safeParse(body.risk);
      if (!parseResult.success) {
        return NextResponse.json(
          { status: 'error', message: 'Validation failed', errors: parseResult.error.issues },
          { status: 400 }
        );
      }

      const validatedRisk = parseResult.data;

      // Read current content
      let content = '';
      try {
        content = await fs.readFile(RISK_REGISTER_PATH, 'utf-8');
      } catch {
        // File doesn't exist, create new
      }

      // Generate new ID
      const { risks } = await parseRiskRegister();
      const maxId = risks.reduce((max, r) => {
        const match = r.id.match(/RISK-(\d+)/);
        return match ? Math.max(max, parseInt(match[1])) : max;
      }, 0);
      const newId = `RISK-${String(maxId + 1).padStart(3, '0')}`;
      const score = validatedRisk.impact * validatedRisk.likelihood;

      const newRisk: Risk = {
        id: newId,
        category: sanitizeCSVField(validatedRisk.category),
        description: sanitizeCSVField(validatedRisk.description),
        impact: validatedRisk.impact,
        likelihood: validatedRisk.likelihood,
        score,
        status: 'Open',
        owner: sanitizeCSVField(validatedRisk.owner),
        mitigation: sanitizeCSVField(validatedRisk.mitigation),
        lastReviewed: new Date().toISOString().split('T')[0],
        escalationPath: '',
        evidence: '',
        notes: '',
        reviewDate: new Date().toISOString().split('T')[0],
      };

      const newLine = riskToCSVLine(newRisk);
      const headerLine = CSV_HEADERS.join(',');
      const newContent = content.trim()
        ? `${content.trim()}\n${newLine}`
        : `${headerLine}\n${newLine}`;

      await fs.writeFile(RISK_REGISTER_PATH, newContent);

      // Audit trail
      await appendAuditEntry({
        riskId: newId,
        action: 'add',
        newStatus: 'Open',
        newScore: score,
        changedAt: new Date().toISOString(),
      });

      return NextResponse.json({
        status: 'ok',
        message: 'Risk added',
        riskId: newId,
      });
    }

    if (action === 'edit') {
      const parseResult = EditRiskSchema.safeParse({
        riskId: body.riskId,
        updates: body.updates,
      });
      if (!parseResult.success) {
        return NextResponse.json(
          { status: 'error', message: 'Validation failed', errors: parseResult.error.issues },
          { status: 400 }
        );
      }

      const { riskId, updates } = parseResult.data;

      // Parse current risks
      const { risks } = await parseRiskRegister();
      const riskIndex = risks.findIndex((r) => r.id === riskId);
      if (riskIndex === -1) {
        return NextResponse.json(
          { status: 'error', message: `Risk ${riskId} not found` },
          { status: 404 }
        );
      }

      const currentRisk = risks[riskIndex];

      // Validate status transition if status is being changed
      if (updates.status && updates.status !== currentRisk.status) {
        if (!isValidTransition(currentRisk.status, updates.status as RiskStatus)) {
          return NextResponse.json(
            {
              status: 'error',
              message: `Invalid status transition: ${currentRisk.status} → ${updates.status}`,
            },
            { status: 400 }
          );
        }
      }

      // Build audit entry
      const auditEntry: RiskAuditEntry = {
        riskId,
        action: 'edit',
        changedAt: new Date().toISOString(),
      };
      if (updates.status) {
        auditEntry.previousStatus = currentRisk.status;
        auditEntry.newStatus = updates.status as RiskStatus;
      }

      // Apply updates
      const updatedRisk: Risk = { ...currentRisk };
      if (updates.category) updatedRisk.category = sanitizeCSVField(updates.category);
      if (updates.description) updatedRisk.description = sanitizeCSVField(updates.description);
      if (updates.impact !== undefined) updatedRisk.impact = updates.impact;
      if (updates.likelihood !== undefined) updatedRisk.likelihood = updates.likelihood;
      if (updates.impact !== undefined || updates.likelihood !== undefined) {
        updatedRisk.score = updatedRisk.impact * updatedRisk.likelihood;
        auditEntry.previousScore = currentRisk.score;
        auditEntry.newScore = updatedRisk.score;
      }
      if (updates.status) updatedRisk.status = updates.status as RiskStatus;
      if (updates.owner) updatedRisk.owner = sanitizeCSVField(updates.owner);
      if (updates.mitigation) updatedRisk.mitigation = sanitizeCSVField(updates.mitigation);
      if (updates.escalationPath) updatedRisk.escalationPath = sanitizeCSVField(updates.escalationPath);
      if (updates.evidence) updatedRisk.evidence = sanitizeCSVField(updates.evidence);
      if (updates.notes) updatedRisk.notes = sanitizeCSVField(updates.notes);

      risks[riskIndex] = updatedRisk;

      // Rewrite CSV
      const headerLine = CSV_HEADERS.join(',');
      const csvContent = [headerLine, ...risks.map(riskToCSVLine)].join('\n');
      await fs.writeFile(RISK_REGISTER_PATH, csvContent);

      // Audit trail
      await appendAuditEntry(auditEntry);

      return NextResponse.json({
        status: 'ok',
        message: `Risk ${riskId} updated`,
        riskId,
      });
    }

    return NextResponse.json({ status: 'error', message: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error updating risk register:', error);
    return NextResponse.json({ status: 'error', message: 'Internal server error' }, { status: 500 });
  }
}
