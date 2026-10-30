import { NextRequest, NextResponse } from 'next/server';

async function fetchYoutubeTranscript(videoId: string): Promise<string> {
  // Fetch the YouTube watch page to extract caption track URLs
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(watchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch YouTube page (${res.status})`);
  }

  const html = await res.text();

  // Extract caption tracks from the page data
  const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
  if (!captionMatch) {
    throw new Error('No captions found. This video may not have subtitles enabled.');
  }

  let captionTracks;
  try {
    captionTracks = JSON.parse(captionMatch[1]);
  } catch {
    throw new Error('Failed to parse caption data.');
  }

  if (!captionTracks.length) {
    throw new Error('No caption tracks available.');
  }

  // Prefer English, otherwise take the first available track
  const track = captionTracks.find((t: { languageCode: string }) => t.languageCode === 'en') || captionTracks[0];
  const captionUrl = track.baseUrl;

  if (!captionUrl) {
    throw new Error('No caption URL found.');
  }

  // Fetch the captions XML
  const captionRes = await fetch(captionUrl);
  if (!captionRes.ok) {
    throw new Error(`Failed to fetch captions (${captionRes.status})`);
  }

  const captionXml = await captionRes.text();

  // Parse XML to extract text segments
  const textSegments = captionXml.match(/<text[^>]*>[^<]*<\/text>/g) || [];
  const transcriptText = textSegments
    .map((seg: string) => {
      const textMatch = seg.match(/<text[^>]*>([^<]*)<\/text>/);
      return textMatch
        ? textMatch[1]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\n/g, ' ')
            .trim()
        : '';
    })
    .filter(Boolean)
    .join(' ');

  if (!transcriptText) {
    throw new Error('Could not extract text from captions.');
  }

  return transcriptText;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
    }

    // Extract video ID
    const ytRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]+)/;
    const match = url.match(ytRegex);
    if (!match) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    const videoId = match[1];
    const transcript = await fetchYoutubeTranscript(videoId);

    return NextResponse.json({ transcript });
  } catch (error: unknown) {
    console.error('YouTube transcript error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch transcript';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
