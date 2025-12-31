import { NextRequest, NextResponse } from 'next/server';
import { generateADRIndex, writeADRIndex } from '@/lib/adr/adr-service';

export async function GET() {
  try {
    const content = generateADRIndex();
    return NextResponse.json({
      success: true,
      data: { content },
    });
  } catch (error) {
    console.error('ADR index generation error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const result = writeADRIndex();

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { path: result.path },
    });
  } catch (error) {
    console.error('ADR index write error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
