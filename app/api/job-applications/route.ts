// app/api/job-applications/route.ts
import { headers } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import type { CreateJobApplicationData } from "@/lib/types/database"
import { getLatestResumeText } from "@/lib/resume/server"
import { toNullableString } from "@/lib/utils"
import { expandStatusFilters, normalizeStatusValue, parseStatus } from "@/lib/status"
import { getAuthedClient, requireCookieCsrf } from "@/lib/api/auth"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import { resolveOpenAIApiKey, USER_OPENAI_KEY_HEADER } from "@/lib/ai/keys"
import { getResumeScoringSystemPrompt } from "@/lib/ai/prompts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

const baseCorsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

function getCorsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    ...baseCorsHeaders,
    "Access-Control-Allow-Headers": "content-type",
  }

  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin
    headers["Access-Control-Allow-Headers"] = "authorization, content-type"
    headers["Vary"] = "Origin"
  }

  return headers
}

function addVaryHeader(response: NextResponse, value: string) {
  const current = response.headers.get("Vary")
  const values = new Set(
    current
      ? current.split(",").map((entry) => entry.trim()).filter(Boolean)
      : []
  )
  value.split(",").map((entry) => entry.trim()).filter(Boolean).forEach((entry) => values.add(entry))
  response.headers.set("Vary", Array.from(values).join(", "))
}

const RESUME_SCORING_TIMEOUT_MS = 15_000
const MAX_JOB_APPLICATIONS_LIMIT = 100
const ALLOWED_JOB_APPLICATION_SORT_FIELDS = new Set([
  "created_at",
  "updated_at",
  "application_date",
  "company_name",
  "position_title",
  "status",
  "priority",
])

const ResumeScoreSchema = z.object({
  score: z.number(),
  summary: z.string().optional().nullable(),
})

const MAX_BODY_CHARS = 100_000
const MAX_BODY_BYTES = 100_000
const MAX_LONG_TEXT_LENGTH = 8_192
const MAX_SHORT_TEXT_LENGTH = 255
const MAX_STATUS_LENGTH = 64

const CreateJobApplicationSchema = z
  .object({
    company_name: z.string().min(1).max(MAX_SHORT_TEXT_LENGTH),
    position_title: z.string().min(1).max(MAX_SHORT_TEXT_LENGTH),
    job_url: z.string().url().max(MAX_SHORT_TEXT_LENGTH).nullable().optional(),
    location: z.string().max(MAX_SHORT_TEXT_LENGTH).nullable().optional(),
    salary_range: z.string().max(MAX_SHORT_TEXT_LENGTH).nullable().optional(),
    employment_type: z.enum(["Full-time", "Part-time", "Contract", "Internship"]).optional(),
    status: z.string().max(MAX_STATUS_LENGTH).optional(),
    priority: z.enum(["Low", "Medium", "High"]).optional(),
    application_date: z.string().max(32).optional(),
    notes: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
    contact_person: z.string().max(MAX_SHORT_TEXT_LENGTH).nullable().optional(),
    contact_email: z.string().email().max(MAX_SHORT_TEXT_LENGTH).nullable().optional(),
    job_description: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
    qualifications: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
    job_responsibilities: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
  })
  .strict()

function truncateString(value: string | null | undefined, maxLength: number) {
  if (value == null) return value
  return value.length > maxLength ? value.slice(0, maxLength) : value
}

interface ResumeScoringPayload {
  job: {
    company_name: string
    position_title: string
    job_description?: string | null
    qualifications?: string | null
    job_responsibilities?: string | null
    notes?: string | null
  }
  resumeText: string
  apiKey: string
}

async function generateResumeMatchScore({ job, resumeText, apiKey }: ResumeScoringPayload) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, RESUME_SCORING_TIMEOUT_MS)

  const systemPrompt = getResumeScoringSystemPrompt()

  const userPrompt = `Job application details:\n${JSON.stringify(job, null, 2)}\n\nCandidate resume:\n"""\n${resumeText}\n"""`

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Resume scoring OpenAI error:", errorText)
      return null
    }

    const json = await response.json()
    const content = json?.choices?.[0]?.message?.content

    if (!content) {
      console.error("Resume scoring response missing content", json)
      return null
    }

    let parsed: unknown

    try {
      parsed = JSON.parse(content)
    } catch (error) {
      console.error("Resume scoring JSON parse error", error, content)
      return null
    }

    const validation = ResumeScoreSchema.safeParse(parsed)

    if (!validation.success) {
      console.error("Resume scoring schema validation failed", validation.error)
      return null
    }

    const rawScore = validation.data.score
    const clampedScore = Math.min(100, Math.max(0, rawScore))
    const roundedScore = Math.round(clampedScore * 10) / 10

    return {
      score: roundedScore,
      summary: validation.data.summary?.trim() || null,
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("Resume scoring request timed out")
      return null
    }

    console.error("Resume scoring request failed", error)
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function OPTIONS() {
  const origin = headers().get("origin")
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(origin) })
}

export async function GET(request: NextRequest) {
  try {
    const corsHeaders = getCorsHeaders(request.headers.get("origin"))
    const auth = await getAuthedClient(request)
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error.message }, { status: auth.error.status, headers: corsHeaders })
    }

    const rateLimitResponse = await enforceRateLimit({
      request,
      userId: auth.userId,
      keyPrefix: "job-applications-create",
    })
    if (rateLimitResponse) {
      Object.entries(corsHeaders).forEach(([header, value]) => rateLimitResponse.headers.set(header, value))
      addVaryHeader(rateLimitResponse, `Authorization, ${USER_OPENAI_KEY_HEADER}`)
      return rateLimitResponse
    }

    const { supabase, userId } = auth
    const { searchParams } = new URL(request.url)

    const pageParam = searchParams.get("page")
    const limitParam = searchParams.get("limit")
    const page = pageParam ? Number.parseInt(pageParam, 10) : 1
    const requestedLimit = limitParam ? Number.parseInt(limitParam, 10) : 10
    const include_interviews = searchParams.get("include_interviews") === "true"
    const include_activity = searchParams.get("include_activity") === "true"
    const include_status_history = searchParams.get("include_status_history") === "true"

    // Filters
    const status = searchParams.get("status")?.split(",")
    const priority = searchParams.get("priority")?.split(",")
    const company_name = searchParams.get("company_name")
    const search = searchParams.get("search")
    const date_from = searchParams.get("date_from")
    const date_to = searchParams.get("date_to")

    // Sort
    const sort_field = searchParams.get("sort_field") || "created_at"
    const sort_direction = (searchParams.get("sort_direction") || "desc").toLowerCase() === "asc" ? "asc" : "desc"

    if (!Number.isInteger(page) || page < 1) {
      return NextResponse.json({ error: "Invalid page parameter." }, { status: 400, headers: corsHeaders })
    }

    if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
      return NextResponse.json({ error: "Invalid limit parameter." }, { status: 400, headers: corsHeaders })
    }

    if (!ALLOWED_JOB_APPLICATION_SORT_FIELDS.has(sort_field)) {
      return NextResponse.json({ error: "Invalid sort_field parameter." }, { status: 400, headers: corsHeaders })
    }

    const limit = Math.min(requestedLimit, MAX_JOB_APPLICATIONS_LIMIT)

    let query = supabase
      .from("job_applications")
      .select(
        `
        *
        ${include_interviews ? ", interviews(*)" : ""}
        ${include_activity ? ", activity_log(*)" : ""}
        ${include_status_history ? ", status_history:job_application_status_history(*)" : ""}
        , follow_up_draft:application_follow_up_drafts (generated_at, draft_text)
      `,
        { count: "exact" }
      )
      // belt-and-suspenders: still filter by user_id even with RLS
      .eq("user_id", userId)

    const expandedStatusFilters = expandStatusFilters(status ?? [])

    if (expandedStatusFilters.length > 0) query = query.in("status", expandedStatusFilters)
    if (priority && priority.length > 0) query = query.in("priority", priority)
    if (company_name) query = query.ilike("company_name", `%${company_name}%`)

    if (search) {
      const sanitizedSearch = search.replace(/,/g, "\\,")
      query = query.or(
        [
          `company_name.ilike.%${sanitizedSearch}%`,
          `position_title.ilike.%${sanitizedSearch}%`,
          `contact_person.ilike.%${sanitizedSearch}%`,
          `contact_email.ilike.%${sanitizedSearch}%`,
          `notes.ilike.%${sanitizedSearch}%`,
          `location.ilike.%${sanitizedSearch}%`,
        ].join(",")
      )
    }

    if (date_from) query = query.gte("application_date", date_from)
    if (date_to) query = query.lte("application_date", date_to)

    const { data, error, count } = await query
      .order(sort_field, { ascending: sort_direction === "asc" })
      .range((page - 1) * limit, page * limit - 1)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
    }

    const normalizedData = (data ?? []).map((application) => {
      const normalizedStatus = parseStatus(application.status).value
      const { follow_up_draft: followUpDraftRaw, ...applicationWithoutDraft } = application
      const draftRecords = Array.isArray(followUpDraftRaw)
        ? followUpDraftRaw
        : followUpDraftRaw
          ? [followUpDraftRaw]
          : []
      const draftGeneratedAt = draftRecords[0]?.generated_at ?? null
      const draftText = draftRecords[0]?.draft_text ?? null

      if (!include_status_history) {
        return {
          ...applicationWithoutDraft,
          status: normalizedStatus,
          ai_follow_up_draft_generated_at: draftGeneratedAt,
          ai_follow_up_draft_text: draftText,
        }
      }

      return {
        ...applicationWithoutDraft,
        status: normalizedStatus,
        status_history: [...(applicationWithoutDraft.status_history ?? [])]
          .map((entry) => ({ ...entry, status: normalizeStatusValue(entry.status) }))
          .sort((left, right) => new Date(left.changed_at).getTime() - new Date(right.changed_at).getTime()),
        ai_follow_up_draft_generated_at: draftGeneratedAt,
        ai_follow_up_draft_text: draftText,
      }
    })

    return NextResponse.json(
      {
        data: normalizedData,
        count,
        page,
        limit,
        total_pages: Math.ceil((count || 0) / limit),
      },
      {
        headers: {
          ...corsHeaders,
          "Cache-Control": "no-store",
        },
      }
    )
  } catch (error) {
    console.error("Failed to load job applications", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: corsHeaders })
  }
}

export async function POST(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request.headers.get("origin"))

  try {
    const csrfError = requireCookieCsrf(request)
    if (csrfError) {
      return NextResponse.json(
        { error: csrfError.error.message },
        { status: csrfError.error.status, headers: corsHeaders },
      )
    }

    const auth = await getAuthedClient(request)
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error.message }, { status: auth.error.status, headers: corsHeaders })
    }

    const { supabase, userId } = auth
    const keyResolution = await resolveOpenAIApiKey({ request, supabase, userId })

    if ("error" in keyResolution) {
      const response = keyResolution.error
      Object.entries(corsHeaders).forEach(([header, value]) => response.headers.set(header, value))
      addVaryHeader(response, `Authorization, ${USER_OPENAI_KEY_HEADER}`)
      return response
    }

    const openaiApiKey = keyResolution.apiKey
    const rawBody = await request.text()

    if (rawBody.length > MAX_BODY_CHARS || Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413, headers: corsHeaders })
    }

    let parsedBody: unknown

    try {
      parsedBody = JSON.parse(rawBody)
    } catch (error) {
      console.error("Job application JSON parse failed", error)
      return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: corsHeaders })
    }

    const validation = CreateJobApplicationSchema.safeParse(parsedBody)

    if (!validation.success) {
      console.error("Job application validation failed", validation.error)
      return NextResponse.json({ error: "Invalid input" }, { status: 400, headers: corsHeaders })
    }

    const body: CreateJobApplicationData = validation.data

    const insertData = {
      ...body,
      user_id: userId,
      location: toNullableString(body.location ?? null),
      salary_range: toNullableString(body.salary_range ?? null),
      notes: truncateString(toNullableString(body.notes ?? null), MAX_LONG_TEXT_LENGTH),
      job_url: toNullableString(body.job_url ?? null),
      contact_email: toNullableString(body.contact_email ?? null),
      contact_person: toNullableString(body.contact_person ?? null),
      job_description: truncateString(toNullableString(body.job_description ?? null), MAX_LONG_TEXT_LENGTH),
      qualifications: truncateString(toNullableString(body.qualifications ?? null), MAX_LONG_TEXT_LENGTH),
      job_responsibilities: truncateString(toNullableString(body.job_responsibilities ?? null), MAX_LONG_TEXT_LENGTH),
      resume_match_score: null as number | null,
      resume_match_summary: null as string | null
    }

    if (insertData.status) {
      insertData.status = normalizeStatusValue(insertData.status)
    }

    const { data, error } = await supabase.from("job_applications").insert([insertData]).select().single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
    }

    if (data?.id && data?.status) {
      const { error: historyError } = await supabase.from("job_application_status_history").insert({
        job_application_id: data.id,
        user_id: userId,
        status: data.status,
        changed_at: data.created_at ?? new Date().toISOString(),
      })

      if (historyError) {
        console.error("Failed to record status history for new application", historyError)
      }
    }

    if (!data?.id) {
      console.error("Resume match scoring: skipped, inserted record missing id")
    } else {
      const jobContext = {
        company_name: body.company_name,
        position_title: body.position_title,
        job_description: body.job_description ?? null,
        qualifications: body.qualifications ?? null,
        job_responsibilities: body.job_responsibilities ?? null,
        notes: body.notes ?? null,
      }

      void (async () => {
        try {
          const resume = await getLatestResumeText(userId)

          if (!resume?.text) {
            console.info("Resume match scoring: no resume text available", { userId })
            return
          }

          console.info("Resume match scoring: found resume text for user, initiating scoring", { userId })
          const scoringResult = await generateResumeMatchScore({
            job: jobContext,
            resumeText: resume.text,
            apiKey: openaiApiKey,
          })

          if (!scoringResult) {
            console.info("Resume match scoring: no score returned", {
              userId,
              company: jobContext.company_name,
              position: jobContext.position_title,
            })
            return
          }

          console.info("Resume match scoring: score computed", {
            userId,
            resumeMatchScore: scoringResult.score,
            hasSummary: Boolean(scoringResult.summary),
          })

          const { error: updateError } = await supabase
            .from("job_applications")
            .update({
              resume_match_score: scoringResult.score,
              resume_match_summary: toNullableString(scoringResult.summary ?? null),
            })
            .eq("id", data.id)

          if (updateError) {
            console.error("Resume match scoring: failed to update job application", updateError)
          }
        } catch (error) {
          console.error("Resume match scoring: failed to generate score", error)
        }
      })()
    }

    const response = NextResponse.json({ data }, { status: 201, headers: corsHeaders })
    addVaryHeader(response, `Authorization, ${USER_OPENAI_KEY_HEADER}`)
    return response
  } catch (error) {
    console.error("Failed to create job application", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: corsHeaders })
  }
}
