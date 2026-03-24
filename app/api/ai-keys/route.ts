import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { getAuthedClient, requireCookieCsrf } from "@/lib/api/auth"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import { decryptApiKey, encryptApiKey, normalizeApiKey } from "@/lib/ai/keys"

const PROVIDER = "openai"

const BodySchema = z.object({
  apiKey: z.string().min(1),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function verifyOpenAIKey(apiKey: string): Promise<{ ok: boolean; message?: string }> {
  const response = await fetch("https://api.openai.com/v1/models", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  })

  if (response.ok) {
    return { ok: true }
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, message: "OpenAI rejected this API key." }
  }

  const fallback = await response.text().catch(() => "")
  return {
    ok: false,
    message: fallback ? `OpenAI validation failed: ${fallback}` : "Unable to validate the OpenAI API key.",
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthedClient(request)
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status })
  }

  const { data, error } = await auth.supabase
    .from("user_ai_keys")
    .select("encrypted_api_key, encryption_iv")
    .eq("user_id", auth.userId)
    .eq("provider", PROVIDER)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: "Unable to load stored key." }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ hasKey: false })
  }

  if (!data.encrypted_api_key || !data.encryption_iv) {
    return NextResponse.json({ error: "Stored key is incomplete." }, { status: 500 })
  }

  const plaintext = decryptApiKey(data.encrypted_api_key, data.encryption_iv)

  if (!plaintext) {
    return NextResponse.json({ error: "Unable to decrypt stored key." }, { status: 500 })
  }

  const normalized = normalizeApiKey(plaintext)
  if (!normalized) {
    return NextResponse.json({ error: "Stored key is invalid." }, { status: 500 })
  }

  return NextResponse.json({ hasKey: true })
}

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
    keyPrefix: "ai-keys-upsert",
    maxRequests: 10,
    windowMs: 60_000,
  })
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  let payload: z.infer<typeof BodySchema>
  try {
    payload = BodySchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 })
  }

  const apiKey = normalizeApiKey(payload.apiKey)
  if (!apiKey) {
    return NextResponse.json({ error: "API key format is invalid." }, { status: 400 })
  }

  const validation = await verifyOpenAIKey(apiKey)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.message ?? "Invalid OpenAI API key." }, { status: 401 })
  }

  let encryptedApiKey: string
  let encryptionIv: string
  try {
    const encrypted = encryptApiKey(apiKey)
    encryptedApiKey = encrypted.encryptedApiKey
    encryptionIv = encrypted.encryptionIv
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to encrypt API key." },
      { status: 500 },
    )
  }

  const { error } = await auth.supabase
    .from("user_ai_keys")
    .upsert(
      {
        user_id: auth.userId,
        provider: PROVIDER,
        encrypted_api_key: encryptedApiKey,
        encryption_iv: encryptionIv,
      },
      { onConflict: "user_id,provider" },
    )

  if (error) {
    return NextResponse.json({ error: "Unable to store API key." }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
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
    keyPrefix: "ai-keys-delete",
    maxRequests: 10,
    windowMs: 60_000,
  })
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  const { error } = await auth.supabase
    .from("user_ai_keys")
    .delete()
    .eq("user_id", auth.userId)
    .eq("provider", PROVIDER)

  if (error) {
    return NextResponse.json({ error: "Unable to remove API key." }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
