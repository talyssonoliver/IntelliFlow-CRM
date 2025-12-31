import { NextResponse } from 'next/server';
import { validateAllADRs } from '@/lib/adr/adr-service';

export async function GET() {
  try {
    const validations = validateAllADRs();

    const summary = {
      total: validations.length,
      valid: validations.filter(v => v.validation.valid && v.validation.warnings.length === 0).length,
      withErrors: validations.filter(v => !v.validation.valid).length,
      withWarnings: validations.filter(v => v.validation.valid && v.validation.warnings.length > 0).length,
    };

    return NextResponse.json({
      success: true,
      data: {
        summary,
        validations,
      },
    });
  } catch (error) {
    console.error('ADR validate error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
