import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { getAuthedClient, requireCookieCsrf } from "@/lib/api/auth"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import { resolveOpenAIApiKey, USER_OPENAI_KEY_HEADER } from "@/lib/ai/keys"
import { getLatestResumeText } from "@/lib/resume/server"
import { applyTemplate, getFollowUpSystemPrompt, getFollowUpUserPromptTemplate } from "@/lib/ai/prompts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DraftSchema = z.object({
  job_application_id: z.string().uuid(),
  companyName: z.string().min(1),
  positionTitle: z.string().min(1),
  contactName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  jobDescription: z.string().optional().nullable(),
  appliedAt: z.string().optional().nullable(),
  daysSinceApplication: z.number().int().min(0).max(365),
})

const UpdateDraftSchema = z.object({
  job_application_id: z.string().uuid(),
  draft: z.string(),
})

export async function POST(request: NextRequest) {
  const csrfError = requireCookieCsrf(request)
  if (csrfError) {
    return NextResponse.json({ error: csrfError.error.message }, { status: csrfError.error.status })
  }

  const auth = await getAuthedClient(request)
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status })
  }

  const rateLimitResponse = await enforceRateLimit({
    request,
    userId: auth.userId,
    keyPrefix: "follow-ups-draft",
  })
  if (rateLimitResponse) {
    rateLimitResponse.headers.set("Vary", `Authorization, ${USER_OPENAI_KEY_HEADER}`)
    return rateLimitResponse
  }

  const keyResolution = await resolveOpenAIApiKey({
    request,
    supabase: auth.supabase,
    userId: auth.userId,
  })

  if ("error" in keyResolution) {
    const response = keyResolution.error
    response.headers.set("Vary", `Authorization, ${USER_OPENAI_KEY_HEADER}`)
    return response
  }

  const payload = DraftSchema.safeParse(await request.json())
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.message }, { status: 400 })
  }

  const { supabase, userId } = auth
  const {
    job_application_id,
    companyName,
    positionTitle,
    contactName,
    notes,
    jobDescription,
    appliedAt,
    daysSinceApplication,
  } =
    payload.data

  const { data: application, error: applicationError } = await supabase
    .from("job_applications")
    .select("id")
    .eq("id", job_application_id)
    .eq("user_id", userId)
    .maybeSingle()

  if (applicationError) {
    return NextResponse.json({ error: applicationError.message }, { status: 500 })
  }

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 })
  }

  const { data: existingDraft, error: existingDraftError } = await supabase
    .from("application_follow_up_drafts")
    .select("id, generated_at, draft_text")
    .eq("job_application_id", job_application_id)
    .eq("user_id", userId)
    .maybeSingle()

  if (existingDraftError) {
    return NextResponse.json({ error: existingDraftError.message }, { status: 500 })
  }

  if (existingDraft) {
    const response = NextResponse.json(
      {
        error: "An AI follow-up draft has already been generated for this application.",
        data: existingDraft.draft_text ? { draft: existingDraft.draft_text } : undefined,
      },
      { status: 409 },
    )
    response.headers.set("Vary", `Authorization, ${USER_OPENAI_KEY_HEADER}`)
    return response
  }
  
  const { data: profile, error: profileError } = await supabase.auth.getUser()
  
  if (profileError) {
    return NextResponse.json({ error: "Unable to determine user profile" }, { status: 500 })
  }

  const userEmail = profile.user.email

  let resumeText: string | null = null
  try {
    const resume = await getLatestResumeText(userId)
    resumeText = resume?.text?.trim() || null
  } catch (error) {
    console.error("Failed to load resume text for follow-up draft", error)
  }

  const notesText = notes?.trim() || "None"
  const jobDescriptionExcerpt = jobDescription ? jobDescription.slice(0, 1200) : null
  const resumeContext = resumeText || "Not provided"

  const userPrompt = applyTemplate(getFollowUpUserPromptTemplate(), {
    USER_EMAIL: userEmail,
    COMPANY_NAME: companyName,
    POSITION_TITLE: positionTitle,
    CONTACT_NAME: contactName ?? "Hiring manager",
    DAYS_SINCE_APPLICATION: String(daysSinceApplication),
    APPLIED_AT: appliedAt ?? "Unknown",
    NOTES_TEXT: notesText,
    JOB_DESCRIPTION_EXCERPT: jobDescriptionExcerpt ?? "Not provided",
    RESUME_CONTEXT: resumeContext,
  })

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${keyResolution.apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: getFollowUpSystemPrompt(),
        },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.6,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return NextResponse.json({ error: errorText || "Failed to generate follow-up draft" }, { status: response.status })
  }

  const completion = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[]
  }

  const draft = completion?.choices?.[0]?.message?.content?.trim()

  if (!draft) {
    return NextResponse.json({ error: "Draft generation did not return any content" }, { status: 502 })
  }

  const { error: draftRecordError } = await supabase
    .from("application_follow_up_drafts")
    .insert({ user_id: userId, job_application_id, draft_text: draft })

  if (draftRecordError) {
    if (draftRecordError.code === "23505") {
      const response = NextResponse.json(
        { error: "An AI follow-up draft has already been generated for this application." },
        { status: 409 },
      )
      response.headers.set("Vary", `Authorization, ${USER_OPENAI_KEY_HEADER}`)
      return response
    }

    return NextResponse.json({ error: draftRecordError.message }, { status: 500 })
  }

  const successResponse = NextResponse.json({ data: { draft } })
  successResponse.headers.set("Vary", `Authorization, ${USER_OPENAI_KEY_HEADER}`)
  return successResponse
}

export async function PATCH(request: NextRequest) {
  const csrfError = requireCookieCsrf(request)
  if (csrfError) {
    return NextResponse.json({ error: csrfError.error.message }, { status: csrfError.error.status })
  }

  const auth = await getAuthedClient(request)
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status })
  }

  const rateLimitResponse = await enforceRateLimit({
    request,
    userId: auth.userId,
    keyPrefix: "follow-ups-draft",
  })
  if (rateLimitResponse) {
    rateLimitResponse.headers.set("Vary", `Authorization, ${USER_OPENAI_KEY_HEADER}`)
    return rateLimitResponse
  }

  const payload = UpdateDraftSchema.safeParse(await request.json())
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.message }, { status: 400 })
  }

  const sanitizedDraft = payload.data.draft.trim()
  if (!sanitizedDraft) {
    return NextResponse.json({ error: "Draft cannot be empty" }, { status: 400 })
  }

  const { supabase, userId } = auth
  const { job_application_id } = payload.data

  const { data: existingDraft, error: existingDraftError } = await supabase
    .from("application_follow_up_drafts")
    .select("id")
    .eq("job_application_id", job_application_id)
    .eq("user_id", userId)
    .maybeSingle()

  if (existingDraftError) {
    return NextResponse.json({ error: existingDraftError.message }, { status: 500 })
  }

  if (!existingDraft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 })
  }

  const { error: updateError } = await supabase
    .from("application_follow_up_drafts")
    .update({ draft_text: sanitizedDraft })
    .eq("id", existingDraft.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const response = NextResponse.json({ data: { draft: sanitizedDraft } })
  response.headers.set("Vary", `Authorization, ${USER_OPENAI_KEY_HEADER}`)
  return response
}
