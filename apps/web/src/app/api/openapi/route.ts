import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const specPath = path.join(process.cwd(), '..', 'api', 'openapi.json');
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));

    return NextResponse.json(spec, {
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': 'application/json',
      },
    });
  } catch {
    return NextResponse.json({ error: 'OpenAPI spec not available' }, { status: 503 });
  }
}
