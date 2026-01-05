import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const ARTIFACTS_DIR = path.join(process.cwd(), '..', '..', 'artifacts');
const RISK_REGISTER_PATH = path.join(ARTIFACTS_DIR, 'reports', 'risk-register.csv');

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Risk {
  id: string;
  category: string;
  description: string;
  impact: 'High' | 'Medium' | 'Low';
  likelihood: 'High' | 'Medium' | 'Low';
  score: number;
  status: 'Open' | 'Mitigated' | 'Closed' | 'Monitoring';
  owner: string;
  mitigation: string;
  lastReviewed: string;
}

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

function calculateScore(impact: string, likelihood: string): number {
  const impactScore = impact === 'High' ? 3 : impact === 'Medium' ? 2 : 1;
  const likelihoodScore = likelihood === 'High' ? 3 : likelihood === 'Medium' ? 2 : 1;
  return impactScore * likelihoodScore;
}

async function parseRiskRegister(): Promise<{ risks: Risk[]; lastUpdated: string | null }> {
  try {
    const content = await fs.readFile(RISK_REGISTER_PATH, 'utf-8');
    const stats = await fs.stat(RISK_REGISTER_PATH);
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      return { risks: [], lastUpdated: stats.mtime.toISOString() };
    }

    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
    const risks: Risk[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < 3) continue;

      const getValue = (key: string): string => {
        const idx = headers.findIndex(h => h.includes(key));
        return idx >= 0 ? values[idx] || '' : '';
      };

      const impact = getValue('impact') as Risk['impact'] || 'Medium';
      const likelihood = getValue('likelihood') as Risk['likelihood'] || 'Medium';

      risks.push({
        id: getValue('id') || `RISK-${i}`,
        category: getValue('category') || 'General',
        description: getValue('description') || values[1] || '',
        impact,
        likelihood,
        score: calculateScore(impact, likelihood),
        status: (getValue('status') as Risk['status']) || 'Open',
        owner: getValue('owner') || 'Unassigned',
        mitigation: getValue('mitigation') || '',
        lastReviewed: getValue('reviewed') || getValue('date') || new Date().toISOString().split('T')[0],
      });
    }

    return { risks, lastUpdated: stats.mtime.toISOString() };
  } catch (error) {
    console.error('Error parsing risk register:', error);
    return { risks: [], lastUpdated: null };
  }
}

export async function GET() {
  try {
    const { risks, lastUpdated } = await parseRiskRegister();

    // Calculate summary
    const summary = {
      total: risks.length,
      open: risks.filter(r => r.status === 'Open').length,
      mitigated: risks.filter(r => r.status === 'Mitigated').length,
      monitoring: risks.filter(r => r.status === 'Monitoring').length,
      closed: risks.filter(r => r.status === 'Closed').length,
      highRisk: risks.filter(r => r.score >= 6).length,
      mediumRisk: risks.filter(r => r.score >= 3 && r.score < 6).length,
      lowRisk: risks.filter(r => r.score < 3).length,
    };

    return NextResponse.json({
      status: 'ok',
      risks,
      summary,
      lastUpdated,
      path: RISK_REGISTER_PATH,
    });
  } catch (error) {
    console.error('Error reading risk register:', error);
    return NextResponse.json(
      { status: 'error', message: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, risk } = body;

    if (action === 'add' && risk) {
      // Read current content
      let content = '';
      let headers = 'ID,Category,Description,Impact,Likelihood,Status,Owner,Mitigation,Last Reviewed';

      try {
        content = await fs.readFile(RISK_REGISTER_PATH, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        if (lines.length > 0) {
          headers = lines[0];
        }
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

      // Add new risk
      const newLine = [
        newId,
        risk.category || 'General',
        `"${(risk.description || '').replace(/"/g, '""')}"`,
        risk.impact || 'Medium',
        risk.likelihood || 'Medium',
        risk.status || 'Open',
        risk.owner || 'Unassigned',
        `"${(risk.mitigation || '').replace(/"/g, '""')}"`,
        new Date().toISOString().split('T')[0],
      ].join(',');

      const newContent = content.trim()
        ? `${content.trim()}\n${newLine}`
        : `${headers}\n${newLine}`;

      await fs.writeFile(RISK_REGISTER_PATH, newContent);

      return NextResponse.json({
        status: 'ok',
        message: 'Risk added',
        riskId: newId,
      });
    }

    return NextResponse.json(
      { status: 'error', message: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error updating risk register:', error);
    return NextResponse.json(
      { status: 'error', message: String(error) },
      { status: 500 }
    );
  }
}
