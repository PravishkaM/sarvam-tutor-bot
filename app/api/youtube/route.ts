import { NextRequest, NextResponse } from 'next/server';

async function fetchYoutubeTranscript(videoId: string): Promise<string> {
  // Step 1: Use YouTube's innertube API to get video info including captions
  const innertubeRes = await fetch('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20240101.00.00',
          hl: 'en',
        },
      },
      videoId,
    }),
  });

  if (!innertubeRes.ok) {
    throw new Error(`YouTube API returned ${innertubeRes.status}`);
  }

  const data = await innertubeRes.json();

  // Extract caption tracks
  const captions = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!captions || captions.length === 0) {
    throw new Error('No captions available for this video. It may not have subtitles enabled.');
  }

  // Prefer English auto-generated or manual captions
  const track =
    captions.find((t: { languageCode: string }) => t.languageCode === 'en') ||
    captions.find((t: { languageCode: string }) => t.languageCode.startsWith('en')) ||
    captions[0];

  const captionUrl = track.baseUrl;
  if (!captionUrl) {
    throw new Error('No caption URL found.');
  }

  // Step 2: Fetch the captions XML
  const captionRes = await fetch(captionUrl);
  if (!captionRes.ok) {
    throw new Error(`Failed to fetch captions (${captionRes.status})`);
  }

  const captionXml = await captionRes.text();

  // Step 3: Parse XML to extract text
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
