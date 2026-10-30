'use client';

import { useState, useRef, useEffect } from 'react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  audio?: string;
};

type QuizQuestion = {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
};

const LANGUAGES = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'ta-IN', label: 'Tamil' },
  { code: 'te-IN', label: 'Telugu' },
  { code: 'kn-IN', label: 'Kannada' },
  { code: 'bn-IN', label: 'Bengali' },
  { code: 'ml-IN', label: 'Malayalam' },
  { code: 'gu-IN', label: 'Gujarati' },
  { code: 'mr-IN', label: 'Marathi' },
  { code: 'pa-IN', label: 'Punjabi' },
  { code: 'od-IN', label: 'Odia' },
];

export default function Home() {
  const [screen, setScreen] = useState<'landing' | 'upload' | 'chat'>('landing');
  const [transcript, setTranscript] = useState('');
  const [translatedTranscript, setTranslatedTranscript] = useState('');
  const [transcriptLang, setTranscriptLang] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [uploadTab, setUploadTab] = useState<'file' | 'youtube'>('file');

  // Quiz state
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<(number | null)[]>([]);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- FILE UPLOAD ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setTranscribing(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTranscript(data.transcript);
      setScreen('chat');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transcription failed';
      alert('Error: ' + msg);
    } finally {
      setTranscribing(false);
    }
  };

  // --- YOUTUBE URL ---
  const handleYoutubeSubmit = async () => {
    if (!youtubeUrl.trim()) return;
    setTranscribing(true);

    try {
      const res = await fetch('/api/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTranscript(data.transcript);
      setScreen('chat');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'YouTube transcription failed';
      alert('Error: ' + msg);
    } finally {
      setTranscribing(false);
    }
  };

  // --- TEXT QUESTION ---
  const handleAsk = async () => {
    if (!input.trim() || loading) return;
    const question = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setLoading(true);

    try {
      const res = await fetch('/api/ask-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          transcript,
          chatHistory: messages,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessages((prev) => [...prev, { role: 'assistant', content: data.answer, audio: data.audio }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to get answer';
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, something went wrong: ' + msg }]);
    } finally {
      setLoading(false);
    }
  };

  // --- VOICE QUESTION ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setMessages((prev) => [...prev, { role: 'user', content: '...' }]);
        setLoading(true);

        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.wav');
        formData.append('transcript', transcript);
        formData.append('chatHistory', JSON.stringify(messages));

        try {
          const res = await fetch('/api/ask-voice', { method: 'POST', body: formData });
          const data = await res.json();
          if (data.error) throw new Error(data.error);

          // Replace placeholder with actual question text
          setMessages((prev) => {
            const updated = [...prev];
            const placeholderIdx = updated.findLastIndex((m) => m.role === 'user' && m.content === '...');
            if (placeholderIdx !== -1) {
              updated[placeholderIdx] = { role: 'user', content: data.question };
            }
            return [...updated, { role: 'assistant', content: data.answer, audio: data.audio }];
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Voice question failed';
          setMessages((prev) => {
            const updated = [...prev];
            const placeholderIdx = updated.findLastIndex((m) => m.role === 'user' && m.content === '...');
            if (placeholderIdx !== -1) {
              updated[placeholderIdx] = { role: 'user', content: '(voice message)' };
            }
            return [...updated, { role: 'assistant', content: 'Sorry, something went wrong: ' + msg }];
          });
        } finally {
          setLoading(false);
        }
      };

      mediaRecorder.start();
      setRecording(true);
    } catch {
      alert('Microphone access denied. Please allow microphone access.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  // --- PLAY AUDIO ---
  const playAudio = (base64: string) => {
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.play();
  };

  // --- TRANSLATE TRANSCRIPT ---
  const handleTranslateTranscript = async (targetLang: string) => {
    if (!targetLang || targetLang === transcriptLang) return;
    setTranscriptLang(targetLang);

    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcript, sourceLang: 'en-IN', targetLang }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTranslatedTranscript(data.translated);
    } catch {
      setTranslatedTranscript('Translation failed.');
    }
  };

  // --- TRANSLATE ANSWER ---
  const [translatingIdx, setTranslatingIdx] = useState<number | null>(null);
  const [translatedAnswers, setTranslatedAnswers] = useState<Record<number, string>>({});

  const handleTranslateAnswer = async (idx: number, targetLang: string) => {
    if (!targetLang) return;
    setTranslatingIdx(idx);

    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: messages[idx].content, sourceLang: 'en-IN', targetLang }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTranslatedAnswers((prev) => ({ ...prev, [idx]: data.translated }));
    } catch {
      setTranslatedAnswers((prev) => ({ ...prev, [idx]: 'Translation failed.' }));
    } finally {
      setTranslatingIdx(null);
    }
  };

  // --- QUIZ ---
  const handleGenerateQuiz = async () => {
    setQuizLoading(true);
    setShowQuiz(true);
    setQuizFinished(false);
    setQuizIndex(0);
    setQuizAnswers([]);

    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQuizQuestions(data.questions);
      setQuizAnswers(new Array(data.questions.length).fill(null));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Quiz generation failed';
      alert('Error: ' + msg);
      setShowQuiz(false);
    } finally {
      setQuizLoading(false);
    }
  };

  const handleQuizAnswer = (optionIdx: number) => {
    if (quizAnswers[quizIndex] !== null) return; // already answered
    const updated = [...quizAnswers];
    updated[quizIndex] = optionIdx;
    setQuizAnswers(updated);
  };

  const quizScore = quizAnswers.filter((a, i) => a === quizQuestions[i]?.correct).length;

  // --- LANDING PAGE ---
  if (screen === 'landing') {
    return (
      <div className="min-h-screen hero-gradient">
        <div className="max-w-4xl mx-auto px-4 py-16">
          {/* Header */}
          <nav className="flex items-center justify-between mb-20">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white font-bold text-sm">V</div>
              <span className="text-lg font-semibold">VidyaBot</span>
            </div>
            <button className="btn-primary" onClick={() => setScreen('upload')}>
              Try it out
            </button>
          </nav>

          {/* Hero */}
          <div className="text-center mb-20">
            <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
              Your lecture. <br />
              <span className="gradient-text">Any language. Any doubt.</span>
            </h1>
            <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto mb-8">
              Upload a lecture or paste a YouTube link. Ask questions in Hindi, Tamil, Telugu, or any Indian language. VidyaBot answers in your language — by text and voice.
            </p>
            <button className="btn-primary text-lg px-8 py-4" onClick={() => setScreen('upload')}>
              Start Learning
            </button>
          </div>

          {/* How it works */}
          <div className="grid md:grid-cols-3 gap-6 mb-20">
            {[
              { icon: '1', title: 'Upload or paste', desc: 'Drop an audio/video file or paste a YouTube URL. We transcribe it using Sarvam AI.' },
              { icon: '2', title: 'Ask in any language', desc: 'Type or speak your question in Hindi, Tamil, English — any language you think in.' },
              { icon: '3', title: 'Get answers + quiz', desc: 'VidyaBot answers from the lecture in your language, with voice. Then test yourself with a quiz.' },
            ].map((step) => (
              <div key={step.icon} className="glass p-6 glass-hover">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white font-bold mb-4">
                  {step.icon}
                </div>
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-[var(--text-secondary)] text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>

          {/* Why I made this */}
          <div className="glass p-8 md:p-12 mb-20">
            <h2 className="text-2xl font-bold mb-6 gradient-text">Why I Made This</h2>
            <div className="text-[var(--text-secondary)] leading-relaxed space-y-4 text-[15px]">
              <p>
                A few months ago, an Urban Company didi came to my house for a service. While chatting, she told me she wants to raise her kids well, give them a good education — but she barely gets time, and she does not know English well enough to help them with school.
              </p>
              <p>
                That stuck with me. Because the knowledge is out there — YouTube is full of incredible lectures. But if you are a Hindi-speaking parent trying to help your child understand a biology lecture in English, you are locked out. Not because of intelligence. Because of language.
              </p>
              <p>
                I thought — what if there was a bot that could take any lecture, let you ask doubts in your own language, and explain things back to you in Hindi, Tamil, Telugu, whatever you speak? Not a translation tool. A tutor. One that listens to you, understands the lecture, and bridges the gap.
              </p>
              <p>
                That is VidyaBot. It uses Sarvam AI for speech and translation across Indian languages, and Claude as the brain that actually understands the content and teaches it back to you. Voice in, voice out. Your language. Your pace.
              </p>
              <p className="text-[var(--purple-300)] font-medium">
                Because learning should not have a language barrier.
              </p>
            </div>
          </div>

          {/* Tech */}
          <div className="text-center mb-12">
            <p className="text-sm text-[var(--text-secondary)]">
              Built with Sarvam AI (Saaras STT, Bulbul TTS, Mayura Translation) + Claude Sonnet + Next.js
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- UPLOAD SCREEN ---
  if (screen === 'upload') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <button
            className="text-[var(--text-secondary)] hover:text-[var(--purple-300)] mb-6 text-sm flex items-center gap-1"
            onClick={() => setScreen('landing')}
          >
            &larr; Back
          </button>

          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white font-bold text-sm">V</div>
            <h1 className="text-2xl font-bold">VidyaBot</h1>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                uploadTab === 'file'
                  ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white'
                  : 'text-[var(--text-secondary)] hover:text-white'
              }`}
              onClick={() => setUploadTab('file')}
            >
              Upload File
            </button>
            <button
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                uploadTab === 'youtube'
                  ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white'
                  : 'text-[var(--text-secondary)] hover:text-white'
              }`}
              onClick={() => setUploadTab('youtube')}
            >
              YouTube URL
            </button>
          </div>

          {uploadTab === 'file' ? (
            <div>
              <div
                className="upload-zone"
                onClick={() => fileInputRef.current?.click()}
              >
                {transcribing ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="spinner" style={{ width: 32, height: 32 }}></div>
                    <p className="text-[var(--text-secondary)]">Transcribing... this may take a minute for long files</p>
                  </div>
                ) : (
                  <>
                    <div className="text-4xl mb-3 opacity-50">&#127911;</div>
                    <p className="text-lg font-medium mb-2">Drop your lecture file here</p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      WAV, MP3, MP4, M4A, WEBM supported
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      WAV files work best for transcription
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/*,.wav,.mp3,.mp4,.m4a,.webm"
                className="hidden"
                onChange={handleFileUpload}
                disabled={transcribing}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <input
                type="text"
                className="input-dark"
                placeholder="Paste a YouTube URL here..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                disabled={transcribing}
                onKeyDown={(e) => e.key === 'Enter' && handleYoutubeSubmit()}
              />
              <button
                className="btn-primary w-full"
                onClick={handleYoutubeSubmit}
                disabled={transcribing || !youtubeUrl.trim()}
              >
                {transcribing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="spinner"></span> Downloading & transcribing...
                  </span>
                ) : (
                  'Transcribe Video'
                )}
              </button>
              <p className="text-xs text-[var(--text-secondary)]">
                Note: YouTube download requires yt-dlp on the server. If unavailable, download the audio and upload it above.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- QUIZ MODAL ---
  const QuizModal = () => {
    if (!showQuiz) return null;
    const q = quizQuestions[quizIndex];

    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="glass p-6 md:p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold gradient-text">Quiz</h2>
            <button
              className="text-[var(--text-secondary)] hover:text-white text-sm"
              onClick={() => setShowQuiz(false)}
            >
              Close
            </button>
          </div>

          {quizLoading ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <div className="spinner" style={{ width: 32, height: 32 }}></div>
              <p className="text-[var(--text-secondary)]">Generating quiz from lecture...</p>
            </div>
          ) : quizFinished ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">{quizScore >= 4 ? '&#127881;' : quizScore >= 2 ? '&#128170;' : '&#128218;'}</div>
              <h3 className="text-2xl font-bold mb-2">
                {quizScore} / {quizQuestions.length}
              </h3>
              <p className="text-[var(--text-secondary)] mb-6">
                {quizScore >= 4 ? 'Excellent! You know this material well.' : quizScore >= 2 ? 'Good effort! Review the lecture and try again.' : 'Keep studying — you will get there!'}
              </p>
              <div className="flex gap-3 justify-center">
                <button className="btn-secondary" onClick={() => setShowQuiz(false)}>
                  Back to Chat
                </button>
                <button className="btn-primary" onClick={handleGenerateQuiz}>
                  New Quiz
                </button>
              </div>
            </div>
          ) : q ? (
            <div>
              <p className="text-xs text-[var(--text-secondary)] mb-3 mono">
                Question {quizIndex + 1} of {quizQuestions.length}
              </p>
              <p className="text-[15px] font-medium mb-5 leading-relaxed">{q.question}</p>

              <div className="space-y-3 mb-6">
                {q.options.map((opt, i) => {
                  const answered = quizAnswers[quizIndex] !== null;
                  const isSelected = quizAnswers[quizIndex] === i;
                  const isCorrect = i === q.correct;
                  let className = 'quiz-option';
                  if (answered && isCorrect) className += ' correct';
                  else if (answered && isSelected && !isCorrect) className += ' incorrect';

                  return (
                    <button key={i} className={className} onClick={() => handleQuizAnswer(i)} disabled={answered}>
                      <span className="mono text-xs mr-2 opacity-50">{String.fromCharCode(65 + i)}.</span>
                      {opt}
                    </button>
                  );
                })}
              </div>

              {quizAnswers[quizIndex] !== null && (
                <div className="glass p-4 mb-4 text-sm">
                  <p className="text-[var(--purple-300)] font-medium mb-1">
                    {quizAnswers[quizIndex] === q.correct ? 'Correct!' : 'Incorrect'}
                  </p>
                  <p className="text-[var(--text-secondary)] leading-relaxed">{q.explanation}</p>
                </div>
              )}

              {quizAnswers[quizIndex] !== null && (
                <button
                  className="btn-primary w-full"
                  onClick={() => {
                    if (quizIndex < quizQuestions.length - 1) {
                      setQuizIndex(quizIndex + 1);
                    } else {
                      setQuizFinished(true);
                    }
                  }}
                >
                  {quizIndex < quizQuestions.length - 1 ? 'Next Question' : 'See Results'}
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  // --- CHAT SCREEN ---
  return (
    <div className="min-h-screen flex flex-col">
      <QuizModal />

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[rgba(168,85,247,0.1)]">
        <div className="flex items-center gap-3">
          <button
            className="text-[var(--text-secondary)] hover:text-[var(--purple-300)] text-sm"
            onClick={() => {
              setScreen('upload');
              setTranscript('');
              setMessages([]);
              setTranslatedTranscript('');
              setTranscriptLang('');
              setTranslatedAnswers({});
              setQuizQuestions([]);
            }}
          >
            &larr; New Lecture
          </button>
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white font-bold text-[10px]">V</div>
          <span className="font-semibold text-sm">VidyaBot</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary text-xs py-1 px-3" onClick={() => setShowTranscript(!showTranscript)}>
            {showTranscript ? 'Hide' : 'Show'} Transcript
          </button>
          <button className="btn-secondary text-xs py-1 px-3" onClick={handleGenerateQuiz}>
            Quiz Me
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Transcript panel */}
        {showTranscript && (
          <div className="w-80 border-r border-[rgba(168,85,247,0.1)] flex flex-col bg-[var(--bg-secondary)]">
            <div className="p-3 border-b border-[rgba(168,85,247,0.1)] flex items-center justify-between">
              <span className="text-sm font-medium">Transcript</span>
              <select
                value={transcriptLang}
                onChange={(e) => handleTranslateTranscript(e.target.value)}
              >
                <option value="">Original</option>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 overflow-y-auto p-3 text-sm text-[var(--text-secondary)] leading-relaxed">
              {translatedTranscript && transcriptLang ? translatedTranscript : transcript}
            </div>
          </div>
        )}

        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-4xl mb-3 opacity-30">&#128218;</div>
                  <p className="text-[var(--text-secondary)]">Lecture loaded! Ask your first question.</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">Type or use the mic — any language works.</p>
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div>
                  <div className={msg.role === 'user' ? 'chat-user' : 'chat-bot'}>
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-2 mt-2 ml-1">
                      {msg.audio && (
                        <button
                          className="text-xs text-[var(--purple-300)] hover:text-[var(--purple-200)]"
                          onClick={() => playAudio(msg.audio!)}
                        >
                          &#9654; Play
                        </button>
                      )}
                      <select
                        className="text-xs"
                        defaultValue=""
                        onChange={(e) => handleTranslateAnswer(idx, e.target.value)}
                        disabled={translatingIdx === idx}
                      >
                        <option value="">Translate</option>
                        {LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>{l.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {translatedAnswers[idx] && (
                    <div className="chat-bot mt-2 text-sm opacity-80">
                      <p className="whitespace-pre-wrap">{translatedAnswers[idx]}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="chat-bot flex items-center gap-2">
                  <div className="spinner"></div>
                  <span className="text-sm text-[var(--text-secondary)]">Thinking...</span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input area */}
          <div className="p-4 border-t border-[rgba(168,85,247,0.1)]">
            <div className="flex gap-3 items-center max-w-3xl mx-auto">
              <input
                type="text"
                className="input-dark flex-1"
                placeholder="Ask a question about the lecture..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                disabled={loading}
              />
              <button
                className={`mic-btn ${recording ? 'recording' : ''}`}
                onClick={recording ? stopRecording : startRecording}
                disabled={loading}
                title={recording ? 'Stop recording' : 'Start recording'}
              >
                {recording ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V23h2v-2.06A9 9 0 0 0 21 12v-2h-2z"/></svg>
                )}
              </button>
              <button className="btn-primary" onClick={handleAsk} disabled={loading || !input.trim()}>
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
