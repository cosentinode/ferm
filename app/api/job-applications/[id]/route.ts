import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { requireCookieCsrf } from "@/lib/api/auth"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import type { UpdateJobApplicationData } from "@/lib/types/database"
import { toNullableString } from "@/lib/utils"
import { isStatusProgressionAllowed, normalizeStatusValue, parseStatus } from "@/lib/status"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_CHARS = 100_000
const MAX_BODY_BYTES = 100_000
const MAX_LONG_TEXT_LENGTH = 8_192
const MAX_SHORT_TEXT_LENGTH = 255
const MAX_STATUS_LENGTH = 64

const UpdateJobApplicationSchema = z
  .object({
    company_name: z.string().min(1).max(MAX_SHORT_TEXT_LENGTH).optional(),
    position_title: z.string().min(1).max(MAX_SHORT_TEXT_LENGTH).optional(),
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

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 401 })
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { id } = params

    const { data, error } = await supabase
      .from("job_applications")
      .select(`
        *,
        interviews(*),
        activity_log(*),
        status_history:job_application_status_history(*)
      `)
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: "Job application not found" }, { status: 404 })
    }

    const normalizedData = {
      ...data,
      status: parseStatus(data.status).value,
      status_history: [...(data.status_history ?? [])]
        .map((entry) => ({ ...entry, status: normalizeStatusValue(entry.status) }))
        .sort((left, right) => new Date(left.changed_at).getTime() - new Date(right.changed_at).getTime()),
    }

    return NextResponse.json(
      { data: normalizedData },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    )
  } catch (error) {
    console.error("Failed to load job application", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params
  let sanitizedUpdates: Partial<UpdateJobApplicationData> = {}
  let userId: string | null = null
  try {
    const csrfError = requireCookieCsrf(request)
    if (csrfError) {
      return NextResponse.json({ error: csrfError.error.message }, { status: csrfError.error.status })
    }

    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 401 })
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    userId = user.id

    const rateLimitResponse = await enforceRateLimit({
      request,
      userId: user.id,
      keyPrefix: "job-applications-update",
    })
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const rawBody = await request.text()

    if (rawBody.length > MAX_BODY_CHARS || Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 })
    }

    let parsedBody: unknown

    try {
      parsedBody = JSON.parse(rawBody)
    } catch (error) {
      console.error("Job application update JSON parse failed", error)
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const validation = UpdateJobApplicationSchema.safeParse(parsedBody)

    if (!validation.success) {
      console.error("Job application update validation failed", validation.error)
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const body: Partial<UpdateJobApplicationData> = validation.data
    const updates: Partial<UpdateJobApplicationData> = { ...body }
    delete (updates as { id?: string }).id
    delete (updates as { user_id?: string }).user_id
    delete (updates as { resume_match_score?: number | null }).resume_match_score
    delete (updates as { resume_match_summary?: string | null }).resume_match_summary

    const nullableFields: (keyof UpdateJobApplicationData)[] = [
      "location",
      "salary_range",
      "job_url",
      "contact_person",
      "contact_email",
      "notes",
      "job_description",
      "qualifications",
      "job_responsibilities",
    ]

    sanitizedUpdates = { ...updates }
    const mutableUpdates = sanitizedUpdates as Record<string, string | null | undefined>
    for (const field of nullableFields) {
      if (field in mutableUpdates) {
        mutableUpdates[field as string] = truncateString(
          toNullableString(mutableUpdates[field as string]),
          MAX_LONG_TEXT_LENGTH,
        )
      }
    }

    const statusInPayload = Object.prototype.hasOwnProperty.call(sanitizedUpdates, "status")
    let previousStatus: string | null = null

    if (statusInPayload) {
      const { data: existing, error: existingError } = await supabase
        .from("job_applications")
        .select("status")
        .eq("id", id)
        .eq("user_id", user.id)
        .single()

      if (existingError) {
        if (existingError.code === "PGRST116") {
          return NextResponse.json({ error: "Job application not found" }, { status: 404 })
        }

        console.error("Failed to load current status before update", existingError)
        return NextResponse.json({ error: existingError.message }, { status: 500 })
      }

      previousStatus = existing?.status ?? null

      if (typeof sanitizedUpdates.status === "string") {
        const nextStatus = normalizeStatusValue(sanitizedUpdates.status)
        if (!isStatusProgressionAllowed(previousStatus, nextStatus)) {
          console.warn("Status progression prevented", {
            jobId: id,
            userId,
            previousStatus,
            attemptedStatus: nextStatus,
          })
          return NextResponse.json(
            { error: "Status cannot move backwards in the pipeline" },
            { status: 400 },
          )
        }

        sanitizedUpdates.status = nextStatus
      }
    }

    const { data, error } = await supabase
      .from("job_applications")
      .update(sanitizedUpdates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single()

    if (error) {
      console.error("Supabase failed to update job application", {
        jobId: id,
        userId,
        updates: sanitizedUpdates,
        error,
      })
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 500 },
      )
    }

    if (statusInPayload && data?.status && previousStatus !== data.status) {
      const previousNormalized = parseStatus(previousStatus).value
      const nextNormalized = parseStatus(data.status).value

      if (nextNormalized === "Applied" && previousNormalized !== "Applied") {
        const { error: deleteError } = await supabase
          .from("job_application_status_history")
          .delete()
          .eq("job_application_id", id)
          .eq("user_id", user.id)

        if (deleteError) {
          console.error("Failed to clear status history during reset", {
            jobId: id,
            userId,
            deleteError,
          })
        }

        const { error: interviewDeleteError } = await supabase
          .from("interviews")
          .delete()
          .eq("job_application_id", id)
          .eq("user_id", user.id)

        if (interviewDeleteError) {
          console.error("Failed to clear interviews during reset", {
            jobId: id,
            userId,
            interviewDeleteError,
          })
        }
      } else {
        const { error: historyError } = await supabase.from("job_application_status_history").insert({
          job_application_id: id,
          user_id: user.id,
          status: data.status,
          changed_at: data.updated_at ?? new Date().toISOString(),
        })

        if (historyError) {
          console.error("Failed to record status history change", {
            jobId: id,
            userId,
            newStatus: data.status,
            historyError,
          })
        }
      }
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error("Failed to update job application", {
      jobId: id,
      userId,
      updates: sanitizedUpdates,
      error,
    })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const csrfError = requireCookieCsrf(request)
    if (csrfError) {
      return NextResponse.json({ error: csrfError.error.message }, { status: csrfError.error.status })
    }

    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 401 })
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const rateLimitResponse = await enforceRateLimit({
      request,
      userId: user.id,
      keyPrefix: "job-applications-delete",
    })
    if (rateLimitResponse) {
      return rateLimitResponse
    }
    const { id } = params

    const { error } = await supabase
      .from("job_applications")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ message: "Job application deleted successfully" })
  } catch (error) {
    console.error("Failed to delete job application", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
