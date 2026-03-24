import { type NextRequest, NextResponse } from "next/server"

import { createServerSupabaseClient } from "@/lib/supabase/server"
import type { UpdateInterviewData } from "@/lib/types/database"
import { requireCookieCsrf } from "@/lib/api/auth"
import { enforceRateLimit } from "@/lib/api/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params

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
      keyPrefix: "interviews-update",
    })
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const body: Partial<UpdateInterviewData> = await request.json()
    const updates: Partial<UpdateInterviewData> = { ...body }
    delete (updates as { id?: string }).id
    delete (updates as { user_id?: string }).user_id

    const { data: currentInterview, error: currentError } = await supabase
      .from("interviews")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (currentError) {
      const status = currentError.code === "PGRST116" ? 404 : 500
      const message = currentError.code === "PGRST116" ? "Interview not found" : currentError.message
      return NextResponse.json({ error: message }, { status })
    }

    const mergedInterview = { ...currentInterview, ...updates }
    const parsedRound = Number.isFinite(Number(mergedInterview.interview_round))
      ? Math.max(1, Number(mergedInterview.interview_round))
      : null
    const scheduledDate = mergedInterview.scheduled_date
      ? new Date(mergedInterview.scheduled_date)
      : null
    const currentScheduledDate = currentInterview.scheduled_date
      ? new Date(currentInterview.scheduled_date)
      : null

    if (!parsedRound) {
      return NextResponse.json({ error: "Invalid interview round" }, { status: 400 })
    }

    if (!scheduledDate || Number.isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: "Invalid scheduled date" }, { status: 400 })
    }

    const isScheduledDateUnchanged =
      currentScheduledDate &&
      !Number.isNaN(currentScheduledDate.getTime()) &&
      currentScheduledDate.getTime() === scheduledDate.getTime()

    const shouldValidateScheduledFuture =
      mergedInterview.status === "Scheduled" &&
      !(isScheduledDateUnchanged && currentInterview.status === "Scheduled")

    if (shouldValidateScheduledFuture && scheduledDate.getTime() < Date.now()) {
      return NextResponse.json(
        { error: "Scheduled interviews must use a future date and time." },
        { status: 400 },
      )
    }

    const { data: relatedInterviews, error: relatedError } = await supabase
      .from("interviews")
      .select("id, interview_round, scheduled_date")
      .eq("user_id", user.id)
      .eq("job_application_id", mergedInterview.job_application_id)
      .neq("id", id)

    if (relatedError) {
      return NextResponse.json({ error: relatedError.message }, { status: 500 })
    }

    if (relatedInterviews?.some((interview) => interview.interview_round === parsedRound)) {
      return NextResponse.json({ error: `Interview round ${parsedRound} already exists` }, { status: 400 })
    }

    const previousInterview = relatedInterviews
      ?.filter((interview) =>
        typeof interview.interview_round === "number" && interview.interview_round < parsedRound,
      )
      .sort((a, b) => (b.interview_round ?? 0) - (a.interview_round ?? 0))[0]

    if (previousInterview) {
      const previousDate = new Date(previousInterview.scheduled_date)
      if (!Number.isNaN(previousDate.getTime()) && scheduledDate <= previousDate) {
        return NextResponse.json(
          {
            error: `Interview round ${parsedRound} must be scheduled after round ${previousInterview.interview_round}`,
            code: "ROUND_SEQUENCE_CONFLICT",
            blocked_round: parsedRound,
            latest_completed_round: previousInterview.interview_round,
            latest_completed_date: previousInterview.scheduled_date,
          },
          { status: 400 },
        )
      }
    }

    const nextInterview = relatedInterviews
      ?.filter((interview) =>
        typeof interview.interview_round === "number" && interview.interview_round > parsedRound,
      )
      .sort((a, b) => (a.interview_round ?? 0) - (b.interview_round ?? 0))[0]

    if (nextInterview) {
      const nextDate = new Date(nextInterview.scheduled_date)
      if (!Number.isNaN(nextDate.getTime()) && scheduledDate >= nextDate) {
        return NextResponse.json(
          {
            error: `Interview round ${parsedRound} must be scheduled before round ${nextInterview.interview_round}`,
            code: "ROUND_SEQUENCE_CONFLICT",
            blocked_round: parsedRound,
            earliest_scheduled_round: nextInterview.interview_round,
            earliest_scheduled_date: nextInterview.scheduled_date,
          },
          { status: 400 },
        )
      }
    }

    const { data, error } = await supabase
      .from("interviews")
      .update({ ...updates, interview_round: parsedRound, scheduled_date: scheduledDate.toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .select(`
        *,
        job_applications(company_name, position_title)
      `)
      .single()

    if (error) {
      const status = error.code === "PGRST116" ? 404 : 500
      const message = error.code === "PGRST116" ? "Interview not found" : error.message
      return NextResponse.json({ error: message }, { status })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error("Failed to update interview", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params

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
      keyPrefix: "interviews-delete",
    })
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const { error } = await supabase.from("interviews").delete().eq("id", id).eq("user_id", user.id)

    if (error) {
      const status = error.code === "PGRST116" ? 404 : 500
      const message = error.code === "PGRST116" ? "Interview not found" : error.message
      return NextResponse.json({ error: message }, { status })
    }

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error("Failed to delete interview", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
