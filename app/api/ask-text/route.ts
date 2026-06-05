import { NextRequest, NextResponse } from 'next/server'
import { askTutor, textToSpeech } from '@/lib/sarvam'

export async function POST(req: NextRequest) {
  try {
    const { question, transcript, chatHistory } = await req.json()

    if (!question || !transcript) {
      return NextResponse.json({ error: 'Missing question or transcript' }, { status: 400 })
    }

    // Ask the tutor (auto-detects language from question)
    const { answer, detectedLang } = await askTutor(question, transcript, chatHistory || [])

    // Generate TTS in the detected language
    let audioBase64 = ''
    try {
      audioBase64 = await textToSpeech(answer, detectedLang)
    } catch (e) {
      console.error('TTS error (non-fatal):', e)
    }

    return NextResponse.json({
      answer,
      audioBase64,
      detectedLang,
    })
  } catch (err: any) {
    console.error('Ask-text error:', err)
    return NextResponse.json({ error: err.message || 'Failed to process question' }, { status: 500 })
  }
}
