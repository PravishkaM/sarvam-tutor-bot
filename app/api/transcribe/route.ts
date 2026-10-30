import { NextRequest, NextResponse } from 'next/server';
import { speechToText } from '@/lib/sarvam';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'fs';
import path from 'path';

function isWav(buffer: Buffer): boolean {
  return buffer.length > 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE';
}

function convertToWav(inputBuffer: Buffer, filename: string): Buffer {
  const tmpDir = '/tmp/audio-convert';
  mkdirSync(tmpDir, { recursive: true });
  const inputPath = path.join(tmpDir, filename);
  const outputPath = path.join(tmpDir, 'output.wav');

  writeFileSync(inputPath, inputBuffer);
  execSync(`ffmpeg -y -i "${inputPath}" -ar 16000 -ac 1 -f wav "${outputPath}"`, {
    timeout: 120000,
  });

  const wavBuffer = readFileSync(outputPath) as Buffer<ArrayBuffer>;
  try { unlinkSync(inputPath); } catch {}
  try { unlinkSync(outputPath); } catch {}
  return wavBuffer;
}

function splitWavBuffer(wavBuffer: Buffer, chunkDurationSec: number = 25): Buffer[] {
  // Parse WAV header
  const sampleRate = wavBuffer.readUInt32LE(24);
  const bitsPerSample = wavBuffer.readUInt16LE(34);
  const numChannels = wavBuffer.readUInt16LE(22);
  const bytesPerSample = (bitsPerSample / 8) * numChannels;
  const bytesPerSecond = sampleRate * bytesPerSample;

  // Find data chunk
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

    // Build WAV header for this chunk
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + chunkDataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
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
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    let wavBuffer: Buffer;

    const fileBuffer = Buffer.from(arrayBuffer);

    if (isWav(fileBuffer)) {
      wavBuffer = fileBuffer;
    } else {
      wavBuffer = convertToWav(fileBuffer, file.name);
    }

    // Split into chunks
    const chunks = splitWavBuffer(wavBuffer);
    console.log(`Split audio into ${chunks.length} chunks`);

    // Transcribe each chunk
    const transcripts: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`Transcribing chunk ${i + 1}/${chunks.length}...`);
      const transcript = await speechToText(chunks[i].buffer as ArrayBuffer);
      transcripts.push(transcript);
    }

    const fullTranscript = transcripts.join(' ');
    return NextResponse.json({ transcript: fullTranscript });
  } catch (error: unknown) {
    console.error('Transcription error:', error);
    const message = error instanceof Error ? error.message : 'Transcription failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
