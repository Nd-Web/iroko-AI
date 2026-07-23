/**
 * Nigerian legal/business document templates for the Iroko AI document generator.
 * Each template declares the fields to collect; the AI then drafts a complete,
 * Nigerian-law-aware document from the user's inputs.
 */

export type FieldKind = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'money'

export interface DocField {
  id: string
  label: string
  kind: FieldKind
  placeholder?: string
  required?: boolean
  options?: string[]
  help?: string
  /** default value */
  default?: string
}

export interface DocTemplate {
  id: string
  name: string
  description: string
  icon: string
  category: 'legal' | 'business' | 'finance'
  fields: DocField[]
  /** guidance appended to the AI prompt specific to this doc */
  draftingNotes: string
}

export const DOC_TEMPLATES: DocTemplate[] = [
  {
    id: 'tenancy',
    name: 'Tenancy Agreement',
    description: 'Residential tenancy agreement under Nigerian law (Lagos-style).',
    icon: 'Home',
    category: 'legal',
    draftingNotes:
      'Draft a residential tenancy agreement compliant with the Recovery of Premises Act and Lagos State tenancy law. ' +
      'Include parties, property description, term, rent (in ₦), payment terms, duties of both parties, ' +
      'notice to quit (statutory 6 months for monthly/quarterly, or as agreed), dispute resolution, and signature blocks. ' +
      'Add a clause that the tenant must not use the premises for illegal purposes and that the landlord must keep the structure sound.',
    fields: [
      { id: 'landlord', label: 'Landlord full name & address', kind: 'text', placeholder: 'Chief Ade Okafor, 12 Allen Ave, Ikeja', required: true },
      { id: 'tenant', label: 'Tenant full name & address', kind: 'text', placeholder: 'Ngozi Eze, c/o the premises', required: true },
      { id: 'property', label: 'Property address', kind: 'text', placeholder: 'Flat 4, 5 Adeniyi Jones, Ikeja, Lagos', required: true },
      { id: 'term', label: 'Tenancy term', kind: 'select', options: ['1 year', '2 years', '6 months', '3 months'], default: '1 year', required: true },
      { id: 'rent', label: 'Annual rent (₦)', kind: 'money', placeholder: '1,200,000', required: true },
      { id: 'paymentFreq', label: 'Payment frequency', kind: 'select', options: ['Annually', 'Bi-annually', 'Quarterly', 'Monthly'], default: 'Annually' },
      { id: 'commencement', label: 'Commencement date', kind: 'date' },
      { id: 'deposit', label: 'Security/caution deposit (₦)', kind: 'money', placeholder: '200,000' },
    ],
  },
  {
    id: 'partnership',
    name: 'Partnership Agreement',
    description: 'General partnership agreement between two or more Nigerian partners.',
    icon: 'Handshake',
    category: 'legal',
    draftingNotes:
      'Draft a partnership agreement under the Partnership Law of Nigeria. ' +
      'Include firm name, partners, contributions (capital/in kind), profit/loss sharing, management duties, ' +
      'admission/withdrawal of partners, dissolution, governing law, and signature blocks. ' +
      'Use clear numbered clauses.',
    fields: [
      { id: 'firmName', label: 'Firm name', kind: 'text', placeholder: 'Eze & Sons Enterprises', required: true },
      { id: 'partners', label: 'Partner names & addresses', kind: 'textarea', placeholder: '1. Ngozi Eze, Lekki, Lagos\n2. Tunde Bello, Surulere, Lagos', required: true },
      { id: 'business', label: 'Nature of business', kind: 'text', placeholder: 'General merchandising and logistics', required: true },
      { id: 'capital', label: 'Total capital contributed (₦)', kind: 'money', placeholder: '5,000,000' },
      { id: 'profitSharing', label: 'Profit/loss sharing', kind: 'select', options: ['Equally', 'In proportion to capital', 'As specified below'], default: 'Equally' },
      { id: 'commencement', label: 'Commencement date', kind: 'date' },
    ],
  },
  {
    id: 'employment',
    name: 'Employment Contract',
    description: 'Employment contract compliant with the Nigerian Labour Act.',
    icon: 'Briefcase',
    category: 'legal',
    draftingNotes:
      'Draft an employment contract compliant with the Labour Act (Cap L1, LFN 2004). ' +
      'Include employer, employee, position, probation, remuneration (₦), hours, leave, termination notice ' +
      '(per the Act: 1 day–1 week pay ≤3 months, etc.), confidentiality, and signature blocks.',
    fields: [
      { id: 'employer', label: 'Employer (company) name', kind: 'text', placeholder: 'Iroko Technologies Limited', required: true },
      { id: 'employee', label: 'Employee name & address', kind: 'text', placeholder: 'Chidi Okafor, Yaba, Lagos', required: true },
      { id: 'position', label: 'Job title', kind: 'text', placeholder: 'Operations Manager', required: true },
      { id: 'salary', label: 'Monthly gross salary (₦)', kind: 'money', placeholder: '350,000', required: true },
      { id: 'probation', label: 'Probation period', kind: 'select', options: ['3 months', '6 months', 'None'], default: '3 months' },
      { id: 'commencement', label: 'Start date', kind: 'date' },
      { id: 'leave', label: 'Annual leave (days)', kind: 'number', default: '21' },
    ],
  },
  {
    id: 'invoice',
    name: 'Service Invoice',
    description: 'Professional service invoice with VAT (7.5%) calculated.',
    icon: 'ReceiptText',
    category: 'finance',
    draftingNotes:
      'Generate a clean, professional service invoice. Include seller & buyer, invoice number, date, ' +
      'line items with quantities and unit prices in ₦, subtotal, VAT at 7.5%, and total. ' +
      'Add payment instructions (Nigerian bank transfer) and a thank-you note.',
    fields: [
      { id: 'seller', label: 'Your business name & address', kind: 'text', placeholder: 'Iroko Technologies Ltd, Ikeja, Lagos', required: true },
      { id: 'buyer', label: 'Client name & address', kind: 'text', placeholder: 'Acme Ltd, Victoria Island, Lagos', required: true },
      { id: 'invoiceNo', label: 'Invoice number', kind: 'text', placeholder: 'INV-2024-001', default: 'INV-2024-001', required: true },
      { id: 'date', label: 'Invoice date', kind: 'date' },
      { id: 'items', label: 'Line items (description — qty × unit price ₦)', kind: 'textarea', placeholder: 'Web design — 1 × 450000\nHosting (1yr) — 1 × 80000', required: true },
    ],
  },
  {
    id: 'memorandum',
    name: 'Company Memorandum (preview)',
    description: 'Preview CAC Memorandum of Understanding for an LLC.',
    icon: 'FileText',
    category: 'business',
    draftingNotes:
      'Draft a CAC-style Memorandum of Association for a private company limited by shares (Form CAC 1.1 era). ' +
      'Include the company name clause, registered office (Lagos/Abuja/etc.), objects clause, ' +
      'share capital (minimum ₦100,000 authorised for LLC), subscribers, and their shares. ' +
      'Mark clearly this is a draft preview to be confirmed by a legal agent.',
    fields: [
      { id: 'companyName', label: 'Company name (with Ltd)', kind: 'text', placeholder: 'Iroko Technologies Limited', required: true },
      { id: 'office', label: 'Registered office (state)', kind: 'text', placeholder: 'Ikeja, Lagos State', required: true },
      { id: 'objects', label: 'Main business objects', kind: 'textarea', placeholder: 'To carry on the business of technology services, software development and consulting.', required: true },
      { id: 'capital', label: 'Authorised share capital (₦)', kind: 'money', placeholder: '1,000,000', default: '1,000,000', required: true },
      { id: 'subscribers', label: 'Subscribers (name, address, shares)', kind: 'textarea', placeholder: '1. Ngozi Eze, Lagos — 500,000 shares\n2. Tunde Bello, Lagos — 500,000 shares', required: true },
    ],
  },
]

export function getDocTemplate(id: string): DocTemplate | undefined {
  return DOC_TEMPLATES.find((t) => t.id === id)
}

/**
 * Build the prompt sent to the AI to generate the document.
 * Returns the user message; the server appends the Iroko system prompt.
 */
export function buildDocGenerationPrompt(template: DocTemplate, values: Record<string, string>): string {
  const filled = template.fields
    .map((f) => {
      const v = (values[f.id] || '').trim()
      return `- ${f.label}: ${v || '(not provided)'}`
    })
    .join('\n')

  return [
    `Please draft a complete ${template.name} for me. Use the details below.`,
    ``,
    `Details provided:`,
    filled,
    ``,
    `Drafting guidance:`,
    template.draftingNotes,
    ``,
    `Format the document in clean Markdown with a title, numbered clauses/sections, and signature blocks at the end ` +
      `where applicable. Use ₦ for naira. Add a short footer noting it was generated by Iroko AI and should be ` +
      `reviewed by a legal professional before signing.`,
  ].join('\n')
}
