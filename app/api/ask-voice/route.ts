import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import { speechToText, askTutor, textToSpeech } from '@/lib/sarvam';

// Browsers record WebM/Opus (Chrome) or MP4 (Safari). Convert to 16kHz mono WAV,
// which is what the speech-to-text model handles best.
function toWav(input: Buffer): Buffer {
  const dir = '/tmp/voice-q';
  mkdirSync(dir, { recursive: true });
  const id = randomUUID();
  const inPath = path.join(dir, `${id}.in`);
  const outPath = path.join(dir, `${id}.wav`);
  writeFileSync(inPath, input);
  try {
    execFileSync('ffmpeg', ['-y', '-i', inPath, '-ar', '16000', '-ac', '1', '-f', 'wav', outPath], { timeout: 30000, stdio: 'ignore' });
    return readFileSync(outPath);
  } finally {
    try { unlinkSync(inPath); } catch {}
    try { unlinkSync(outPath); } catch {}
  }
}

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

    const raw = Buffer.from(await audioFile.arrayBuffer());
    let wav: Buffer;
    try {
      wav = toWav(raw);
    } catch (e) {
      console.error('Audio conversion failed:', e);
      return NextResponse.json({ error: 'Could not read the recording. Please try again.' }, { status: 400 });
    }

    // STT with auto language detection (transcribes, does not translate)
    const questionText = (await speechToText(new Uint8Array(wav).buffer as ArrayBuffer, 'unknown')).trim();
    if (!questionText) {
      return NextResponse.json({ error: "I couldn't hear anything. Please try speaking again." }, { status: 400 });
    }

    const { answer, detectedLang } = await askTutor(questionText, transcript, chatHistory);

    let audioBase64 = null;
    try {
      const ttsBuffer = await textToSpeech(answer, detectedLang);
      if (ttsBuffer) audioBase64 = Buffer.from(ttsBuffer).toString('base64');
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
