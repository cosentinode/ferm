import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { getAuthedClient, requireCookieCsrf } from "@/lib/api/auth"
import { enforceRateLimit } from "@/lib/api/rate-limit"

const AppendSchema = z.object({
  chatId: z.string().uuid(),
  userContent: z.string().min(1),
  assistantContent: z.string().default(""),
  userMetadata: z.record(z.any()).nullable().optional(),
  assistantMetadata: z.record(z.any()).nullable().optional(),
})

const UpdateSchema = z.object({
  messageId: z.string().uuid(),
  content: z.string().optional(),
  metadata: z.record(z.any()).nullable().optional(),
})

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await getAuthedClient(request)
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status })
  }

  const searchParams = new URL(request.url).searchParams
  const chatId = searchParams.get("chatId")

  if (!chatId) {
    return NextResponse.json({ error: "chatId is required" }, { status: 400 })
  }

  const { data: chat, error: chatError } = await auth.supabase
    .from("prep_chats")
    .select("id")
    .eq("id", chatId)
    .eq("user_id", auth.userId)
    .maybeSingle()

  if (chatError) {
    return NextResponse.json({ error: "Unable to verify chat." }, { status: 500 })
  }

  if (!chat) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 })
  }

  const { data, error } = await auth.supabase
    .from("prep_messages")
    .select("id, chat_id, role, content, created_at, metadata")
    .eq("chat_id", chat.id)
    .order("created_at", { ascending: true })

  if (error) {
    return NextResponse.json({ error: "Unable to load messages." }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
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
    keyPrefix: "prep-messages-create",
  })
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  let payload: z.infer<typeof AppendSchema>

  try {
    payload = AppendSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 })
  }

  const { data: chat, error: chatError } = await auth.supabase
    .from("prep_chats")
    .select("id")
    .eq("id", payload.chatId)
    .eq("user_id", auth.userId)
    .maybeSingle()

  if (chatError) {
    return NextResponse.json({ error: "Unable to verify chat." }, { status: 500 })
  }

  if (!chat) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 })
  }

  const { data, error } = await auth.supabase
    .from("prep_messages")
    .insert([
      {
        chat_id: chat.id,
        role: "user",
        content: payload.userContent,
        metadata: payload.userMetadata ?? null,
      },
      {
        chat_id: chat.id,
        role: "assistant",
        content: payload.assistantContent ?? "",
        metadata: payload.assistantMetadata ?? null,
      },
    ])
    .select("id, chat_id, role, content, created_at, metadata")
    .order("created_at", { ascending: true })

  if (error) {
    return NextResponse.json({ error: "Unable to save messages." }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
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
    keyPrefix: "prep-messages-update",
  })
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  let payload: z.infer<typeof UpdateSchema>

  try {
    payload = UpdateSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 })
  }

  if (!payload.content && typeof payload.metadata === "undefined") {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 })
  }

  const { data: message, error: messageError } = await auth.supabase
    .from("prep_messages")
    .select("id, chat_id, prep_chats!inner(user_id)")
    .eq("id", payload.messageId)
    .eq("prep_chats.user_id", auth.userId)
    .maybeSingle()

  if (messageError) {
    return NextResponse.json({ error: "Unable to verify message." }, { status: 500 })
  }

  if (!message) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}
  if (typeof payload.content === "string") updates.content = payload.content
  if (payload.metadata !== undefined) updates.metadata = payload.metadata

  const { data, error } = await auth.supabase
    .from("prep_messages")
    .update(updates)
    .eq("id", payload.messageId)
    .select("id, chat_id, role, content, created_at, metadata")
    .single()

  if (error) {
    return NextResponse.json({ error: "Unable to update message." }, { status: 500 })
  }

  return NextResponse.json({ data })
}
