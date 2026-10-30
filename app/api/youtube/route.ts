import { NextRequest, NextResponse } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
    }

    // Validate YouTube URL and extract video ID
    const ytRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]+)/;
    const match = url.match(ytRegex);
    if (!match) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    const videoId = match[1];

    try {
      const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);

      if (!transcriptItems || transcriptItems.length === 0) {
        return NextResponse.json(
          { error: 'No captions available for this video. The video may not have subtitles enabled.' },
          { status: 400 }
        );
      }

      // Combine all transcript segments into one string
      const fullTranscript = transcriptItems.map((item) => item.text).join(' ');

      return NextResponse.json({ transcript: fullTranscript });
    } catch (e) {
      console.error('YouTube transcript fetch error:', e);
      return NextResponse.json(
        { error: 'Could not fetch captions for this video. It may not have subtitles, or may be restricted.' },
        { status: 400 }
      );
    }
  } catch (error: unknown) {
    console.error('YouTube route error:', error);
    const message = error instanceof Error ? error.message : 'YouTube transcription failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
