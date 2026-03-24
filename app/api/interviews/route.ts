import { type NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import type { CreateInterviewData } from "@/lib/types/database"
import { requireCookieCsrf } from "@/lib/api/auth"
import { enforceRateLimit } from "@/lib/api/rate-limit"

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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
    const { searchParams } = new URL(request.url)

    const job_application_id = searchParams.get("job_application_id")
    const upcoming_only = searchParams.get("upcoming_only") === "true"

    let query = supabase
      .from("interviews")
      .select(`
        *,
        job_applications(company_name, position_title)
      `)
      .eq("user_id", user.id)

    if (job_application_id) {
      query = query.eq("job_application_id", job_application_id)
    }

    if (upcoming_only) {
      query = query.gte("scheduled_date", new Date().toISOString()).eq("status", "Scheduled")
    }

    const { data, error } = await query.order("scheduled_date", { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(
      { data },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    )
  } catch (error) {
    console.error("Failed to load interviews", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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
      keyPrefix: "interviews-create",
    })
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const body: CreateInterviewData = await request.json()

    const parsedRound = Number.isFinite(Number(body.interview_round))
      ? Math.max(1, Number(body.interview_round))
      : 1
    const scheduledDate = new Date(body.scheduled_date)

    if (body.status === "Scheduled" && scheduledDate.getTime() < Date.now()) {
      return NextResponse.json(
        { error: "Scheduled interviews must use a future date and time." },
        { status: 400 },
      )
    }

    if (Number.isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: "Invalid scheduled date" }, { status: 400 })
    }

    const { data: existingInterviews, error: existingError } = await supabase
      .from("interviews")
      .select("id, interview_round, scheduled_date")
      .eq("user_id", user.id)
      .eq("job_application_id", body.job_application_id)

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 })
    }

    if (existingInterviews?.some((interview) => interview.interview_round === parsedRound)) {
      return NextResponse.json({ error: `Interview round ${parsedRound} already exists` }, { status: 400 })
    }

    const previousInterview = existingInterviews
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

    const nextInterview = existingInterviews
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
      .insert([
        { ...body, interview_round: parsedRound, scheduled_date: scheduledDate.toISOString(), user_id: user.id },
      ])
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error("Failed to create interview", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
