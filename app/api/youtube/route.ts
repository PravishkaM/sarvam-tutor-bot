import { NextRequest, NextResponse } from 'next/server';

const SUPADATA_API_KEY = process.env.SUPADATA_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
    }

    const ytRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]+)/;
    if (!ytRegex.test(url)) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    if (!SUPADATA_API_KEY) {
      return NextResponse.json(
        { error: 'YouTube import is not configured. Please use the Paste Transcript tab instead.' },
        { status: 501 }
      );
    }

    const apiUrl = `https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(url)}&text=true`;
    const res = await fetch(apiUrl, {
      headers: { 'x-api-key': SUPADATA_API_KEY },
    });

    const raw = await res.text();
    if (!res.ok) {
      console.error('Supadata error:', res.status, raw);
      return NextResponse.json(
        { error: `Could not fetch captions (${res.status}). The video may not have subtitles. Try the Paste Transcript tab.` },
        { status: 400 }
      );
    }

    const data = JSON.parse(raw);
    // With text=true, content is a string; otherwise it's an array of segments
    const transcript: string =
      typeof data.content === 'string'
        ? data.content
        : Array.isArray(data.content)
          ? data.content.map((s: { text: string }) => s.text).join(' ')
          : '';

    if (!transcript.trim()) {
      return NextResponse.json(
        { error: 'This video has no captions available. Try the Paste Transcript tab.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ transcript: transcript.trim() });
  } catch (error: unknown) {
    console.error('YouTube route error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch transcript';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
