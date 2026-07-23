import { extractNewSentences, speechNormalize } from '../src/lib/speech-text'

// Simulate token-by-token streaming and check every sentence is spoken exactly once
const reply = 'Okay, that is 450,000 naira monthly. Do you contribute pension? It is 8% of gross. Also — do you pay NHF or NHIS today? Let me know.'
let consumed = 0
const spoken: string[] = []
for (let i = 1; i <= reply.length; i += 3) {
  const r = extractNewSentences(reply.slice(0, i), consumed)
  consumed = r.consumed
  spoken.push(...r.sentences)
}
// end-of-stream remainder
const remainder = reply.slice(consumed).trim()
if (remainder) spoken.push(remainder)

const rejoined = spoken.join(' ').replace(/\s+/g, ' ').trim()
const expected = reply.replace(/\s+/g, ' ').trim()
console.log('sentences spoken:', JSON.stringify(spoken, null, 0))
if (rejoined !== expected) { console.error('MISMATCH!\ngot:     ' + rejoined + '\nexpected:' + expected); process.exit(1) }

// normalization
const n = speechNormalize('Your PAYE is **₦53,727**/month (12%). See [details](https://x.y). ₦1,200,000 annually & NHF too.')
console.log('normalized:', n)
if (n.includes('₦') || n.includes('**') || n.includes('http')) { console.error('normalize failed'); process.exit(1) }
console.log('\nSPEECH PIPELINE LOGIC PASSES ✅')
