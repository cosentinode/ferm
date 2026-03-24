import { type NextRequest, NextResponse } from "next/server"

import { createAdminSupabaseClient } from "@/lib/supabase/admin"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { requireCookieCsrf } from "@/lib/api/auth"
import { enforceRateLimit } from "@/lib/api/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const RESUME_BUCKET = "resumes"

async function deleteUserStorage(userId: string) {
  const admin = createAdminSupabaseClient()
  const { data: files, error: listError } = await admin.storage.from(RESUME_BUCKET).list(userId)

  if (listError && listError.message !== "The resource was not found") {
    throw listError
  }

  const paths = files?.map((file) => `${userId}/${file.name}`) ?? []

  if (paths.length === 0) {
    return
  }

  const { error: removeError } = await admin.storage.from(RESUME_BUCKET).remove(paths)

  if (removeError) {
    throw removeError
  }
}

async function deleteUserData(userId: string) {
  const admin = createAdminSupabaseClient()

  const tables = [
    "application_follow_up_drafts",
    "application_follow_ups",
    "activity_log",
    "interviews",
    "job_application_status_history",
    "llm_usage",
    "job_applications",
    "resume_texts",
  ] as const

  for (const table of tables) {
    const { error } = await admin.from(table).delete().eq("user_id", userId)

    if (error) {
      throw error
    }
  }

  await deleteUserStorage(userId)

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId)

  if (deleteError) {
    throw deleteError
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
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rateLimitResponse = await enforceRateLimit({
      request,
      userId: user.id,
      keyPrefix: "account-delete",
      maxRequests: 5,
      windowMs: 60_000,
    })
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    await deleteUserData(user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete account", error)
    return NextResponse.json({ error: "Unable to delete account" }, { status: 500 })
  }
}
