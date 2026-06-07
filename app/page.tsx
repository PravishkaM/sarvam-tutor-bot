'use client'

import { useState, useRef, useEffect } from 'react'

type Message = {
  role: 'user' | 'bot'
  text: string
  originalText?: string
  audio?: string
  translatedVersions?: Record<string, string>
}

const LANGUAGES = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'ta-IN', label: 'தமிழ்' },
  { code: 'te-IN', label: 'తెలుగు' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ' },
  { code: 'ml-IN', label: 'മലയാളം' },
  { code: 'bn-IN', label: 'বাংলা' },
  { code: 'mr-IN', label: 'मराठी' },
  { code: 'gu-IN', label: 'ગુજરાতી' },
  { code: 'pa-IN', label: 'ਪੰਜਾਬੀ' },
  { code: 'od-IN', label: 'ଓଡ଼ିଆ' },
]

export default function Home() {
  const [step, setStep] = useState<'upload' | 'chat'>('upload')
  const [transcript, setTranscript] = useState('')
  const [translatedTranscript, setTranslatedTranscript] = useState('')
  const [transcriptLang, setTranscriptLang] = useState('original')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [statusText, setStatusText] = useState('')
  const [showTranscript, setShowTranscript] = useState(false)
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([])
  const [translatingMsg, setTranslatingMsg] = useState<number | null>(null)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Translate text via API
  async function translateViaAPI(text: string, targetLang: string): Promise<string> {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, sourceLang: 'auto', targetLang }),
    })
    const data = await res.json()
    return data.translated || text
  }

  // Handle transcript language change
  async function handleTranscriptLangChange(lang: string) {
    setTranscriptLang(lang)
    if (lang === 'original') {
      setTranslatedTranscript('')
      return
    }
    try {
      const translated = await translateViaAPI(transcript.slice(0, 4000), lang)
      setTranslatedTranscript(translated)
    } catch {
      setTranslatedTranscript('Translation failed.')
    }
  }

  // Handle per-answer translation
  async function handleAnswerTranslate(msgIndex: number, targetLang: string) {
    const msg = messages[msgIndex]
    if (!msg || msg.role !== 'bot') return

    if (targetLang === 'original') {
      setMessages(prev => {
        const updated = [...prev]
        updated[msgIndex] = { ...updated[msgIndex], text: updated[msgIndex].originalText || updated[msgIndex].text }
        return updated
      })
      return
    }

    // Check cache
    if (msg.translatedVersions?.[targetLang]) {
      setMessages(prev => {
        const updated = [...prev]
        updated[msgIndex] = { ...updated[msgIndex], text: msg.translatedVersions![targetLang] }
        return updated
      })
      return
    }

    setTranslatingMsg(msgIndex)
    try {
      const original = msg.originalText || msg.text
      const translated = await translateViaAPI(original, targetLang)
      setMessages(prev => {
        const updated = [...prev]
        const existing = updated[msgIndex]
        updated[msgIndex] = {
          ...existing,
          text: translated,
          originalText: existing.originalText || existing.text,
          translatedVersions: { ...(existing.translatedVersions || {}), [targetLang]: translated },
        }
        return updated
      })
    } catch {
      // Silently fail
    } finally {
      setTranslatingMsg(null)
    }
  }

  // Handle audio file upload — server handles chunking
  async function handleFileUpload(file: File) {
    setUploading(true)
    setUploadProgress(10)
    setStatusText('Uploading file to server...')

    try {
      const formData = new FormData()
      formData.append('file', file, file.name)
      formData.append('mode', 'chunked')

      setUploadProgress(30)
      setStatusText('Transcribing... this may take a few minutes for long files')

      const res = await fetch('/api/transcribe', { method: 'POST', body: formData })
      const data = await res.json()

      if (data.error) {
        alert('Error: ' + data.error)
        setUploading(false)
        return
      }

      if (!data.transcript?.trim()) {
        alert('Could not transcribe the audio. Please try a different file.')
        setUploading(false)
        return
      }

      setUploadProgress(100)
      setStatusText(`Done! ${data.chunks ? `(${data.chunks} chunks processed)` : ''}`)
      setTranscript(data.transcript.trim())
      setTimeout(() => setStep('chat'), 600)
    } catch (err: any) {
      console.error('Upload error:', err)
      alert('Upload failed: ' + (err.message || 'Please try again.'))
    } finally {
      setUploading(false)
    }
  }

  // Text question
  async function handleSend() {
    if (!input.trim() || loading) return

    const question = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: question }])
    setLoading(true)

    try {
      const res = await fetch('/api/ask-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, transcript, chatHistory }),
      })

      const data = await res.json()

      setChatHistory(prev => [
        ...prev,
        { role: 'user', content: question },
        { role: 'assistant', content: data.answer },
      ])

      setMessages(prev => [...prev, {
        role: 'bot',
        text: data.answer,
        originalText: data.answer,
        audio: data.audioBase64 ? `data:audio/wav;base64,${data.audioBase64}` : undefined,
      }])
    } catch {
      setMessages(prev => [...prev, { role: 'bot', text: 'Sorry, something went wrong. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  // Voice recording
  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop()
      setRecording(false)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        await handleVoiceQuestion(blob)
      }

      mediaRecorder.start()
      setRecording(true)
    } catch {
      alert('Microphone access denied. Please allow mic access.')
    }
  }

  async function handleVoiceQuestion(audioBlob: Blob) {
    setMessages(prev => [...prev, { role: 'user', text: '🎤 Listening...' }])
    setLoading(true)

    const formData = new FormData()
    formData.append('audio', audioBlob, 'recording.webm')
    formData.append('transcript', transcript)
    formData.append('chatHistory', JSON.stringify(chatHistory))

    try {
      const res = await fetch('/api/ask-voice', { method: 'POST', body: formData })
      const data = await res.json()

      setMessages(prev => {
        const updated = [...prev]
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].role === 'user' && updated[i].text === '🎤 Listening...') {
            updated[i] = { role: 'user', text: data.studentText || '🎤 Voice message' }
            break
          }
        }
        updated.push({
          role: 'bot',
          text: data.answer,
          originalText: data.answer,
          audio: data.audioBase64 ? `data:audio/wav;base64,${data.audioBase64}` : undefined,
        })
        return updated
      })

      setChatHistory(prev => [
        ...prev,
        { role: 'user', content: data.studentText },
        { role: 'assistant', content: data.answer },
      ])
    } catch {
      setMessages(prev => [...prev, { role: 'bot', text: 'Sorry, could not process voice. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  // ========== RENDER UPLOAD PAGE ==========
  if (step === 'upload') {
    return (
      <div className="app-container">
        <div className="header">
          <div className="header-left">
            <img src="/sarvam-logo.svg" alt="Sarvam" className="logo-img" />
            <div className="header-divider" />
            <span className="header-title">Multilingual Tutor Bot</span>
          </div>
          <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)', fontStyle: 'italic' }}>powered by Sarvam</span>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="welcome" style={{ marginBottom: 32 }}>
            <div className="welcome-icon">🎓</div>
            <h2>Upload a Lecture</h2>
            <p>Upload an audio or video file of an educational lecture, and I will become your personal tutor for that content.</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*,.mp3,.wav,.mp4,.m4a,.webm,.ogg"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFileUpload(file)
            }}
          />

          <div
            className="upload-area"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('dragging') }}
            onDragLeave={(e) => e.currentTarget.classList.remove('dragging')}
            onDrop={(e) => {
              e.preventDefault()
              e.currentTarget.classList.remove('dragging')
              const file = e.dataTransfer.files[0]
              if (file) handleFileUpload(file)
            }}
            style={{ width: '100%', maxWidth: 480 }}
          >
            <div className="upload-icon">📁</div>
            <div className="upload-text">Drop your audio/video file here</div>
            <div className="upload-subtext">or click to browse · MP3, WAV, MP4, WebM · WAV files work best</div>

            {uploading && (
              <>
                <div className="progress-bar" style={{ width: '100%' }}>
                  <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                </div>
                <div className="status-text">{statusText}</div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ========== RENDER CHAT PAGE ==========
  return (
    <div className="app-container">
      <div className="header">
        <div className="header-left">
          <img src="/sarvam-logo.svg" alt="Sarvam" className="logo-img" />
          <div className="header-divider" />
          <span className="header-title">Multilingual Tutor Bot</span>
        </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => { setStep('upload'); setMessages([]); setTranscript(''); setChatHistory([]) }}
            style={{ background: 'none', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans' }}
          >
            ← New Lecture
          </button>
          <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)', fontStyle: 'italic' }}>powered by Sarvam</span>
        </div>
      </div>

      {/* Transcript panel with translation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button className="transcript-toggle" onClick={() => setShowTranscript(!showTranscript)}>
          {showTranscript ? 'Hide' : 'Show'} Transcript
        </button>
        {showTranscript && (
          <select
            className="language-select"
            value={transcriptLang}
            onChange={(e) => handleTranscriptLangChange(e.target.value)}
            style={{ fontSize: 12 }}
          >
            <option value="original">Original</option>
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        )}
      </div>

      {showTranscript && (
        <div className="transcript-panel">
          {transcriptLang === 'original' ? transcript : (translatedTranscript || 'Translating...')}
        </div>
      )}

      <div className="chat-area">
        {messages.length === 0 && (
          <div className="welcome">
            <div className="welcome-icon">🎓</div>
            <h2>Ask me anything</h2>
            <p>I have studied the lecture. Ask your doubts by typing or using voice — in any language!</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.role === 'bot' && <div className="bot-label">Tutor</div>}
            <div>{msg.text}</div>
            {msg.audio && (
              <div className="audio-player">
                <audio controls autoPlay src={msg.audio} />
              </div>
            )}
            {/* Per-answer translate dropdown */}
            {msg.role === 'bot' && msg.text !== 'Sorry, something went wrong. Please try again.' && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)' }}>Translate:</span>
                <select
                  className="language-select"
                  style={{ fontSize: 11, padding: '4px 8px' }}
                  defaultValue="original"
                  onChange={(e) => handleAnswerTranslate(i, e.target.value)}
                  disabled={translatingMsg === i}
                >
                  <option value="original">Original</option>
                  {LANGUAGES.map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
                {translatingMsg === i && (
                  <span style={{ fontSize: 11, color: 'var(--sarvam-orange)' }}>Translating...</span>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="message bot">
            <div className="bot-label">Tutor</div>
            <div className="typing-dots">
              <span /><span /><span />
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      <div className="input-area">
        <div className="input-container">
          <button
            className={`btn-icon btn-mic ${recording ? 'recording' : ''}`}
            onClick={toggleRecording}
            title={recording ? 'Stop recording' : 'Start recording'}
          >
            {recording ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>

          <input
            className="text-input"
            placeholder={recording ? 'Listening...' : 'Ask a doubt about the lecture...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={recording}
          />

          <button
            className="btn-icon btn-send"
            onClick={handleSend}
            disabled={!input.trim() || loading}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
