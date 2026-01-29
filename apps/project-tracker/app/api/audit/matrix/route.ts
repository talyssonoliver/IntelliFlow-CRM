import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

function getRepoRootDir(): string {
  return path.join(process.cwd(), '..', '..');
}

export async function GET() {
  const repoRoot = getRepoRootDir();
  const matrixPath = path.join(repoRoot, 'audit-matrix.yml');

  try {
    const raw = await readFile(matrixPath, 'utf-8');
    const sha256 = crypto.createHash('sha256').update(raw, 'utf-8').digest('hex');
    const parsed = yaml.load(raw);
    return NextResponse.json({
      path: path.relative(repoRoot, matrixPath).replaceAll('\\', '/'),
      sha256,
      matrix: parsed,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 404 });
  }
}
