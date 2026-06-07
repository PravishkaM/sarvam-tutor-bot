import { NextRequest, NextResponse } from 'next/server'
import { speechToText } from '@/lib/sarvam'
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

function convertToWav(inputBuffer: Buffer, originalName: string): Buffer {
  const id = randomUUID()
  const tmpDir = tmpdir()
  const inputPath = join(tmpDir, `${id}_input_${originalName}`)
  const outputPath = join(tmpDir, `${id}_output.wav`)

  try {
    writeFileSync(inputPath, inputBuffer)
    execSync(
      `ffmpeg -i "${inputPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${outputPath}" -y`,
      { timeout: 120000, stdio: 'pipe' }
    )
    const wavBuffer = readFileSync(outputPath)
    return wavBuffer
  } finally {
    if (existsSync(inputPath)) unlinkSync(inputPath)
    if (existsSync(outputPath)) unlinkSync(outputPath)
  }
}

function splitWavBuffer(buffer: Buffer, chunkSeconds: number = 25): Buffer[] {
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

    const chunkBuffer = Buffer.alloc(44 + chunkDataSize)
    chunkBuffer.write('RIFF', 0)
    chunkBuffer.writeUInt32LE(36 + chunkDataSize, 4)
    chunkBuffer.write('WAVE', 8)
    chunkBuffer.write('fmt ', 12)
    chunkBuffer.writeUInt32LE(16, 16)
    chunkBuffer.writeUInt16LE(1, 20)
    chunkBuffer.writeUInt16LE(numChannels, 22)
    chunkBuffer.writeUInt32LE(sampleRate, 24)
    chunkBuffer.writeUInt32LE(bytesPerSecond, 28)
    chunkBuffer.writeUInt16LE(blockAlign, 32)
    chunkBuffer.writeUInt16LE(bitsPerSample, 34)
    chunkBuffer.write('data', 36)
    chunkBuffer.writeUInt32LE(chunkDataSize, 40)

    buffer.copy(chunkBuffer, 44, dataStart + offset, dataStart + end)
    chunks.push(chunkBuffer)
  }

  return chunks
}

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

    let buffer = Buffer.from(await file.arrayBuffer())

    if (!isWav(buffer)) {
      console.log(`Converting ${file.name} to WAV...`)
      try {
        buffer = convertToWav(buffer, file.name)
        console.log(`Conversion done. WAV size: ${(buffer.length / 1024 / 1024).toFixed(1)}MB`)
      } catch (err) {
        console.error('ffmpeg conversion failed:', err)
        return NextResponse.json({ error: 'Could not convert file to WAV. Please upload a WAV file.' }, { status: 400 })
      }
    }

    if (mode === 'chunked' || buffer.length > 5 * 1024 * 1024) {
      const chunks = splitWavBuffer(buffer, 25)
      let fullTranscript = ''

      for (let i = 0; i < chunks.length; i++) {
        try {
          console.log(`Transcribing chunk ${i + 1}/${chunks.length}...`)
          const transcript = await speechToText(chunks[i])
          fullTranscript += (transcript || '') + ' '
        } catch (err) {
          console.error(`Chunk ${i + 1}/${chunks.length} failed:`, err)
          continue
        }
      }

      return NextResponse.json({
        transcript: fullTranscript.trim(),
        chunks: chunks.length,
      })
    }

    const transcript = await speechToText(buffer)
    return NextResponse.json({ transcript })
  } catch (err: any) {
    console.error('Transcribe error:', err)
    return NextResponse.json({ error: err.message || 'Transcription failed' }, { status: 500 })
  }
}