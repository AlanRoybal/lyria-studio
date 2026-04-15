/**
 * Standalone Lyria Realtime API test.
 * Connects via WebSocket, streams ~10 seconds of audio, saves to lyria-test.wav
 *
 * Usage:
 *   GEMINI_API_KEY=your_key node test-lyria.mjs
 */

import { GoogleGenAI } from '@google/genai'
import fs from 'fs'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
if (!GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY environment variable is not set.')
  console.error('  Usage: GEMINI_API_KEY=your_key node test-lyria.mjs')
  process.exit(1)
}

const SAMPLE_RATE = 48000   // Lyria realtime default
const CHANNELS = 2           // stereo
const RECORD_SECONDS = 10    // how long to collect audio

const client = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
  apiVersion: 'v1alpha',
})

// PCM Int16 chunks collected during the session
const pcmChunks = []

function writeWav(pcmChunks, outPath, sampleRate, channels) {
  const totalPcmBytes = pcmChunks.reduce((s, b) => s + b.length, 0)
  const dataSize = totalPcmBytes
  const headerSize = 44
  const buf = Buffer.alloc(headerSize + dataSize)

  // RIFF header
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  // fmt chunk
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)           // chunk size
  buf.writeUInt16LE(1, 20)            // PCM
  buf.writeUInt16LE(channels, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * channels * 2, 28) // byte rate
  buf.writeUInt16LE(channels * 2, 32) // block align
  buf.writeUInt16LE(16, 34)           // bits per sample
  // data chunk
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)

  let offset = headerSize
  for (const chunk of pcmChunks) {
    chunk.copy(buf, offset)
    offset += chunk.length
  }

  fs.writeFileSync(outPath, buf)
  console.log(`\n[test] WAV saved → ${outPath}  (${(dataSize / 1024).toFixed(1)} KB)`)
}

async function main() {
  console.log('[test] Connecting to Lyria Realtime…')

  const session = await client.live.music.connect({
    model: 'models/lyria-realtime-exp',
    callbacks: {
      onmessage: (message) => {
        if (message.serverContent?.audioChunks) {
          for (const chunk of message.serverContent.audioChunks) {
            const buf = Buffer.from(chunk.data, 'base64')
            pcmChunks.push(buf)
            process.stdout.write('.')
          }
        }
      },
      onerror: (error) => {
        console.error('\n[test] Session error:', error)
      },
      onclose: () => {
        console.log('\n[test] Session closed.')
      },
    },
  })

  console.log('[test] Connected. Sending prompts…')

  await session.setWeightedPrompts({
    weightedPrompts: [
      {
        text: 'opera music think strings and swells that convey emotion',
        weight: 1.0,
      },
    ],
  })

  await session.setMusicGenerationConfig({
    musicGenerationConfig: {
      bpm: 120,
      temperature: 1.0,
    },
  })

  console.log(`[test] Playing — collecting ${RECORD_SECONDS}s of audio chunks…`)
  await session.play()

  // Collect audio for RECORD_SECONDS then stop
  await new Promise((resolve) => setTimeout(resolve, RECORD_SECONDS * 1000))

  console.log('\n[test] Stopping session…')
  await session.stop()

  if (pcmChunks.length === 0) {
    console.error('[test] No audio chunks received — something went wrong.')
    process.exit(1)
  }

  writeWav(pcmChunks, 'lyria-test.wav', SAMPLE_RATE, CHANNELS)
  console.log('[test] Done. Open lyria-test.wav to verify audio.')
}

main().catch((err) => {
  console.error('[test] Fatal:', err)
  process.exit(1)
})
