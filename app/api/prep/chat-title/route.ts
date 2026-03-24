import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { z } from "zod"

import { resolveOpenAIApiKey, USER_OPENAI_KEY_HEADER } from "@/lib/ai/keys"
import { getAuthedClient, requireCookieCsrf } from "@/lib/api/auth"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import { getPrepChatTitleInstructionsPrompt } from "@/lib/ai/prompts"

const BodySchema = z.object({
  chatId: z.string().uuid(),
  application: z
    .object({
      role: z.string().optional(),
      company: z.string().optional(),
    })
    .optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      }),
    )
    .max(6)
    .optional(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  let payload: z.infer<typeof BodySchema>

  const csrfError = requireCookieCsrf(request)
  if (csrfError) {
    return NextResponse.json({ error: csrfError.error.message }, { status: csrfError.error.status })
  }

  try {
    payload = BodySchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 })
  }

  const auth = await getAuthedClient(request)
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status })
  }

  const rateLimitResponse = await enforceRateLimit({
    request,
    userId: auth.userId,
    keyPrefix: "prep-chat-title",
  })
  if (rateLimitResponse) {
    rateLimitResponse.headers.set("Vary", `Authorization, ${USER_OPENAI_KEY_HEADER}`)
    return rateLimitResponse
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

  const openai = new OpenAI({ apiKey: keyResolution.apiKey })

  const jobDetails = [
    payload.application?.role?.trim() && `Role: ${payload.application.role.trim()}`,
    payload.application?.company?.trim() && `Company: ${payload.application.company.trim()}`,
  ]
    .filter(Boolean)
    .join(" | ")

  const condensedMessages = (payload.messages ?? []).map((message) =>
    `${message.role === "assistant" ? "Coach" : "Candidate"}: ${message.content}`,
  )

  const instructions = [
    getPrepChatTitleInstructionsPrompt(),
    jobDetails && `Context: ${jobDetails}`,
    condensedMessages.length > 0 && `Recent dialogue:\n${condensedMessages.join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n")

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    stream: true,
    temperature: 0.5,
    messages: [
      {
        role: "system" as const,
        content: instructions,
      },
    ],
  })

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content
          if (content) {
            controller.enqueue(encoder.encode(content))
          }
        }
      } catch (error) {
        console.error("Title streaming failed", error)
        controller.error(error)
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream)
}
