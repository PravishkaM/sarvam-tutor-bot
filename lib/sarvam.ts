const SARVAM_API_KEY = process.env.SARVAM_API_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

export async function speechToText(audioBuffer: ArrayBuffer, language?: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(audioBuffer)], { type: 'audio/wav' }), 'audio.wav');
  formData.append('model', 'saaras:v3');
  if (language) formData.append('language_code', language);

  const res = await fetch('https://api.sarvam.ai/speech-to-text', {
    method: 'POST',
    headers: { 'api-subscription-key': SARVAM_API_KEY },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`STT failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.transcript;
}

export async function textToSpeech(text: string, language: string): Promise<ArrayBuffer | null> {
  // Split into sentence-based chunks under 480 chars
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + ' ' + sentence).trim().length > 480) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current = (current + ' ' + sentence).trim();
    }
  }
  if (current) chunks.push(current.trim());

  // Send up to 3 chunks
  const audioChunks: ArrayBuffer[] = [];
  for (let i = 0; i < Math.min(chunks.length, 3); i++) {
    try {
      const res = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: {
          'api-subscription-key': SARVAM_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: [chunks[i]],
          target_language_code: language,
          speaker: 'priya',
          model: 'bulbul:v3',
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`TTS failed (${res.status}): ${err}`);
      }

      const data = await res.json();
      if (data.audios && data.audios[0]) {
        const binaryStr = atob(data.audios[0]);
        const bytes = new Uint8Array(binaryStr.length);
        for (let j = 0; j < binaryStr.length; j++) {
          bytes[j] = binaryStr.charCodeAt(j);
        }
        audioChunks.push(bytes.buffer);
      }
    } catch (e) {
      console.error('TTS error (non-fatal):', e);
    }
  }

  if (audioChunks.length === 0) return null;

  // Combine audio chunks
  const totalLength = audioChunks.reduce((sum, buf) => sum + buf.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of audioChunks) {
    combined.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return combined.buffer;
}

export async function translateText(text: string, sourceLang: string, targetLang: string): Promise<string> {
  // Split into chunks under 450 chars at sentence boundaries
  const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + ' ' + sentence).trim().length > 450) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current = (current + ' ' + sentence).trim();
    }
  }
  if (current) chunks.push(current.trim());

  const translated: string[] = [];
  for (const chunk of chunks) {
    const res = await fetch('https://api.sarvam.ai/translate', {
      method: 'POST',
      headers: {
        'api-subscription-key': SARVAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: chunk,
        source_language_code: sourceLang,
        target_language_code: targetLang,
        model: 'mayura:v1',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Translation failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    translated.push(data.translated_text);
  }

  return translated.join(' ');
}

export async function askTutor(
  question: string,
  transcript: string,
  chatHistory: { role: string; content: string }[],
  language?: string
): Promise<{ answer: string; detectedLang: string }> {
  const systemPrompt = `You are VidyaBot, a helpful multilingual tutor. You answer questions based ONLY on the following lecture transcript. This is your sole source of truth.

TRANSCRIPT:
${transcript}

RULES:
1. Answer ONLY from the transcript above. If the answer is not in the transcript, say so.
2. Detect the language of the student's question automatically.
3. Reply in the SAME language the student used.
4. If the student speaks Hindi, reply in Hindi using Devanagari script (not Roman/transliterated).
5. If the student speaks Tamil, reply in Tamil script. Same for Telugu, Kannada, Bengali, etc.
6. Do NOT use markdown formatting (no ##, no **, no bullet points with *).
7. Do NOT use emojis.
8. Write as if you are speaking to the student. Keep it conversational and clear.
9. At the end of your response, add a new line with DETECTED_LANG: followed by the ISO language code (e.g., hi-IN, en-IN, ta-IN, te-IN, bn-IN, kn-IN, ml-IN, gu-IN, mr-IN, od-IN, pa-IN).`;

  const messages = [
    ...chatHistory.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: question },
  ];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  const fullAnswer = data.content[0].text;

  // Parse DETECTED_LANG tag
  const langMatch = fullAnswer.match(/DETECTED_LANG:\s*(\S+)/);
  const detectedLang = langMatch ? langMatch[1] : 'en-IN';
  const answer = fullAnswer.replace(/\n?DETECTED_LANG:\s*\S+/, '').trim();

  return { answer, detectedLang };
}

export async function generateQuiz(transcript: string): Promise<{ questions: { question: string; options: string[]; correct: number; explanation: string }[] }> {
  const systemPrompt = `You are a quiz generator. Based on the lecture transcript below, generate exactly 5 multiple-choice questions to test the student's understanding.

TRANSCRIPT:
${transcript}

Return a JSON object with this exact structure (no markdown, no code fences, just pure JSON):
{
  "questions": [
    {
      "question": "The question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": 0,
      "explanation": "Brief explanation of why the correct answer is right"
    }
  ]
}

Rules:
- Generate exactly 5 questions
- Each question must have exactly 4 options
- "correct" is the 0-based index of the correct option
- Questions should cover key concepts from the transcript
- Keep questions clear and concise
- Write in English`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Generate a quiz from this transcript.' }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Quiz generation failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  const text = data.content[0].text;

  // Parse JSON from response (handle possible code fences)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse quiz JSON');

  return JSON.parse(jsonMatch[0]);
}
