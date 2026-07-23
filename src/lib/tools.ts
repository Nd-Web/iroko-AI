/**
 * Iroko AI tool registry — the model's "hands".
 *
 * Definitions follow the OpenAI-compatible function-calling schema
 * (what OpenRouter forwards to every provider). Execution is server-side
 * only; every tool returns a JSON-serialisable object the model narrates.
 *
 * Tools never throw: errors come back as { error } results so the model
 * can explain the problem and keep the conversation moving.
 */

import { db } from './db'
import { calculatePayee, formatNaira, formatPercent } from './nigerian-tax'
import { checkBusinessName, ENTITY_TYPES, type EntityType } from './business-name-checker'
import { searchCacLive } from './cac-search'
import { cacBrowserSearch, cacBrowserMode } from './cac-live-search'
import { AGENT_SERVICES, CATEGORY_LABELS } from './iroko-services'
import { initializePayment, paymentsMode } from './paystack'
import { addTaskEvent, markTaskPaid, TERMINAL_STATUSES } from './task-engine'
import { webSearch } from './web-search'
import { fetchReadable } from './web-fetch'

export interface ToolContext {
  userId: string | null
  email: string | null
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

type ToolExecutor = (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>

const MAX_TASKS_LISTED = 8

/* ------------------------------------------------------------------ */
/* Definitions                                                         */
/* ------------------------------------------------------------------ */

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'calculate_paye',
      description:
        'Exactly compute Nigerian PAYE / personal income tax with the statutory engine (CRA relief + graduated bands). ALWAYS use this instead of doing tax arithmetic yourself.',
      parameters: {
        type: 'object',
        properties: {
          gross_amount: { type: 'number', description: 'Gross income in naira (plain number).' },
          period: { type: 'string', enum: ['monthly', 'annual'], description: 'Whether gross_amount is per month or per year.' },
          pension: { type: 'boolean', description: 'Deduct 8% employee pension (PRA 2014).', default: false },
          nhf: { type: 'boolean', description: 'Deduct 2.5% National Housing Fund.', default: false },
          nhis: { type: 'boolean', description: 'Deduct 5% NHIS.', default: false },
        },
        required: ['gross_amount', 'period'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_business_name',
      description:
        'Check a proposed business name against CAC naming rules AND the live CAC public registry search (when configured). Returns a verdict, issues, live registry matches and alternative suggestions.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The proposed business name, including suffix (e.g. "Zenva Foods Limited").' },
          entity_type: {
            type: 'string',
            enum: ENTITY_TYPES.map((t) => t.id),
            description: 'llc = Ltd company, plc = public company, sole = enterprise/business name, ngo = incorporated trustees, partnership.',
          },
        },
        required: ['name', 'entity_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_agent_services',
      description:
        'List the Iroko services catalog (fees in naira, duration, requirements, delivery tier). Use when the user asks what Iroko can do or before creating a service task.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: Object.keys(CATEGORY_LABELS),
            description: 'Optional category filter.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_service_task',
      description:
        'Create a real service request (task) for the signed-in user after they have CONFIRMED the collected details. Returns the task id, fee, and a payment link (or payment status). Never call before the user explicitly confirms.',
      parameters: {
        type: 'object',
        properties: {
          service_id: {
            type: 'string',
            enum: AGENT_SERVICES.map((s) => s.id),
            description: 'The catalog id of the service.',
          },
          details: {
            type: 'object',
            description:
              'All collected details as short field-name → value pairs, e.g. {"Proposed name 1": "...", "Proprietor full name": "..."}.',
            additionalProperties: { type: 'string' },
          },
        },
        required: ['service_id', 'details'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_tasks',
      description:
        "Fetch the signed-in user's service tasks with their status timelines (and results/documents when completed). Use whenever the user asks about progress or 'my requests'.",
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Optional: a specific task id to fetch in full (including result documents).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_task',
      description: 'Cancel one of the user\'s tasks (only if it is not already completed/failed). Confirm with the user before calling.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'The task id to cancel.' },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cac_portal_search',
      description:
        'Drive a REAL browser in the background to the CAC public search (search.cac.gov.ng): type the name, click search, read the results, and return any matching registered companies (name + RC number). Use this when the user explicitly wants Iroko to actually check the CAC registry/site for a name. Note: CAC is Cloudflare-protected, so this only fully works when a stealth browser service is configured; otherwise it reports it was blocked and you should fall back to web_search / check_business_name.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The exact business name to search on the CAC registry.' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the live internet and get titles, URLs and snippets. Use this whenever the user needs CURRENT or verifiable facts you should not guess: today\'s CAC/FIRS/NIMC/immigration fees, current regulations or deadlines, whether a specific business/product exists, recent news, prices, or anything time-sensitive. Prefer this over relying on memory for figures. Follow up with fetch_url to read a promising result in full.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query. Add "Nigeria" / the year / "site:cac.gov.ng" etc. to sharpen it.' },
          max_results: { type: 'number', description: 'How many results to return (1–10, default 6).' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description:
        'Open a web page and read its main text. Use after web_search to read an official/source page in full (e.g. a CAC fee schedule) so you can quote exact, current details. Only public http/https pages.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The full http/https URL to read.' },
        },
        required: ['url'],
      },
    },
  },
]

/* ------------------------------------------------------------------ */
/* Executors                                                           */
/* ------------------------------------------------------------------ */

const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : NaN)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const bool = (v: unknown): boolean => v === true

const executors: Record<string, ToolExecutor> = {
  async calculate_paye(args) {
    const gross = num(args.gross_amount)
    const period = str(args.period)
    if (!(gross > 0) || (period !== 'monthly' && period !== 'annual')) {
      return { error: 'gross_amount must be a positive number and period must be monthly or annual.' }
    }
    const grossAnnual = period === 'monthly' ? gross * 12 : gross
    const r = calculatePayee({
      grossAnnual,
      pension: bool(args.pension),
      nhf: bool(args.nhf),
      nhis: bool(args.nhis),
    })
    return {
      inputs: { grossAnnual: formatNaira(r.grossAnnual), grossMonthly: formatNaira(r.grossMonthly), pension: bool(args.pension), nhf: bool(args.nhf), nhis: bool(args.nhis) },
      deductions: {
        pension: formatNaira(r.pension),
        nhf: formatNaira(r.nhf),
        nhis: formatNaira(r.nhis),
        total: formatNaira(r.totalStatutoryDeductions),
      },
      cra: { total: formatNaira(r.cra), base: formatNaira(r.craBase), twentyPercent: formatNaira(r.craTwentyPercent) },
      taxableIncome: formatNaira(r.taxableIncome),
      bands: r.bands
        .filter((b) => b.taxableInBand > 0)
        .map((b) => ({ band: b.band.label, rate: formatPercent(b.band.rate), taxable: formatNaira(b.taxableInBand), tax: formatNaira(b.tax) })),
      totals: {
        taxAnnual: formatNaira(r.totalTaxAnnual),
        taxMonthly: formatNaira(r.totalTaxMonthly),
        netAnnual: formatNaira(r.netAnnual),
        netMonthly: formatNaira(r.netMonthly),
        effectiveRate: formatPercent(r.effectiveRate),
      },
      source: 'PITA (as amended) statutory PAYE schedule — confirm current-year rates with FIRS/state IRS.',
    }
  },

  async check_business_name(args) {
    const name = str(args.name).trim()
    const entityType = str(args.entity_type) as EntityType
    if (!name) return { error: 'name is required.' }
    // Rules check and the dedicated CAC endpoint run concurrently.
    const [rules, live] = await Promise.all([
      Promise.resolve(checkBusinessName(name, entityType || 'llc')),
      searchCacLive(name),
    ])

    // Real CAC-site browser automation — only when a stealth browser is
    // configured (otherwise Cloudflare blocks it and it wastes ~20s). Runs in
    // the background driving the actual CAC public search.
    let cacBrowser:
      | { performed: true; via: string; blocked: boolean; exactMatch: boolean; matches: { name: string; rcNumber?: string }[]; note: string }
      | { performed: false }
      = { performed: false }
    let browserExactTaken = false
    if (cacBrowserMode(false) !== 'off') {
      const b = await cacBrowserSearch(name, false)
      cacBrowser = {
        performed: b.attempted,
        via: b.via,
        blocked: b.blocked,
        exactMatch: b.exactMatch,
        matches: b.matches,
        note: b.note,
      }
      browserExactTaken = b.exactMatch
    }

    // If neither the dedicated CAC endpoint nor the browser gave a definitive
    // answer, search the live WEB for the name instead of giving up.
    let webCheck:
      | { performed: true; query: string; provider: string; findings: { title: string; url: string; snippet: string }[]; likelyExists: boolean }
      | { performed: false }
      = { performed: false }
    if (!live.live && !(cacBrowser.performed && !cacBrowser.blocked && cacBrowser.matches.length > 0)) {
      const core = name.replace(/\b(ltd|limited|plc|enterprises?|ventures?|nigeria|nig)\b\.?/gi, '').trim()
      // Plain keywords — search back-ends (esp. the keyless DuckDuckGo
      // fallback) handle these far better than quoted/boolean queries.
      const query = `${name} CAC business name registration Nigeria`
      const web = await webSearch(query, 6)
      const nameLc = name.toLowerCase()
      const coreLc = core.toLowerCase()
      const findings = web.results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet }))
      // Heuristic: a strong hit is a result whose title/snippet contains the
      // full name or its distinctive core alongside CAC/registration context.
      const likelyExists = web.results.some((r) => {
        const hay = `${r.title} ${r.snippet}`.toLowerCase()
        return (hay.includes(nameLc) || (coreLc.length > 3 && hay.includes(coreLc))) &&
          /(cac|corporate affairs|registered|rc\s?\d|company|business name)/i.test(hay)
      })
      webCheck = { performed: true, query, provider: web.provider, findings, likelyExists }
    }

    const exactTaken = live.exactMatch || browserExactTaken
    const verdict = exactTaken ? 'taken' : rules.status
    return {
      name,
      entityType,
      verdict,
      rulesCheck: {
        status: rules.status,
        title: rules.title,
        issues: rules.issues,
        suggestions: rules.suggestions,
      },
      liveRegistry: {
        performed: live.live,
        note: live.live
          ? live.note
          : 'Dedicated CAC endpoint not configured.',
        similarRegistrations: live.matches.slice(0, 10),
        exactMatch: live.exactMatch,
      },
      cacBrowser,
      webCheck,
      guidance:
        'Report clearly which checks ran: naming RULES (always); the CAC-site BROWSER automation (cacBrowser — only when a stealth browser is configured; if blocked, say Cloudflare blocked it); and the live WEB search (webCheck). If cacBrowser found matches, that is the most authoritative — report the companies + RC numbers. Otherwise use webCheck (cite URLs). Only a formal CAC name reservation is 100% definitive — say so. Then offer to register or reserve.',
      nextStep:
        verdict === 'available'
          ? 'Offer to reserve/register the name via a CAC registration task.'
          : 'Suggest alternatives, then re-check the one the user picks.',
    }
  },

  async list_agent_services(args) {
    const category = str(args.category)
    const list = AGENT_SERVICES.filter((s) => !category || s.category === category)
    return {
      services: list.map((s) => ({
        id: s.id,
        name: s.name,
        category: CATEGORY_LABELS[s.category],
        tier: s.layer,
        fee:
          s.feeMin === 0 && s.feeMax === 0
            ? s.officialFee ?? 'Free'
            : `${formatNaira(s.feeMin)} – ${formatNaira(s.feeMax)} Iroko fee${s.officialFee ? ` (+ ${s.officialFee})` : ''}`,
        duration: s.duration,
        requirements: s.requirements,
        popular: !!s.popular,
      })),
      tiers: {
        ai: 'Instant — done by Iroko AI in this chat, free.',
        online: 'Iroko completes it on the government portal for you — no agent visit.',
        agent: 'Requires physical presence — a stationed Iroko agent handles it.',
      },
    }
  },

  async create_service_task(args, ctx) {
    if (!ctx.userId) return { error: 'User is not signed in — ask them to log in first.' }
    const serviceId = str(args.service_id)
    const service = AGENT_SERVICES.find((s) => s.id === serviceId)
    if (!service) return { error: `Unknown service_id "${serviceId}". Call list_agent_services for valid ids.` }

    const rawDetails = (args.details && typeof args.details === 'object' ? args.details : {}) as Record<string, unknown>
    const details: Record<string, string> = {}
    for (const [k, v] of Object.entries(rawDetails)) {
      const key = k.trim().slice(0, 80)
      const val = String(v ?? '').trim().slice(0, 1000)
      if (key && val) details[key] = val
    }
    if (Object.keys(details).length === 0) {
      return { error: 'details is empty — collect the required details from the user first.' }
    }

    const amountKobo = service.feeMin * 100 // charge the base Iroko fee
    const task = await db.serviceTask.create({
      data: {
        userId: ctx.userId,
        serviceId,
        title: service.name,
        detailsJson: JSON.stringify(details),
        amountKobo,
        status: 'AWAITING_PAYMENT',
      },
    })
    await addTaskEvent(task.id, 'CREATED', `Task created for ${service.name}.`, { details })

    // Services that need document images (CAC registration: means of ID,
    // passport photo, signature) get a secure per-task upload link the user
    // opens to submit them, so a human can complete the filing.
    const needsDocs = /passport|signature|means of id|image upload/i.test(
      service.requirements.join(' '),
    )
    const docsHint = needsDocs
      ? {
          documentsUrl: `/task/${task.id}/documents`,
          documentsNote:
            'IMPORTANT: give the user this link and tell them to upload their means of ID, passport photograph and signature there — these plus their NIN are what let the Iroko team complete the CAC filing.',
        }
      : {}

    // Free services skip payment entirely.
    if (amountKobo === 0) {
      await markTaskPaid(task.id, 'simulated')
      return {
        taskId: task.id,
        service: service.name,
        fee: 'Free',
        status: 'QUEUED',
        message: 'No fee for this service — Iroko is processing it now. Use get_my_tasks to check progress.',
        ...docsHint,
      }
    }

    const mode = paymentsMode()
    if (mode === 'live') {
      try {
        const reference = `iroko_${task.id}`
        const payment = await initializePayment({
          email: ctx.email ?? 'customer@iroko.ng',
          amountKobo,
          reference,
          taskId: task.id,
        })
        await db.serviceTask.update({ where: { id: task.id }, data: { paymentRef: payment.reference } })
        return {
          taskId: task.id,
          service: service.name,
          fee: formatNaira(service.feeMin),
          officialFeeNote: service.officialFee ?? null,
          status: 'AWAITING_PAYMENT',
          paymentLink: payment.authorizationUrl,
          message: 'Share the payment link with the user (card, transfer or USSD). Processing starts automatically once payment is confirmed.',
          ...docsHint,
        }
      } catch (err) {
        await addTaskEvent(task.id, 'ERROR', `Payment initialisation failed: ${err instanceof Error ? err.message : String(err)}`)
        return {
          taskId: task.id,
          status: 'AWAITING_PAYMENT',
          error: 'Could not create the payment link right now. The task is saved — the user can try paying again shortly via get_my_tasks.',
        }
      }
    }

    if (mode === 'simulate') {
      await markTaskPaid(task.id, 'simulated')
      return {
        taskId: task.id,
        service: service.name,
        fee: formatNaira(service.feeMin),
        status: 'QUEUED',
        devNote: 'PAYMENTS SIMULATED (no Paystack key configured) — tell the user this is a demo payment and processing has started.',
        ...docsHint,
      }
    }

    return {
      taskId: task.id,
      service: service.name,
      fee: formatNaira(service.feeMin),
      status: 'AWAITING_PAYMENT',
      message: 'Payments are currently disabled — the task is saved and the Iroko team will contact the user about payment.',
      ...docsHint,
    }
  },

  async get_my_tasks(args, ctx) {
    if (!ctx.userId) return { error: 'User is not signed in — ask them to log in first.' }
    const taskId = str(args.task_id)

    const tasks = await db.serviceTask.findMany({
      where: { userId: ctx.userId, ...(taskId ? { id: taskId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: taskId ? 1 : MAX_TASKS_LISTED,
      include: { events: { orderBy: { createdAt: 'asc' }, take: 20 } },
    })
    if (tasks.length === 0) {
      return { tasks: [], message: taskId ? 'No task with that id for this user.' : 'No tasks yet.' }
    }
    return {
      tasks: tasks.map((t) => {
        let result: unknown = null
        if (t.resultJson) {
          try {
            const parsed = JSON.parse(t.resultJson)
            // Full artifacts only when a single task was requested — keeps
            // the context small on list views.
            result = taskId ? parsed : { via: parsed?.via ?? 'unknown' }
          } catch {
            result = null
          }
        }
        return {
          taskId: t.id,
          service: t.title,
          status: t.status,
          fee: t.amountKobo > 0 ? formatNaira(t.amountKobo / 100) : 'Free',
          paid: !!t.paidAt,
          createdAt: t.createdAt.toISOString(),
          timeline: t.events.map((e) => `${e.createdAt.toISOString().slice(0, 16).replace('T', ' ')} — ${e.message}`),
          result,
        }
      }),
    }
  },

  async cancel_task(args, ctx) {
    if (!ctx.userId) return { error: 'User is not signed in.' }
    const taskId = str(args.task_id)
    if (!taskId) return { error: 'task_id is required.' }
    const res = await db.serviceTask.updateMany({
      where: { id: taskId, userId: ctx.userId, status: { notIn: TERMINAL_STATUSES } },
      data: { status: 'CANCELLED' },
    })
    if (res.count === 0) {
      return { error: 'Task not found, not yours, or already finished — nothing was cancelled.' }
    }
    await addTaskEvent(taskId, 'STATUS', 'Cancelled at the user\'s request.')
    return { taskId, status: 'CANCELLED', note: 'If a payment was made, refunds are handled by the Iroko team.' }
  },

  async cac_portal_search(args) {
    const name = str(args.name).trim()
    if (!name) return { error: 'name is required.' }
    // allowLocal=true → the standalone tool genuinely drives a local browser
    // even without a scraping service (so it truly "goes to the CAC site").
    const res = await cacBrowserSearch(name, true)
    return {
      name,
      via: res.via,
      attempted: res.attempted,
      blocked: res.blocked,
      exactMatch: res.exactMatch,
      matches: res.matches,
      note: res.note,
      instruction: res.blocked
        ? 'The CAC site blocked the automated browser (Cloudflare). Tell the user plainly, then fall back to web_search for the name and offer the formal CAC reservation (the only definitive check).'
        : res.matches.length > 0
          ? 'Report the exact companies found (name + RC number) and whether the requested name is an exact match. Cite that this came from the CAC public registry.'
          : 'Reached the CAC registry and found no match — report that, noting only a formal reservation is 100% definitive, then offer to register.',
    }
  },

  async web_search(args) {
    const query = str(args.query).trim()
    if (!query) return { error: 'query is required.' }
    const max = typeof args.max_results === 'number' ? args.max_results : 6
    const res = await webSearch(query, max)
    return {
      provider: res.provider,
      query: res.query,
      answer: res.answer,
      results: res.results,
      note: res.note,
      instruction:
        res.results.length > 0
          ? 'Cite the source URLs you use. If you need exact figures/wording, call fetch_url on the most authoritative result (prefer official .gov.ng / cac.gov.ng / firs.gov.ng pages).'
          : 'No results — tell the user you could not find current info and give your best general guidance, clearly flagged as unverified.',
    }
  },

  async fetch_url(args) {
    const url = str(args.url).trim()
    if (!url) return { error: 'url is required.' }
    const res = await fetchReadable(url)
    if (!res.ok) return { ok: false, url, note: res.note }
    return {
      ok: true,
      url: res.url,
      title: res.title,
      truncated: res.truncated,
      text: res.text,
      instruction: 'Summarise/quote only what is on the page. Cite this URL. If it did not answer the question, say so.',
    }
  },
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

/** Execute a tool call. Never throws. */
export async function executeTool(
  name: string,
  argsJson: string,
  ctx: ToolContext,
): Promise<string> {
  const exec = executors[name]
  if (!exec) return JSON.stringify({ error: `Unknown tool: ${name}` })
  let args: Record<string, unknown>
  try {
    args = argsJson ? JSON.parse(argsJson) : {}
  } catch {
    return JSON.stringify({ error: 'Tool arguments were not valid JSON. Retry with valid JSON.' })
  }
  try {
    const result = await exec(args, ctx)
    return JSON.stringify(result)
  } catch (err) {
    console.error(`[iroko/tools] ${name} failed:`, err)
    return JSON.stringify({ error: `Tool failed: ${err instanceof Error ? err.message : 'unknown error'}` })
  }
}
