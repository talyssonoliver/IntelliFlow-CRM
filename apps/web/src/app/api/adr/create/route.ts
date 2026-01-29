import { NextRequest, NextResponse } from 'next/server';
import { createADR } from '@/lib/adr/adr-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, technicalStory } = body;

    if (!title || typeof title !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Title is required' },
        { status: 400 }
      );
    }

    const result = createADR(title, technicalStory);

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
    console.error('ADR create error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
