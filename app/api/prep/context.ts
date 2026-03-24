import { getLatestResumeText } from "@/lib/resume/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getPrepBaseContextPrompt } from "@/lib/ai/prompts"

const MAX_SECTION_LENGTH = 1800
const MAX_INTERVIEW_HISTORY = 5

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

function trimSection(input: string | null | undefined, maxLength = MAX_SECTION_LENGTH) {
  if (!input) return null
  if (input.length <= maxLength) return input
  return `${input.slice(0, maxLength)}\n...[trimmed]`
}

function formatInterviewHistory(interviews: Array<Record<string, string | null>>) {
  if (interviews.length === 0) return "No interviews logged yet."

  return interviews
    .slice(0, MAX_INTERVIEW_HISTORY)
    .map((interview, index) => {
      const details = [
        interview.interview_type ? `${interview.interview_type}` : null,
        interview.status ? `${interview.status}` : null,
        interview.scheduled_date ? new Date(interview.scheduled_date).toLocaleDateString() : null,
      ]
        .filter(Boolean)
        .join(" · ")

      const notes =
        trimSection(
          interview.post_interview_notes || interview.prep_notes || interview.notes || null,
          Math.round(MAX_SECTION_LENGTH / 4),
        ) || "No notes recorded."

      return `${index + 1}. ${details || "Interview"} — ${notes}`
    })
    .join("\n")
}

export async function buildPrepContext({
  supabase,
  userId,
  applicationId,
  extraContext,
}: {
  supabase: SupabaseClient
  userId: string
  applicationId?: string | null
  extraContext?: string | null
}) {
  const [resume, application] = await Promise.all([
    getLatestResumeText(userId).catch(() => null),
    applicationId
      ? supabase
          .from("job_applications")
          .select(
            "id, company_name, position_title, job_description, qualifications, job_responsibilities, notes, resume_match_summary",
          )
          .eq("id", applicationId)
          .eq("user_id", userId)
          .maybeSingle()
          .then((result) => result.data)
      : Promise.resolve(null),
  ])

  const interviews = applicationId
    ? await supabase
        .from("interviews")
        .select("interview_type, scheduled_date, status, notes, prep_notes, post_interview_notes")
        .eq("job_application_id", applicationId)
        .eq("user_id", userId)
        .order("scheduled_date", { ascending: false })
        .limit(MAX_INTERVIEW_HISTORY)
        .then((result) => result.data ?? [])
    : []

  const contextSections: string[] = [
    getPrepBaseContextPrompt(),
  ]

  if (resume?.text) {
    contextSections.push(`Resume (${resume.fileName ?? "upload"}, updated ${resume.updatedAt ?? "recently"}):\n${trimSection(resume.text)}`)
  } else {
    contextSections.push("No resume on file; rely on the job description and interview notes for guidance.")
  }

  if (application) {
    contextSections.push(
      [
        `Role: ${application.position_title ?? "Unknown title"} at ${application.company_name ?? "Unknown company"}`,
        application.job_description ? `Job description: ${trimSection(application.job_description)}` : null,
        application.qualifications ? `Qualifications: ${trimSection(application.qualifications)}` : null,
        application.job_responsibilities ? `Responsibilities: ${trimSection(application.job_responsibilities)}` : null,
        application.resume_match_summary ? `Resume fit summary: ${trimSection(application.resume_match_summary, 800)}` : null,
        application.notes ? `Recruiter or personal notes: ${trimSection(application.notes, 800)}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
  }

  if (interviews.length > 0) {
    contextSections.push(`Interview history (latest first):\n${formatInterviewHistory(interviews)}`)
  }

  if (extraContext) {
    contextSections.push(extraContext)
  }

  return contextSections.join("\n\n")
}

export { MAX_INTERVIEW_HISTORY, MAX_SECTION_LENGTH, formatInterviewHistory, trimSection }
