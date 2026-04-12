import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import { PATHS } from '@/lib/paths';
import { join } from 'node:path';

const SPEC_TRACKER_PATH = join(PATHS.artifacts.reports, 'spec-tracker.json');

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const content = await fs.readFile(SPEC_TRACKER_PATH, 'utf-8');
    const data = JSON.parse(content);
    const stats = await fs.stat(SPEC_TRACKER_PATH);
    return NextResponse.json({ data, lastUpdated: stats.mtime.toISOString() });
  } catch (err) {
    console.error('Failed to read spec-tracker.json:', err);
    return NextResponse.json(
      { error: 'spec-tracker.json not found. Generate it first.' },
      { status: 404 }
    );
  }
}
