import { NextRequest, NextResponse } from 'next/server';
import { translateText } from '@/lib/sarvam';

export async function POST(request: NextRequest) {
  try {
    const { text, sourceLang, targetLang } = await request.json();

    const translated = await translateText(text, sourceLang, targetLang);
    return NextResponse.json({ translated });
  } catch (error: unknown) {
    console.error('Translation error:', error);
    const message = error instanceof Error ? error.message : 'Translation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
