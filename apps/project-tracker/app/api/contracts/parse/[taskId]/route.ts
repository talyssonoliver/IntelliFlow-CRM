import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Papa from 'papaparse';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Params {
  params: Promise<{
    taskId: string;
  }>;
}

type ContractTagType =
  | 'FILE'
  | 'DIR'
  | 'ENV'
  | 'POLICY'
  | 'EVIDENCE'
  | 'VALIDATE'
  | 'GATE'
  | 'AUDIT';

interface ParsedTag {
  type: ContractTagType;
  value: string;
  raw: string;
}

interface ContractParseResult {
  taskId: string;
  prerequisites: {
    raw: string;
    tags: ParsedTag[];
    hasContractTags: boolean;
  };
  artifacts: {
    raw: string;
    tags: ParsedTag[];
    hasContractTags: boolean;
    requiresContextAck: boolean;
  };
  validation: {
    raw: string;
    tags: ParsedTag[];
    hasContractTags: boolean;
  };
  compliance: {
    hasAllTags: boolean;
    missingEllipsis: boolean;
    score: number; // 0-100
  };
}

function parseContractTags(rawString: string): ParsedTag[] {
  if (!rawString || typeof rawString !== 'string') {
    return [];
  }

  const tags: ParsedTag[] = [];
  const tagPattern = /\b(FILE|DIR|ENV|POLICY|EVIDENCE|VALIDATE|GATE|AUDIT):([^;]+)/gi;

  let match;
  while ((match = tagPattern.exec(rawString)) !== null) {
    const type = match[1].toUpperCase() as ContractTagType;
    const value = match[2].trim();
    tags.push({
      type,
      value,
      raw: match[0],
    });
  }

  return tags;
}

function hasContractTags(rawString: string): boolean {
  if (!rawString) return false;
  return /\b(FILE|DIR|ENV|POLICY|EVIDENCE|VALIDATE|GATE|AUDIT):/i.test(rawString);
}

function containsEllipsis(rawString: string): boolean {
  return rawString?.includes('...') || false;
}

export async function GET(request: Request, { params }: Params) {
  const resolvedParams = await params;
  const { taskId } = resolvedParams;

  try {
    const csvPath = join(process.cwd(), 'docs', 'metrics', '_global', 'Sprint_plan.csv');
    const csvContent = await readFile(csvPath, 'utf-8');

    const parsed = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
    });

    interface CsvRow {
      'Task ID': string;
      'Pre-requisites': string;
      'Artifacts To Track': string;
      'Validation Method': string;
      [key: string]: string;
    }

    const task = (parsed.data as CsvRow[]).find((row) => row['Task ID'] === taskId);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const prerequisites = task['Pre-requisites'] || '';
    const artifacts = task['Artifacts To Track'] || '';
    const validation = task['Validation Method'] || '';

    const prereqTags = parseContractTags(prerequisites);
    const artifactTags = parseContractTags(artifacts);
    const validationTags = parseContractTags(validation);

    const hasPrereqTags = hasContractTags(prerequisites);
    const hasArtifactTags = hasContractTags(artifacts);
    const hasValidationTags = hasContractTags(validation);

    const requiresContextAck = artifactTags.some(
      (t) => t.type === 'EVIDENCE' && t.value === 'context_ack'
    );

    const hasEllipsis =
      containsEllipsis(prerequisites) ||
      containsEllipsis(artifacts) ||
      containsEllipsis(validation);

    // Calculate compliance score
    let score = 0;
    if (hasPrereqTags) score += 30;
    if (hasArtifactTags) score += 30;
    if (hasValidationTags) score += 30;
    if (requiresContextAck) score += 10;
    if (hasEllipsis) score -= 20;
    score = Math.max(0, Math.min(100, score));

    const result: ContractParseResult = {
      taskId,
      prerequisites: {
        raw: prerequisites,
        tags: prereqTags,
        hasContractTags: hasPrereqTags,
      },
      artifacts: {
        raw: artifacts,
        tags: artifactTags,
        hasContractTags: hasArtifactTags,
        requiresContextAck,
      },
      validation: {
        raw: validation,
        tags: validationTags,
        hasContractTags: hasValidationTags,
      },
      compliance: {
        hasAllTags: hasPrereqTags && hasArtifactTags && hasValidationTags,
        missingEllipsis: !hasEllipsis,
        score,
      },
    };

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    console.error('Error parsing contract tags:', error);
    return NextResponse.json({ error: 'Failed to parse contract tags' }, { status: 500 });
  }
}
