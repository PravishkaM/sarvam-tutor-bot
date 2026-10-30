import { NextRequest, NextResponse } from 'next/server';
import { generateQuiz } from '@/lib/sarvam';

export async function POST(request: NextRequest) {
  try {
    const { transcript } = await request.json();

    if (!transcript) {
      return NextResponse.json({ error: 'No transcript provided' }, { status: 400 });
    }

    const quiz = await generateQuiz(transcript);
    return NextResponse.json(quiz);
  } catch (error: unknown) {
    console.error('Quiz generation error:', error);
    const message = error instanceof Error ? error.message : 'Quiz generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
