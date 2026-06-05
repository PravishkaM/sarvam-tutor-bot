import { NextRequest, NextResponse } from 'next/server'
import { translateText } from '@/lib/sarvam'

export async function POST(req: NextRequest) {
  try {
    const { text, sourceLang, targetLang } = await req.json()

    if (!text || !targetLang) {
      return NextResponse.json({ error: 'Missing text or targetLang' }, { status: 400 })
    }

    const translated = await translateText(text, sourceLang || 'auto', targetLang)
    return NextResponse.json({ translated })
  } catch (err: any) {
    console.error('Translate error:', err)
    return NextResponse.json({ error: err.message || 'Translation failed' }, { status: 500 })
  }
}
