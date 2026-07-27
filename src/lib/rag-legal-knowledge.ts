/**
 * Nigerian Legal Knowledge Retriever (RAG Engine for Iroko AI).
 *
 * Contains indexed statutory provisions, legal section citations, and regulatory
 * guidance for key Nigerian laws:
 * 1. Companies and Allied Matters Act (CAMA) 2020
 * 2. Lagos State Tenancy Law 2011 & Recovery of Premises Act
 * 3. Labour Act Cap L1 (LFN 2004)
 * 4. Nigeria Data Protection Act (NDPA) 2023
 * 5. Personal Income Tax Act (PITA) & Value Added Tax (VAT) Act
 */

export interface LegalStatuteSnippet {
  id: string
  act: string
  section: string
  title: string
  content: string
  keywords: string[]
}

export const NIGERIAN_LEGAL_STATUTES: LegalStatuteSnippet[] = [
  // --- CAMA 2020 ---
  {
    id: 'cama-2020-sec-27',
    act: 'Companies and Allied Matters Act (CAMA) 2020',
    section: 'Section 27',
    title: 'Minimum Issued Share Capital for Private Companies',
    content:
      'The minimum issued share capital for a private company limited by shares (LLC) under CAMA 2020 is ₦100,000 (one hundred thousand Naira). For public companies (PLC), the minimum issued share capital is ₦2,000,000.',
    keywords: ['cama', 'share capital', 'minimum capital', 'incorporation', 'llc', 'company registration'],
  },
  {
    id: 'cama-2020-sec-18',
    act: 'Companies and Allied Matters Act (CAMA) 2020',
    section: 'Section 18(2)',
    title: 'Single-Member Companies',
    content:
      'Under CAMA 2020, one person may form and incorporate a private company limited by shares, provided the statutory requirements for incorporation are satisfied.',
    keywords: ['cama', 'single member', 'one person company', 'sole shareholder', 'incorporation'],
  },
  {
    id: 'cama-2020-sec-852',
    act: 'Companies and Allied Matters Act (CAMA) 2020',
    section: 'Section 852',
    title: 'Business Name Registration Rules & Reservation',
    content:
      'Every individual or firm carrying on business under a business name which does not consist of the true surnames of all partners or individuals must register the name with the Corporate Affairs Commission (CAC) within 28 days of commencement.',
    keywords: ['cac', 'business name', 'registration', 'sole proprietorship', 'cama', 'naming rules'],
  },
  {
    id: 'cama-2020-sec-263',
    act: 'Companies and Allied Matters Act (CAMA) 2020',
    section: 'Section 263',
    title: 'Board Resolutions & Directors Meetings',
    content:
      'Directors may pass resolutions at formal meetings or by written resolution signed by all directors entitled to receive notice of a meeting of directors.',
    keywords: ['board resolution', 'directors', 'cama', 'bank account', 'minutes', 'corporate governance'],
  },

  // --- LAGOS STATE TENANCY LAW 2011 & RECOVERY OF PREMISES ---
  {
    id: 'lagos-tenancy-sec-13',
    act: 'Lagos State Tenancy Law 2011',
    section: 'Section 13',
    title: 'Statutory Periods of Notice to Quit',
    content:
      'Where there is no express agreement as to notice, the statutory periods of notice to quit shall be: (a) 1 week notice for a weekly tenancy; (b) 1 month notice for a monthly tenancy; (c) 1 quarter (3 months) notice for a quarterly tenancy; (d) 6 months notice for a yearly tenancy.',
    keywords: ['tenancy', 'notice to quit', 'eviction', 'lagos tenancy law', '6 months notice', '30 days notice', 'landlord'],
  },
  {
    id: 'lagos-tenancy-sec-16',
    act: 'Lagos State Tenancy Law 2011',
    section: 'Section 16',
    title: '7-Day Notice of Owner’s Intention to Apply to Recover Possession',
    content:
      'Upon the expiration of a Notice to Quit or the determination of the tenancy, if the tenant neglects or refuses to deliver up possession, the landlord shall serve a written 7-Day Notice of Owner’s Intention to Apply to Recover Possession.',
    keywords: ['7 day notice', 'recovery of possession', 'eviction court', 'lagos tenancy', 'premises act'],
  },
  {
    id: 'lagos-tenancy-sec-44',
    act: 'Lagos State Tenancy Law 2011',
    section: 'Section 44',
    title: 'Unlawful Eviction & Forceful Ejection Penalty',
    content:
      'Any landlord or person who forcibly ejects a tenant, changes locks, removes doors, or cuts off amenities without a court order commits an offence punishable by a fine or imprisonment up to 6 months.',
    keywords: ['unlawful eviction', 'illegal ejection', 'landlord lock out', 'forced eviction', 'tenant rights'],
  },

  // --- LABOUR ACT CAP L1 ---
  {
    id: 'labour-act-sec-11',
    act: 'Labour Act (Cap L1, Laws of the Federation of Nigeria 2004)',
    section: 'Section 11',
    title: 'Statutory Notice for Termination of Employment Contract',
    content:
      'Minimum notice to terminate employment: (a) 1 day for service up to 3 months; (b) 1 week for service 3 months to 2 years; (c) 2 weeks for service 2 to 5 years; (d) 1 month for service over 5 years. Either party may pay salary in lieu of notice.',
    keywords: ['labour act', 'employment contract', 'termination notice', 'notice period', 'salary in lieu'],
  },
  {
    id: 'labour-act-sec-18',
    act: 'Labour Act (Cap L1, Laws of the Federation of Nigeria 2004)',
    section: 'Section 18',
    title: 'Annual Holiday with Pay (Annual Leave)',
    content:
      'Every worker is entitled after 12 months continuous service to a holiday with full pay of at least 6 working days (or as specified in contract/company policy, typically 15 to 21 working days).',
    keywords: ['annual leave', 'leave days', 'labour act', 'paid leave', 'employment rights'],
  },

  // --- NIGERIA DATA PROTECTION ACT (NDPA) 2023 ---
  {
    id: 'ndpa-2023-sec-24',
    act: 'Nigeria Data Protection Act (NDPA) 2023',
    section: 'Section 24 & 25',
    title: 'Principles & Lawful Basis of Personal Data Processing',
    content:
      'Personal data must be processed lawfully, fairly, and transparently. Lawful bases include: data subject consent, performance of a contract, legal obligation, vital interest, or legitimate interest.',
    keywords: ['ndpa', 'data protection', 'privacy', 'personal data', 'consent', 'ndpc'],
  },

  // --- TAX LAWS (PITA & VAT) ---
  {
    id: 'pita-paye-schedule-6',
    act: 'Personal Income Tax Act (PITA) Cap P8 LFN 2004 (as amended)',
    section: '6th Schedule',
    title: 'Consolidated Relief Allowance (CRA) & PAYE Graduated Bands',
    content:
      'Consolidated Relief Allowance (CRA) is calculated as ₦200,000 or 1% of Gross Income (whichever is higher) PLUS 20% of Gross Income. Taxable income is taxed across graduated bands: 7% (first ₦300k), 11% (next ₦300k), 15% (next ₦500k), 19% (next ₦500k), 21% (next ₦1.6m), 24% (above ₦3.2m).',
    keywords: ['paye', 'pita', 'tax calculation', 'cra', 'personal income tax', 'firs'],
  },
  {
    id: 'vat-act-sec-4',
    act: 'Value Added Tax (VAT) Act Cap V1 LFN 2004 (as amended)',
    section: 'Section 4',
    title: 'Standard VAT Rate (7.5%)',
    content:
      'Value Added Tax is charged at the rate of 7.5% on the supply of taxable goods and services in Nigeria, unless explicitly zero-rated or exempt under the First Schedule.',
    keywords: ['vat', '7.5%', 'value added tax', 'firs invoice', 'taxable goods'],
  },
]

/**
 * Search the Nigerian legal statutes knowledge base for relevant sections and citations.
 */
export function searchNigerianLaw(query: string, maxResults = 3): LegalStatuteSnippet[] {
  if (!query || query.trim().length === 0) return []

  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 2)

  const scored = NIGERIAN_LEGAL_STATUTES.map((snippet) => {
    let score = 0
    const textToSearch = `${snippet.act} ${snippet.section} ${snippet.title} ${snippet.content} ${snippet.keywords.join(' ')}`.toLowerCase()

    for (const token of tokens) {
      if (textToSearch.includes(token)) {
        score += 2
      }
      if (snippet.keywords.some((k) => k.toLowerCase().includes(token))) {
        score += 3
      }
    }

    return { snippet, score }
  })

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((item) => item.snippet)
}
