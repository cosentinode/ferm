import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import type { BulkUpdateJobApplicationsData } from "@/lib/types/api"
import type { CreateJobApplicationData } from "@/lib/types/database"
import { toNullableString } from "@/lib/utils"
import { isStatusProgressionAllowed, normalizeStatusValue, parseStatus } from "@/lib/status"
import { requireCookieCsrf } from "@/lib/api/auth"
import { enforceRateLimit } from "@/lib/api/rate-limit"

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_CHARS = 100_000
const MAX_BODY_BYTES = 100_000
const MAX_LONG_TEXT_LENGTH = 8_192
const MAX_SHORT_TEXT_LENGTH = 255
const MAX_STATUS_LENGTH = 64

const BulkUpdateSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1),
    updates: z
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
      .strict(),
  })
  .strict()

const BulkDeleteSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1),
  })
  .strict()

function truncateString(value: string | null | undefined, maxLength: number) {
  if (value == null) return value
  return value.length > maxLength ? value.slice(0, maxLength) : value
}

export async function PUT(request: NextRequest) {
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
      keyPrefix: "job-applications-bulk-update",
      maxRequests: 20,
      windowMs: 60_000,
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
      console.error("Bulk update JSON parse failed", error)
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const validation = BulkUpdateSchema.safeParse(parsedBody)

    if (!validation.success) {
      console.error("Bulk update validation failed", validation.error)
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const body: BulkUpdateJobApplicationsData = validation.data
    const { ids, updates } = body

    if (!ids || ids.length === 0) {
      return NextResponse.json({ error: "No application IDs provided" }, { status: 400 })
    }

    const sanitizedUpdates: Partial<CreateJobApplicationData> = { ...updates }
    const nullableFields: (keyof CreateJobApplicationData)[] = [
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
    const mutableUpdates = sanitizedUpdates as Record<string, string | null | undefined>
    for (const field of nullableFields) {
      if (field in mutableUpdates) {
        mutableUpdates[field as string] = truncateString(
          toNullableString(mutableUpdates[field as string]),
          MAX_LONG_TEXT_LENGTH,
        )
      }
    }
    delete (sanitizedUpdates as { user_id?: string }).user_id
    delete (sanitizedUpdates as { resume_match_score?: number | null }).resume_match_score
    delete (sanitizedUpdates as { resume_match_summary?: string | null }).resume_match_summary

    const statusInPayload = Object.prototype.hasOwnProperty.call(sanitizedUpdates, "status")
    let previousStatuses: Record<string, string> = {}

    if (statusInPayload) {
      const { data: existingStatuses, error: existingError } = await supabase
        .from("job_applications")
        .select("id, status")
        .in("id", ids)
        .eq("user_id", user.id)

      if (existingError) {
        return NextResponse.json({ error: existingError.message }, { status: 500 })
      }

      previousStatuses = Object.fromEntries((existingStatuses ?? []).map((record) => [record.id, record.status]))

      if (typeof sanitizedUpdates.status === "string") {
        const nextStatus = normalizeStatusValue(sanitizedUpdates.status)
        const hasRegression = (existingStatuses ?? []).some((record) =>
          record?.status ? !isStatusProgressionAllowed(record.status, nextStatus) : false,
        )

        if (hasRegression) {
          return NextResponse.json(
            { error: "At least one application cannot move backwards in the pipeline" },
            { status: 400 },
          )
        }

        sanitizedUpdates.status = nextStatus
      }
    }

    const { data, error } = await supabase
      .from("job_applications")
      .update(sanitizedUpdates)
      .in("id", ids)
      .eq("user_id", user.id)
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (statusInPayload) {
      for (const record of data ?? []) {
        if (!record?.id || !record?.status) continue
        if (previousStatuses[record.id] === record.status) continue

        const previousNormalized = parseStatus(previousStatuses[record.id]).value
        const nextNormalized = parseStatus(record.status).value

        if (nextNormalized === "Applied" && previousNormalized !== "Applied") {
          const { error: deleteError } = await supabase
            .from("job_application_status_history")
            .delete()
            .eq("job_application_id", record.id)
            .eq("user_id", user.id)

          if (deleteError) {
            console.error("Failed to clear status history during bulk reset", deleteError, {
              recordId: record.id,
            })
          }

          continue
        }

        const { error: historyError } = await supabase.from("job_application_status_history").insert({
          job_application_id: record.id,
          user_id: user.id,
          status: record.status,
          changed_at: record.updated_at ?? new Date().toISOString(),
        })

        if (historyError) {
          console.error("Failed to record status history for bulk update", historyError, { recordId: record.id })
        }
      }
    }

    return NextResponse.json({
      data,
      message: `Updated ${data.length} job applications`,
    })
  } catch (error) {
    console.error("Failed to bulk update job applications", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
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
      keyPrefix: "job-applications-bulk-delete",
      maxRequests: 20,
      windowMs: 60_000,
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
      console.error("Bulk delete JSON parse failed", error)
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const validation = BulkDeleteSchema.safeParse(parsedBody)

    if (!validation.success) {
      console.error("Bulk delete validation failed", validation.error)
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { ids }: { ids: string[] } = validation.data

    if (!ids || ids.length === 0) {
      return NextResponse.json({ error: "No application IDs provided" }, { status: 400 })
    }

    const { error } = await supabase
      .from("job_applications")
      .delete()
      .in("id", ids)
      .eq("user_id", user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      message: `Deleted ${ids.length} job applications`,
    })
  } catch (error) {
    console.error("Failed to bulk delete job applications", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
