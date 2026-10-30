import { NextRequest, NextResponse } from 'next/server';
import { askTutor, textToSpeech } from '@/lib/sarvam';

export async function POST(request: NextRequest) {
  try {
    const { question, transcript, chatHistory } = await request.json();

    const { answer, detectedLang } = await askTutor(question, transcript, chatHistory || []);

    // Generate TTS
    let audioBase64 = null;
    try {
      const audioBuffer = await textToSpeech(answer, detectedLang);
      if (audioBuffer) {
        const bytes = new Uint8Array(audioBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        audioBase64 = btoa(binary);
      }
    } catch (e) {
      console.error('TTS error (non-fatal):', e);
    }

    return NextResponse.json({ answer, detectedLang, audio: audioBase64 });
  } catch (error: unknown) {
    console.error('Ask error:', error);
    const message = error instanceof Error ? error.message : 'Failed to get answer';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
