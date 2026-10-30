import { NextRequest, NextResponse } from 'next/server';
import { speechToText, askTutor, textToSpeech } from '@/lib/sarvam';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const transcript = formData.get('transcript') as string;
    const chatHistoryStr = formData.get('chatHistory') as string;
    const chatHistory = chatHistoryStr ? JSON.parse(chatHistoryStr) : [];

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
    }

    const audioBuffer = await audioFile.arrayBuffer();

    // STT - no language param for auto-detect
    const questionText = await speechToText(audioBuffer);

    // Ask tutor
    const { answer, detectedLang } = await askTutor(questionText, transcript, chatHistory);

    // TTS
    let audioBase64 = null;
    try {
      const ttsBuffer = await textToSpeech(answer, detectedLang);
      if (ttsBuffer) {
        const bytes = new Uint8Array(ttsBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        audioBase64 = btoa(binary);
      }
    } catch (e) {
      console.error('TTS error (non-fatal):', e);
    }

    return NextResponse.json({ question: questionText, answer, detectedLang, audio: audioBase64 });
  } catch (error: unknown) {
    console.error('Voice ask error:', error);
    const message = error instanceof Error ? error.message : 'Failed to process voice question';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
