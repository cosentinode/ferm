import { type NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { z } from "zod"
import { isIP } from "node:net"
import { lookup } from "node:dns/promises"

import { requireCookieCsrf } from "@/lib/api/auth"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import {
  getScrapeGuardrailIgnorePrompt,
  getScrapeGuardrailReferencePrompt,
  getScrapeGuardrailTruncationPrompt,
} from "@/lib/ai/prompts"

const RequestBodySchema = z.object({
  job_url: z.string().url(),
})

const MAX_HTML_BYTES = 1_500_000
const MAX_TEXT_LENGTH = 60_000
const MIN_TEXT_LENGTH = 120
const FETCH_TIMEOUT_MS = 12_000
const MAX_REDIRECTS = 5
const CONFIGURED_SITE_URL = (() => {
  const rawSiteUrl =
    process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || ""

  if (!rawSiteUrl) {
    throw new Error(
      "Missing site URL configuration. Set SITE_URL, NEXT_PUBLIC_SITE_URL, or VERCEL_URL.",
    )
  }

  const normalized = rawSiteUrl.startsWith("http://") || rawSiteUrl.startsWith("https://")
    ? rawSiteUrl
    : `https://${rawSiteUrl}`

  const parsed = new URL(normalized)
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Unsupported SITE_URL protocol: ${parsed.protocol}`)
  }

  return parsed
})()

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
])

const ALLOWED_JOB_BOARD_HOSTS = new Set([
  "boards.greenhouse.io",
  "jobs.lever.co",
  "workable.com",
  "jobs.workable.com",
  "jobs.ashbyhq.com",
  "jobs.smartrecruiters.com",
  "myworkdayjobs.com",
  "icims.com",
])

const DISABLE_JOB_BOARD_ALLOWLIST = process.env.JOB_BOARD_ALLOWLIST === "false"

function getConfiguredJobBoardHosts() {
  const configured = new Set(ALLOWED_JOB_BOARD_HOSTS)
  const extraHosts = process.env.JOB_BOARD_ALLOWLIST_HOSTS
  if (!extraHosts) {
    return configured
  }

  for (const host of extraHosts.split(",")) {
    const trimmed = host.trim().toLowerCase()
    if (trimmed) {
      configured.add(trimmed)
    }
  }

  return configured
}

function isPrivateIpv4(ip: string) {
  const parts = ip.split(".").map((segment) => Number.parseInt(segment, 10))
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false
  }
  if (parts[0] === 10) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  if (parts[0] === 127) return true
  if (parts[0] === 169 && parts[1] === 254) return true
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true
  if (parts[0] === 0) return true
  if (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) return true
  if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return true
  if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true
  if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true
  if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true
  if (parts[0] >= 224) return true
  return false
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase()
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("::ffff:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80") ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8")
  )
}

function isBlockedHost(hostname: string) {
  const lower = hostname.toLowerCase()
  if (BLOCKED_HOSTNAMES.has(lower) || lower.endsWith(".local")) {
    return true
  }

  const ipType = isIP(lower)
  if (ipType === 4) {
    return isPrivateIpv4(lower)
  }
  if (ipType === 6) {
    return isPrivateIpv6(lower)
  }

  return false
}

function isAllowedJobBoard(hostname: string) {
  if (DISABLE_JOB_BOARD_ALLOWLIST) {
    return true
  }
  const lower = hostname.toLowerCase()
  const configuredHosts = getConfiguredJobBoardHosts()
  if (configuredHosts.has(lower)) {
    return true
  }
  for (const allowed of configuredHosts) {
    if (lower.endsWith(`.${allowed}`)) {
      return true
    }
  }
  return false
}

function isBlockedIpAddress(ip: string) {
  const ipType = isIP(ip)
  if (ipType === 4) {
    return isPrivateIpv4(ip)
  }
  if (ipType === 6) {
    if (ip.toLowerCase().startsWith("::ffff:")) {
      const ipv4Part = ip.slice(7)
      return isPrivateIpv4(ipv4Part)
    }
    return isPrivateIpv6(ip)
  }
  return true
}

async function resolveHostnameToIps(hostname: string) {
  if (isIP(hostname)) {
    return [hostname]
  }
  const results = await lookup(hostname, { all: true })
  if (!results.length) {
    return []
  }
  return results.map((result) => result.address)
}

async function assertUrlIsSafe(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("unsupported-protocol")
  }

  if (isBlockedHost(url.hostname)) {
    throw new Error("blocked-host")
  }

  if (!isAllowedJobBoard(url.hostname)) {
    console.warn("Rejected job board host (not allowlisted).", { hostname: url.hostname })
    throw new Error("not-allowlisted")
  }

  const resolvedIps = await resolveHostnameToIps(url.hostname)
  if (!resolvedIps.length) {
    throw new Error("dns-failed")
  }
  for (const ip of resolvedIps) {
    if (isBlockedIpAddress(ip)) {
      throw new Error("blocked-ip")
    }
  }
}

function stripDangerousTags(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<object[\s\S]*?<\/object>/gi, " ")
    .replace(/<embed[\s\S]*?<\/embed>/gi, " ")
}

function htmlToPlainText(html: string) {
  const sanitized = stripDangerousTags(html)
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<(br|hr)\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|section|article|header|footer|tr|td|th|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")

  return sanitized
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[\t ]{2,}/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function guardrailWrap(text: string, truncated: boolean) {
  const lines = [
    getScrapeGuardrailReferencePrompt(),
    getScrapeGuardrailIgnorePrompt(),
  ]

  if (truncated) {
    lines.push(getScrapeGuardrailTruncationPrompt(MAX_TEXT_LENGTH.toLocaleString()))
  }

  return [
    ...lines,
    "SCRAPED_JOB_CONTENT_START",
    text,
    "SCRAPED_JOB_CONTENT_END",
  ].join("\n")
}

function parseHeaderNumber(value: string | null) {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const csrfError = requireCookieCsrf(request)
  if (csrfError) {
    return NextResponse.json({ error: csrfError.error.message }, { status: csrfError.error.status })
  }

  const configuredHost = CONFIGURED_SITE_URL.host.toLowerCase()
  const requestHost = request.headers.get("host")?.toLowerCase()
  if (requestHost && requestHost !== configuredHost) {
    return NextResponse.json({ error: "Request origin does not match configured site host" }, { status: 400 })
  }

  const hdrs = headers()
  const authHeader = hdrs.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 })
  }

  const userResp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  })

  if (!userResp.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let user: { id?: string } | null = null
  try {
    user = (await userResp.json()) as { id?: string }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rateLimitResponse = await enforceRateLimit({
    request,
    userId: user.id,
    keyPrefix: "scrape-job",
    maxRequests: 20,
    windowMs: 60_000,
  })
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  let bodyUnknown: unknown
  try {
    bodyUnknown = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const parsedBody = RequestBodySchema.safeParse(bodyUnknown)
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid input data", details: parsedBody.error.flatten() },
      { status: 400 },
    )
  }

  const { job_url: jobUrl } = parsedBody.data

  let parsedUrl: URL
  try {
    parsedUrl = new URL(jobUrl)
  } catch {
    return NextResponse.json({ error: "Invalid job_url" }, { status: 400 })
  }

  try {
    await assertUrlIsSafe(parsedUrl)
  } catch (error) {
    const reason = (error as Error).message
    if (reason === "not-allowlisted") {
      return NextResponse.json(
        {
          error:
            "Job board host is not allowlisted. Configure JOB_BOARD_ALLOWLIST_HOSTS or set JOB_BOARD_ALLOWLIST=false to disable the allowlist.",
        },
        { status: 400 },
      )
    }
    if (reason === "dns-failed") {
      return NextResponse.json({ error: "Unable to resolve hostname" }, { status: 400 })
    }
    if (reason === "unsupported-protocol") {
      return NextResponse.json({ error: "Only http/https URLs are supported" }, { status: 400 })
    }
    return NextResponse.json({ error: "Blocked URL" }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let response: Response
  try {
    let currentUrl = parsedUrl
    let redirectCount = 0

    while (true) {
      await assertUrlIsSafe(currentUrl)
      response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent": "FermJobLoader/1.0 (+https://ferm.dev)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      })

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location")
        if (!location) {
          throw new Error("redirect-without-location")
        }
        redirectCount += 1
        if (redirectCount > MAX_REDIRECTS) {
          throw new Error("too-many-redirects")
        }
        const nextUrl = new URL(location, currentUrl)
        currentUrl = nextUrl
        continue
      }

      break
    }
  } catch (error) {
    clearTimeout(timeout)
    if ((error as Error).name === "AbortError") {
      return NextResponse.json({ error: "Timed out fetching job posting" }, { status: 504 })
    }
    if ((error as Error).message === "too-many-redirects") {
      return NextResponse.json({ error: "Too many redirects" }, { status: 400 })
    }
    if ((error as Error).message === "redirect-without-location") {
      return NextResponse.json({ error: "Redirect missing location header" }, { status: 400 })
    }
    return NextResponse.json({ error: "Failed to fetch job posting" }, { status: 502 })
  }

  clearTimeout(timeout)

  if (!response.ok) {
    return NextResponse.json({ error: `Unable to fetch job posting (${response.status})` }, { status: 502 })
  }

  const contentType = response.headers.get("content-type") || ""
  if (!contentType.includes("text")) {
    return NextResponse.json({ error: "URL did not return readable text content" }, { status: 400 })
  }

  const contentLength = response.headers.get("content-length")
  const numericLength = parseHeaderNumber(contentLength)
  if (numericLength && numericLength > MAX_HTML_BYTES) {
    return NextResponse.json({ error: "Job posting is too large to process" }, { status: 413 })
  }

  let rawHtml: string
  try {
    rawHtml = await response.text()
  } catch {
    return NextResponse.json({ error: "Failed to read job posting" }, { status: 500 })
  }

  if (rawHtml.length > MAX_HTML_BYTES) {
    rawHtml = rawHtml.slice(0, MAX_HTML_BYTES)
  }

  const plainText = htmlToPlainText(rawHtml)
  if (plainText.length < MIN_TEXT_LENGTH) {
    return NextResponse.json({ error: "The page does not contain enough readable text to analyze" }, { status: 422 })
  }

  const truncated = plainText.length > MAX_TEXT_LENGTH
  const truncatedText = truncated ? plainText.slice(0, MAX_TEXT_LENGTH) : plainText
  const guardedText = guardrailWrap(truncatedText, truncated)

  const parseUrl = new URL("/api/parse-job", CONFIGURED_SITE_URL)
  if (parseUrl.host.toLowerCase() !== configuredHost) {
    return NextResponse.json({ error: "Configured site host mismatch" }, { status: 500 })
  }
  let parseResponse: Response
  try {
    parseResponse = await fetch(parseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ raw_text: guardedText, job_url: jobUrl }),
    })
  } catch {
    return NextResponse.json({ error: "Failed to analyze job posting" }, { status: 500 })
  }

  const responseText = await parseResponse.text()

  let responseJson: unknown
  try {
    responseJson = JSON.parse(responseText)
  } catch {
    return NextResponse.json({ error: "Parser returned invalid response" }, { status: 500 })
  }

  const nextResponse = NextResponse.json(responseJson, { status: parseResponse.status })
  nextResponse.headers.set("Cache-Control", "no-store")
  nextResponse.headers.set("Vary", "Authorization")

  const usageLimit = parseResponse.headers.get("X-Usage-Limit")
  if (usageLimit) {
    nextResponse.headers.set("X-Usage-Limit", usageLimit)
  }

  const usageRemaining = parseResponse.headers.get("X-Usage-Remaining")
  if (usageRemaining) {
    nextResponse.headers.set("X-Usage-Remaining", usageRemaining)
  }

  return nextResponse
}
