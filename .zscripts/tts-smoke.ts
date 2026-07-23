import { synthesize } from '../src/lib/edge-tts'
import { writeFileSync } from 'fs'

async function main() {
  const t0 = Date.now()
  const mp3 = await synthesize({
    text: 'Hello! This is Iroko. I can now speak with a real Nigerian voice, and I am ready to help you with anything.',
    voice: 'en-NG-EzinneNeural',
    rate: '-6%',
    pitch: '-2Hz',
  })
  console.log('bytes:', mp3.length, '| ms:', Date.now() - t0)
  const header = mp3.subarray(0, 3).toString('latin1')
  console.log('mp3 header ok:', header === 'ID3' || (mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0))
  writeFileSync('.zscripts/tts-sample.mp3', mp3)
  console.log('NATIVE EDGE TTS WORKS ✅')
}
main().catch((e) => { console.error('TTS FAILED:', e.message); process.exit(1) })
