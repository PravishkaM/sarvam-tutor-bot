import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { transcript } = await request.json();

    if (!transcript || !transcript.trim()) {
      return NextResponse.json({ error: 'No transcript provided' }, { status: 400 });
    }

    return NextResponse.json({ transcript: transcript.trim() });
  } catch (error: unknown) {
    console.error('YouTube route error:', error);
    const message = error instanceof Error ? error.message : 'Failed to process transcript';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
