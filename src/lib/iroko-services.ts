import type { LucideIcon } from 'lucide-react'
import {
  IdCard,
  Building2,
  ReceiptText,
  Landmark,
  Car,
  Plane,
  Stamp,
  FileText,
  ShieldCheck,
  Pill,
  type LucideIcon as LI,
} from 'lucide-react'

export type ServiceCategory =
  | 'identity'
  | 'business'
  | 'tax'
  | 'legal'
  | 'mobility'
  | 'compliance'

export interface AgentService {
  id: string
  name: string
  category: ServiceCategory
  description: string
  /** Iroko service fee range in ₦ (agent portion for agent-tier services). */
  feeMin: number
  feeMax: number
  /** Typical government/official fee, if applicable. */
  officialFee?: string
  duration: string
  requirements: string[]
  icon: string
  /**
   * Delivery tier:
   *  - 'ai'     = instant, done by the AI in chat (free).
   *  - 'online' = the underlying government process is fully online; Iroko's
   *               back-office/automation completes it on the portal — no
   *               physical agent needed.
   *  - 'agent'  = physical presence required (biometrics, notary seal,
   *               inspections) — a stationed human agent handles it.
   */
  layer: 'ai' | 'online' | 'agent'
  /** Which portal an 'online' service is executed on (automation routing). */
  portal?: 'cac' | 'firs' | 'jtb' | 'pencom'
  popular?: boolean
}

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  identity: 'Identity & Government',
  business: 'Business & Legal',
  tax: 'Tax & Finance',
  legal: 'Legal',
  mobility: 'Licence & Mobility',
  compliance: 'Compliance',
}

export const ICON_MAP: Record<string, LucideIcon> = {
  IdCard,
  Building2,
  ReceiptText,
  Landmark,
  Car,
  Plane,
  Stamp,
  FileText,
  ShieldCheck,
  Pill,
}

/** The Iroko human-agent network service catalog. */
export const AGENT_SERVICES: AgentService[] = [
  {
    id: 'nin',
    name: 'NIN Registration',
    category: 'identity',
    description:
      'Register for your National Identification Number via an agent stationed at a NIMC office near you.',
    feeMin: 3000,
    feeMax: 5000,
    duration: '1–3 days',
    requirements: ['Valid ID or birth certificate', 'Proof of address', 'Biometrics (captured on-site)'],
    icon: 'IdCard',
    layer: 'agent',
    popular: true,
  },
  {
    id: 'nin-correction',
    name: 'NIN Correction',
    category: 'identity',
    description:
      'Correct a name, date of birth or other detail on your existing NIN record.',
    feeMin: 3000,
    feeMax: 6000,
    duration: '2–5 days',
    requirements: ['Existing NIN', 'Supporting document for the change', 'Valid ID'],
    icon: 'IdCard',
    layer: 'agent',
  },
  {
    id: 'cac-llc',
    name: 'CAC Business Registration (LLC)',
    category: 'business',
    description:
      'Register a Limited Liability Company with CAC — name search, document prep, filing & certificate.',
    feeMin: 10000,
    feeMax: 15000,
    // CAC official fees (verify live): ₦1,000 name reservation + ₦10,000 per
    // ₦1,000,000 of share capital + separate FIRS stamp duty on the MEMART.
    officialFee: 'CAC ₦1,000 reservation + ₦10,000 per ₦1M share capital (+ FIRS stamp duty)',
    duration: '1–2 weeks',
    requirements: [
      '2 proposed business names',
      'Nature of business / company objects',
      'Registered address',
      'Share capital (min ₦100,000)',
      'Director(s) & shareholder(s) details + NIN (mandatory)',
      'Passport photographs & signatures (image uploads)',
      'Person(s) with Significant Control (PSC) details',
    ],
    icon: 'Building2',
    layer: 'online',
    portal: 'cac',
    popular: true,
  },
  {
    id: 'cac-sole',
    name: 'CAC Business Registration (Sole Proprietor)',
    category: 'business',
    description:
      'Register a sole proprietorship / enterprise (Business Name) with CAC — the simplest business structure.',
    feeMin: 8000,
    feeMax: 12000,
    // CAC official fees (2025 gazette, verify live): ₦1,000 name reservation
    // + Business Name registration raised to ~₦20,000 from Oct 2025.
    officialFee: 'CAC ₦1,000 name reservation + ~₦20,000 registration',
    duration: '3–7 days (often near-instant on iCRP)',
    requirements: [
      '2 proposed business names',
      'Nature of business',
      'Business address',
      'Proprietor details (name, DOB, phone, email, residential address)',
      'Proprietor NIN (mandatory)',
      'Means of ID, passport photograph & signature (image uploads)',
    ],
    icon: 'Building2',
    layer: 'online',
    portal: 'cac',
  },
  {
    id: 'tin',
    name: 'FIRS TIN Registration',
    category: 'tax',
    description:
      'Get your Tax Identification Number (TIN) from FIRS — required for tax filing and business banking.',
    feeMin: 5000,
    feeMax: 10000,
    duration: '2–5 days',
    requirements: ['Valid ID', 'Proof of address', 'NIN', 'BVN'],
    icon: 'Landmark',
    layer: 'online',
    portal: 'jtb',
  },
  {
    id: 'tax-filing',
    name: 'Annual Tax Filing',
    category: 'tax',
    description:
      'File your personal or company income tax returns with the relevant tax authority.',
    feeMin: 5000,
    feeMax: 15000,
    duration: '3–7 days',
    requirements: ['TIN', 'Income records / payslips', 'Previous assessment (if any)'],
    icon: 'ReceiptText',
    layer: 'online',
    portal: 'firs',
    popular: true,
  },
  {
    id: 'vat-reg',
    name: 'VAT Registration & Filing',
    category: 'tax',
    description:
      'Register your business for VAT with FIRS and stay compliant with monthly/quarterly filings.',
    feeMin: 5000,
    feeMax: 12000,
    duration: '2–5 days',
    requirements: ['CAC certificate', 'TIN', 'Business address', 'Bank details'],
    icon: 'ReceiptText',
    layer: 'online',
    portal: 'firs',
  },
  {
    id: 'drivers-license',
    name: "Driver's Licence",
    category: 'mobility',
    description:
      "Apply for or renew your Nigerian driver's licence via an FRSC station agent.",
    feeMin: 4000,
    feeMax: 8000,
    officialFee: '₦6,350 – ₦15,000 (FRSC)',
    duration: '2–6 weeks',
    requirements: ['Valid ID', 'Proof of age', 'Driving school certificate (new applicants)', 'Biometrics'],
    icon: 'Car',
    layer: 'agent',
  },
  {
    id: 'passport',
    name: 'International Passport',
    category: 'mobility',
    description:
      'Apply for a Nigerian international passport via an agent at the Nigeria Immigration Service.',
    feeMin: 8000,
    feeMax: 15000,
    officialFee: '₦26,000 – ₦45,000 (NIS)',
    duration: '1–3 weeks',
    requirements: ['NIN', 'Valid ID', 'Birth certificate or age declaration', '2 passport photos', 'Guarantor form'],
    icon: 'Plane',
    layer: 'agent',
    popular: true,
  },
  {
    id: 'vehicle-reg',
    name: 'Vehicle Registration',
    category: 'mobility',
    description:
      'Register a new vehicle or renew vehicle particulars with the relevant state agency.',
    feeMin: 5000,
    feeMax: 10000,
    duration: '1–3 days',
    requirements: ['Custom papers / purchase receipt', 'Means of ID', 'Vehicle documents', 'Insurance'],
    icon: 'Car',
    layer: 'agent',
  },
  {
    id: 'notarization',
    name: 'Document Notarization',
    category: 'legal',
    description:
      'Have affidavits and legal documents notarized by a verified legal agent.',
    feeMin: 3000,
    feeMax: 8000,
    duration: '1–2 days',
    requirements: ['Valid ID', 'Document to be notarized', 'Two referees (sometimes)'],
    icon: 'Stamp',
    layer: 'agent',
  },
  {
    id: 'contract-draft',
    name: 'Contract Generation',
    category: 'legal',
    description:
      'Generate Nigerian-law-compliant contracts — employment, tenancy, partnership, sales.',
    feeMin: 0,
    feeMax: 0,
    officialFee: 'Free with Iroko AI',
    duration: 'Instant',
    requirements: ['Type of contract', 'Parties & terms'],
    icon: 'FileText',
    layer: 'ai',
  },
  {
    id: 'land-search',
    name: 'Land Registry Search',
    category: 'legal',
    description:
      'Verify land/property title and ownership status at the state land registry.',
    feeMin: 5000,
    feeMax: 15000,
    duration: '3–7 days',
    requirements: ['Property location / survey plan', 'Plot coordinates (if available)'],
    icon: 'Landmark',
    layer: 'agent',
  },
  {
    id: 'nafdac',
    name: 'NAFDAC Registration',
    category: 'compliance',
    description:
      'Register food, drug, cosmetic or chemical products with NAFDAC for legal sale in Nigeria.',
    feeMin: 10000,
    feeMax: 25000,
    officialFee: 'Varies by product class',
    duration: '4–12 weeks',
    requirements: ['CAC certificate', 'Product samples', 'Lab analysis report', 'Manufacturing details'],
    icon: 'Pill',
    layer: 'agent',
  },
  {
    id: 'pension-reg',
    name: 'PenCom Registration',
    category: 'compliance',
    description:
      'Register with the National Pension Commission and open a Retirement Savings Account (RSA).',
    feeMin: 2000,
    feeMax: 5000,
    duration: '1–3 days',
    requirements: ['Valid ID', 'NIN', 'Employer details (if employed)'],
    icon: 'ShieldCheck',
    layer: 'online',
    portal: 'pencom',
  },
]

/** Build a user message that kicks off a service request in the chat. */
export function buildServiceRequestPrompt(s: AgentService): string {
  const fee =
    s.feeMin === 0 && s.feeMax === 0
      ? s.officialFee ?? 'No agent fee'
      : `Agent fee: ₦${s.feeMin.toLocaleString()} – ₦${s.feeMax.toLocaleString()}${
          s.officialFee ? ` (${s.officialFee})` : ''
        }`
  return [
    `I want to use Iroko to handle: ${s.name}.`,
    ``,
    `Service: ${s.name}`,
    `Description: ${s.description}`,
    `${fee}`,
    `Typical duration: ${s.duration}`,
    `Requirements: ${s.requirements.join(', ')}`,
    ``,
    `Walk me through how this works end-to-end with Iroko, what I need to provide now, the full cost breakdown, and the next step to get started.`,
  ].join('\n')
}
