import { NextRequest, NextResponse } from 'next/server'
import { speechToText } from '@/lib/sarvam'

// Split a WAV buffer into chunks by time
function splitWavBuffer(buffer: Buffer, chunkSeconds: number = 25): Buffer[] {
  // WAV header is 44 bytes
  if (buffer.length < 44) return [buffer]

  const sampleRate = buffer.readUInt32LE(24)
  const numChannels = buffer.readUInt16LE(22)
  const bitsPerSample = buffer.readUInt16LE(34)
  const bytesPerSample = bitsPerSample / 8
  const blockAlign = numChannels * bytesPerSample
  const bytesPerSecond = sampleRate * blockAlign
  const dataStart = 44
  const dataSize = buffer.length - dataStart
  const chunkByteSize = Math.floor(chunkSeconds * bytesPerSecond)

  const chunks: Buffer[] = []

  for (let offset = 0; offset < dataSize; offset += chunkByteSize) {
    const end = Math.min(offset + chunkByteSize, dataSize)
    const chunkDataSize = end - offset

    // Build a new WAV file for this chunk
    const chunkBuffer = Buffer.alloc(44 + chunkDataSize)

    // Write WAV header
    chunkBuffer.write('RIFF', 0)
    chunkBuffer.writeUInt32LE(36 + chunkDataSize, 4)
    chunkBuffer.write('WAVE', 8)
    chunkBuffer.write('fmt ', 12)
    chunkBuffer.writeUInt32LE(16, 16) // fmt chunk size
    chunkBuffer.writeUInt16LE(1, 20) // PCM
    chunkBuffer.writeUInt16LE(numChannels, 22)
    chunkBuffer.writeUInt32LE(sampleRate, 24)
    chunkBuffer.writeUInt32LE(bytesPerSecond, 28)
    chunkBuffer.writeUInt16LE(blockAlign, 32)
    chunkBuffer.writeUInt16LE(bitsPerSample, 34)
    chunkBuffer.write('data', 36)
    chunkBuffer.writeUInt32LE(chunkDataSize, 40)

    // Copy PCM data
    buffer.copy(chunkBuffer, 44, dataStart + offset, dataStart + end)
    chunks.push(chunkBuffer)
  }

  return chunks
}

// Check if a buffer looks like a WAV file
function isWav(buffer: Buffer): boolean {
  return buffer.length > 44 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE'
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const mode = (formData.get('mode') as string) || 'single'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // If mode is 'chunked' or file is large, split and transcribe all chunks
    if (mode === 'chunked' || buffer.length > 5 * 1024 * 1024) {
      let chunks: Buffer[]

      if (isWav(buffer)) {
        chunks = splitWavBuffer(buffer, 25)
      } else {
        // For non-WAV files, try as a single file (may fail if too large)
        chunks = [buffer]
      }

      let fullTranscript = ''
      const totalChunks = chunks.length

      for (let i = 0; i < chunks.length; i++) {
        try {
          const transcript = await speechToText(chunks[i])
          fullTranscript += (transcript || '') + ' '
        } catch (err) {
          console.error(`Chunk ${i + 1}/${totalChunks} failed:`, err)
          continue
        }
      }

      return NextResponse.json({
        transcript: fullTranscript.trim(),
        chunks: totalChunks,
      })
    }

    // Small file — transcribe directly
    const transcript = await speechToText(buffer)
    return NextResponse.json({ transcript })
  } catch (err: any) {
    console.error('Transcribe error:', err)
    return NextResponse.json({ error: err.message || 'Transcription failed' }, { status: 500 })
  }
}
