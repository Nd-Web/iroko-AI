import { webSearch } from '../src/lib/web-search'
import { fetchReadable } from '../src/lib/web-fetch'

async function main() {
  console.log('1. web_search (keyless DuckDuckGo):')
  const s = await webSearch('CAC business name registration fee Nigeria 2026', 4)
  console.log('   provider:', s.provider, '| results:', s.results.length, s.note ? '| note: ' + s.note : '')
  for (const r of s.results.slice(0, 3)) console.log('   -', r.title.slice(0, 70), '→', r.url.slice(0, 60))

  console.log('\n2. fetch_url (read a page):')
  const url = s.results[0]?.url || 'https://www.cac.gov.ng/'
  const f = await fetchReadable(url)
  console.log('   ok:', f.ok, '| title:', (f.title || '').slice(0, 60), '| text chars:', f.text?.length ?? 0, f.note ? '| note: ' + f.note : '')
  if (f.text) console.log('   preview:', f.text.slice(0, 160).replace(/\n/g, ' '))

  console.log('\n3. SSRF guard (must block localhost & metadata IP):')
  const b1 = await fetchReadable('http://localhost:3000/api/tasks')
  const b2 = await fetchReadable('http://169.254.169.254/latest/meta-data/')
  console.log('   localhost blocked:', !b1.ok, '| metadata IP blocked:', !b2.ok)
  if (b1.ok || b2.ok) { console.error('SSRF GUARD FAILED'); process.exit(1) }

  console.log('\nWEB BROWSING WORKS ✅')
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
