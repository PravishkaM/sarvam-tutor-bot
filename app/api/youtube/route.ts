import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { readFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { speechToText } from '@/lib/sarvam';

function splitWavBuffer(wavBuffer: Buffer, chunkDurationSec: number = 25): Buffer[] {
  const sampleRate = wavBuffer.readUInt32LE(24);
  const bitsPerSample = wavBuffer.readUInt16LE(34);
  const numChannels = wavBuffer.readUInt16LE(22);
  const bytesPerSample = (bitsPerSample / 8) * numChannels;
  const bytesPerSecond = sampleRate * bytesPerSample;

  let dataOffset = 12;
  while (dataOffset < wavBuffer.length - 8) {
    const chunkId = wavBuffer.toString('ascii', dataOffset, dataOffset + 4);
    const chunkSize = wavBuffer.readUInt32LE(dataOffset + 4);
    if (chunkId === 'data') {
      dataOffset += 8;
      break;
    }
    dataOffset += 8 + chunkSize;
  }

  const headerSize = dataOffset;
  const dataSize = wavBuffer.length - headerSize;
  const chunkBytes = bytesPerSecond * chunkDurationSec;
  const chunks: Buffer[] = [];

  for (let offset = 0; offset < dataSize; offset += chunkBytes) {
    const end = Math.min(offset + chunkBytes, dataSize);
    const chunkDataSize = end - offset;

    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + chunkDataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(bytesPerSecond, 28);
    header.writeUInt16LE(bytesPerSample, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(chunkDataSize, 40);

    const chunkData = wavBuffer.subarray(headerSize + offset, headerSize + end);
    chunks.push(Buffer.concat([header, chunkData]));
  }

  return chunks;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
    }

    // Validate YouTube URL
    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[\w-]+/;
    if (!ytRegex.test(url)) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    const tmpDir = '/tmp/yt-download';
    mkdirSync(tmpDir, { recursive: true });
    const outputPath = path.join(tmpDir, 'yt_audio.wav');

    // Check if yt-dlp is available
    try {
      execSync('which yt-dlp', { timeout: 5000 });
    } catch {
      return NextResponse.json(
        { error: 'YouTube download is not available on this server. Please download the audio file and upload it directly.' },
        { status: 501 }
      );
    }

    // Download audio with yt-dlp and convert to WAV
    try {
      execSync(
        `yt-dlp -x --audio-format wav --audio-quality 0 -o "${tmpDir}/yt_audio.%(ext)s" --no-playlist --max-filesize 100M "${url}"`,
        { timeout: 180000 }
      );

      // yt-dlp might output with different extensions, convert to wav
      if (!existsSync(outputPath)) {
        // Find whatever file was downloaded
        const files = execSync(`ls ${tmpDir}/yt_audio.*`).toString().trim().split('\n');
        if (files.length > 0 && files[0]) {
          execSync(`ffmpeg -y -i "${files[0]}" -ar 16000 -ac 1 -f wav "${outputPath}"`, { timeout: 120000 });
        }
      }
    } catch (e) {
      console.error('yt-dlp error:', e);
      return NextResponse.json(
        { error: 'Failed to download YouTube audio. The video might be too long, restricted, or unavailable.' },
        { status: 400 }
      );
    }

    if (!existsSync(outputPath)) {
      return NextResponse.json({ error: 'Failed to process YouTube audio' }, { status: 500 });
    }

    const wavBuffer = readFileSync(outputPath) as Buffer<ArrayBuffer>;

    // Clean up
    try { execSync(`rm -f ${tmpDir}/yt_audio.*`); } catch {}

    // Split and transcribe
    const chunks = splitWavBuffer(wavBuffer);
    console.log(`YouTube: Split audio into ${chunks.length} chunks`);

    const transcripts: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`Transcribing YouTube chunk ${i + 1}/${chunks.length}...`);
      const transcript = await speechToText(chunks[i].buffer as ArrayBuffer);
      transcripts.push(transcript);
    }

    const fullTranscript = transcripts.join(' ');
    return NextResponse.json({ transcript: fullTranscript });
  } catch (error: unknown) {
    console.error('YouTube transcription error:', error);
    const message = error instanceof Error ? error.message : 'YouTube transcription failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
