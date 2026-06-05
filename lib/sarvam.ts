const SARVAM_API_KEY = process.env.SARVAM_API_KEY || ''
const SARVAM_BASE = 'https://api.sarvam.ai'

export async function speechToText(audioBuffer: Buffer, language?: string): Promise<string> {
  const formData = new FormData()
  const blob = new Blob([new Uint8Array(audioBuffer)])
  formData.append('file', blob, 'audio.wav')
  formData.append('model', 'saaras:v3')
  if (language) {
    formData.append('language_code', language)
  }

  const res = await fetch(`${SARVAM_BASE}/speech-to-text`, {
    method: 'POST',
    headers: { 'api-subscription-key': SARVAM_API_KEY },
    body: formData,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`STT failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  return data.transcript || ''
}

export async function textToSpeech(text: string, language: string = 'hi-IN'): Promise<string> {
  // Sarvam TTS limit is 500 chars per input. Split into chunks by sentences.
  const sentences = text.match(/[^.!?।]+[.!?।]*/g) || [text]
  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    if ((current + sentence).length > 480) {
      if (current) chunks.push(current.trim())
      current = sentence
    } else {
      current += sentence
    }
  }
  if (current.trim()) chunks.push(current.trim())

  // Only send first 3 chunks to avoid too many API calls
  const inputChunks = chunks.slice(0, 3)

  const res = await fetch(`${SARVAM_BASE}/text-to-speech`, {
    method: 'POST',
    headers: {
      'api-subscription-key': SARVAM_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: inputChunks,
      target_language_code: language,
      speaker: 'priya',
      model: 'bulbul:v3',
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`TTS failed (${res.status}): ${errText}`)
  }

  const data = await res.json()
  // Combine audio chunks into one by concatenating base64 PCM
  // For simplicity, return just the first chunk's audio
  return data.audios?.[0] || ''
}

export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  // Sarvam translate has a character limit per call (~500 chars)
  // Split into chunks and translate each
  const chunks: string[] = []
  const sentences = text.match(/[^.!?।\n]+[.!?।\n]*/g) || [text]
  let current = ''

  for (const sentence of sentences) {
    if ((current + sentence).length > 450) {
      if (current) chunks.push(current.trim())
      current = sentence
    } else {
      current += sentence
    }
  }
  if (current.trim()) chunks.push(current.trim())

  const translatedChunks: string[] = []

  for (const chunk of chunks) {
    const body: Record<string, string> = {
      input: chunk,
      source_language_code: sourceLang === 'auto' ? 'auto' : sourceLang,
      target_language_code: targetLang,
    }

    const res = await fetch(`${SARVAM_BASE}/translate`, {
      method: 'POST',
      headers: {
        'api-subscription-key': SARVAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`Translate chunk failed (${res.status}): ${errText}`)
      translatedChunks.push(chunk) // Keep original on failure
      continue
    }

    const data = await res.json()
    translatedChunks.push(data.translated_text || chunk)
  }

  return translatedChunks.join(' ')
}

export async function askTutor(
  question: string,
  transcript: string,
  chatHistory: { role: string; content: string }[],
  language: string = 'en-IN'
): Promise<{ answer: string; detectedLang: string }> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

  const languageNames: Record<string, string> = {
    'en-IN': 'English',
    'hi-IN': 'Hindi',
    'ta-IN': 'Tamil',
    'te-IN': 'Telugu',
    'kn-IN': 'Kannada',
    'ml-IN': 'Malayalam',
    'bn-IN': 'Bengali',
    'mr-IN': 'Marathi',
    'gu-IN': 'Gujarati',
    'pa-IN': 'Punjabi',
    'od-IN': 'Odia',
  }

  const langName = languageNames[language] || 'English'

  const systemPrompt = `You are a friendly, patient tutor helping a student understand an educational video they just watched.

IMPORTANT RULES:
1. ONLY answer based on the video content provided below.
2. If the answer is NOT in the video content, say the equivalent of "This wasn't covered in the video" in the appropriate language.
3. Explain like a tutor talking to a student face-to-face. Use simple language, give examples, break down complex ideas.
4. If the student seems confused, try explaining differently.
5. Keep answers concise — 3 to 5 sentences unless the topic needs more.
6. AUTOMATICALLY DETECT the language of the student's question and respond ENTIRELY in that same language using its NATIVE SCRIPT. If they ask in Hindi, respond in Hindi using Devanagari script. If they ask in Tamil, use Tamil script. If they ask in Bengali, use Bengali script. NEVER write Indian languages in Roman/Latin script. Always use the native script of that language.
7. Do NOT mix languages. If the student asks in Hindi, every word must be in Hindi (Devanagari). No English words mixed in unless they are universally used technical terms with absolutely no translation.
7. NEVER use markdown formatting. No #, ##, **, *, ---, bullet points, or numbered lists. Write in plain flowing sentences and paragraphs only.
8. NEVER use emojis or special symbols.
9. Write as if you are speaking to the student verbally. Your answer will be converted to speech, so it must sound natural when read aloud.
10. At the very end of your response, on a new line, write DETECTED_LANG: followed by the language code (en-IN, hi-IN, ta-IN, te-IN, kn-IN, ml-IN, bn-IN, mr-IN, gu-IN, pa-IN, od-IN). This line will be removed before showing the answer to the student.

=== VIDEO TRANSCRIPT (YOUR ONLY SOURCE OF TRUTH) ===
${transcript}
=== END OF VIDEO TRANSCRIPT ===`

  const messages = [
    ...chatHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: question },
  ]

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LLM failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  const rawText = data.content?.[0]?.text || 'Sorry, I could not generate a response.'
  
  // Extract detected language tag
  const langMatch = rawText.match(/DETECTED_LANG:\s*([\w-]+)/)
  const detectedLang = langMatch ? langMatch[1].trim() : 'en-IN'
  
  // Remove the language tag from the answer
  const cleanAnswer = rawText.replace(/\n?DETECTED_LANG:\s*[\w-]+/, '').trim()
  
  return { answer: cleanAnswer, detectedLang }
}
