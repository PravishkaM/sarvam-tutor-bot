import { NextRequest, NextResponse } from 'next/server';
import { translateText } from '@/lib/sarvam';

export async function POST(request: NextRequest) {
  try {
    const { text, sourceLang, targetLang } = await request.json();

    // 'auto' lets the translator detect the source language (e.g. Hindi transcripts)
    const source = sourceLang || 'auto';
    const translated = await translateText(text, source, targetLang);
    return NextResponse.json({ translated });
  } catch (error: unknown) {
    console.error('Translation error:', error);
    const message = error instanceof Error ? error.message : 'Translation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
