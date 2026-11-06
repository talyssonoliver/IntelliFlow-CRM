import { NextRequest, NextResponse } from 'next/server';
import { refuseInProduction, requireOperator } from '@/lib/route-access';
import { generateADRIndex, writeADRIndex } from '@/lib/adr/adr-service';

export async function GET(request: NextRequest) {
  const denied = await requireOperator(request);
  if (denied) return denied;
  try {
    const content = generateADRIndex();
    return NextResponse.json({
      success: true,
      data: { content },
    });
  } catch (error) {
    console.error('ADR index generation error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const refused = refuseInProduction();
  if (refused) return refused;
  const denied = await requireOperator(request);
  if (denied) return denied;
  try {
    const result = writeADRIndex();

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: { path: result.path },
    });
  } catch (error) {
    console.error('ADR index write error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
