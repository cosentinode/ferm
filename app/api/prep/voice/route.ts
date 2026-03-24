import { NextRequest, NextResponse } from "next/server"
import Groq from "groq-sdk"

import { getAuthedClient, requireCookieCsrf } from "@/lib/api/auth"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import { buildPrepContext } from "../context"

type ChatHistory = { role: string; content: string }[]

export const runtime = "nodejs"

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set")
  }
  return new Groq({ apiKey })
}

async function synthesizeCartesiaSpeech(text: string) {
  const apiKey = process.env.CARTESIA_API_KEY
  const voiceId = process.env.CARTESIA_VOICE_ID ?? "alloy"
  const model = process.env.CARTESIA_MODEL ?? "sonic-3"

  if (!apiKey) {
    return null
  }

  const response = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "Cartesia-Version": "2025-04-16",
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      model_id: model,
      transcript: text,
      voice: {
        mode: "id",
        id: voiceId,
      },
      output_format: {
        container: "wav",
        encoding: "pcm_f32le",
        sample_rate: 44100,
      },
      speed: "normal",
      generation_config: {
        speed: 1,
        volume: 1,
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    console.error("Cartesia TTS error", response.status, errorText)
    return null
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer())
  return audioBuffer.toString("base64")
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
    keyPrefix: "prep-voice",
  })
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  const groq = getGroqClient()

  const formData = await request.formData()
  const audioFile = formData.get("audio") as File | null
  const history = formData.get("messages") as string | null
  const jobContext = formData.get("jobContext") as string | null
  const rawApplicationId = formData.get("applicationId") as string | null
  const rawChatId = formData.get("chatId") as string | null
  const voiceReplies = (formData.get("voiceReplies") as string | null) !== "false"

  if (!audioFile) {
    return NextResponse.json({ error: "Audio file is required." }, { status: 400 })
  }

  const messageHistory = history ? (JSON.parse(history) as ChatHistory) : []

  if (!rawChatId || rawChatId.trim().length === 0) {
    return NextResponse.json({ error: "chatId is required" }, { status: 400 })
  }

  const applicationId = rawApplicationId && rawApplicationId.trim().length > 0 ? rawApplicationId : null
  const chatId = rawChatId.trim()

  const extraContext = jobContext
    ? (() => {
        try {
          const parsed = JSON.parse(jobContext) as { role?: string | null; company?: string | null; latestNote?: string | null }
          const jobLine = `You are prepping the user for ${parsed.role ?? "their role"} at ${parsed.company ?? "their company"}.`
          const noteLine = parsed.latestNote ? ` Keep this note in mind: ${parsed.latestNote}` : ""
          return `${jobLine}${noteLine}`
        } catch {
          return ""
        }
      })()
    : ""

  try {
    const transcription = await groq.audio.transcriptions.create({
      model: process.env.GROQ_TRANSCRIPTION_MODEL ?? "whisper-large-v3",
      file: audioFile,
      response_format: "text",
      temperature: 0.2,
    })

    const transcript = transcription.trim()

    if (!transcript) {
      return NextResponse.json({ transcript: "", reply: "", audioBase64: null })
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

    const context = await buildPrepContext({
      supabase: auth.supabase,
      userId: auth.userId,
      applicationId,
      extraContext: extraContext || null,
    })

    const messages = [
      {
        role: "system" as const,
        content:
          context +
          "\n\nVoice session rules: Keep a coaching tone, stay under 120 words, and do not repeat the transcript back. Move the conversation forward with a new question or feedback.",
      },
      ...messageHistory.map((message) => ({ role: message.role as "user" | "assistant", content: message.content })),
      { role: "user" as const, content: transcript },
    ]

    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_CHAT_MODEL ?? "llama-3.3-70b-versatile",
      messages,
      temperature: 0.6,
    })

    const replyText = completion.choices[0]?.message?.content?.trim() ?? "I heard you. Let's keep practicing."

    const audioBase64 = voiceReplies ? await synthesizeCartesiaSpeech(replyText) : null

    const { error: insertError } = await auth.supabase.from("prep_messages").insert([
      { chat_id: chat.id, role: "user", content: transcript, metadata: { mode: "voice" } },
      {
        chat_id: chat.id,
        role: "assistant",
        content: replyText,
        metadata: { mode: "voice", hasAudio: Boolean(audioBase64) },
      },
    ])

    if (insertError) {
      return NextResponse.json({ error: "Unable to save voice exchange." }, { status: 500 })
    }

    return NextResponse.json({ transcript, reply: replyText, audioBase64 })
  } catch (error) {
    console.error("Voice pipeline error", error)
    return NextResponse.json({ error: "Unable to process voice input right now." }, { status: 500 })
  }
}
