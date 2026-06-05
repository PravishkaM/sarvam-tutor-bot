import { NextRequest, NextResponse } from 'next/server'
import { speechToText, askTutor, textToSpeech } from '@/lib/sarvam'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audio = formData.get('audio') as File
    const transcript = formData.get('transcript') as string
    const chatHistoryStr = formData.get('chatHistory') as string
    const chatHistory = chatHistoryStr ? JSON.parse(chatHistoryStr) : []

    if (!audio || !transcript) {
      return NextResponse.json({ error: 'Missing audio or transcript' }, { status: 400 })
    }

    const audioBuffer = Buffer.from(await audio.arrayBuffer())

    // Step 1: STT (auto-detect language)
    const studentText = await speechToText(audioBuffer)

    // Step 2: Ask tutor (auto-detects language from question)
    const { answer, detectedLang } = await askTutor(studentText, transcript, chatHistory)

    // Step 3: TTS in detected language
    let audioBase64 = ''
    try {
      audioBase64 = await textToSpeech(answer, detectedLang)
    } catch (e) {
      console.error('TTS error (non-fatal):', e)
    }

    return NextResponse.json({
      studentText,
      answer,
      audioBase64,
      detectedLang,
    })
  } catch (err: any) {
    console.error('Ask-voice error:', err)
    return NextResponse.json({ error: err.message || 'Failed to process voice' }, { status: 500 })
  }
}
