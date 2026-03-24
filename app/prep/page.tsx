"use client"

import { MicVAD, utils } from "@ricky0123/vad-web"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Bot,
  Briefcase,
  FileText,
  GraduationCap,
  ListChecks,
  Mic,
  Plus,
  Send,
  Sparkles,
  Square,
  StickyNote,
  StopCircle,
  Trash2,
  Volume2,
} from "lucide-react"

import { Header } from "@/components/header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { createAudioVisualizer, type AudioVisualizer } from "@/lib/audio-visualizer"
import { useJobApplications } from "@/lib/hooks/use-job-applications"
import { cn } from "@/lib/utils"
import type { JobApplicationWithInterviews, PrepChat, PrepMessage } from "@/lib/types/database"
import { useSupabase } from "@/components/supabase-provider"
import { apiFetch } from "@/lib/fetcher"

const GENERAL_INTERVIEW_VALUE = "general-prep"

interface ChatMessage {
  id?: string
  role: "assistant" | "user"
  content: string
  tone?: "behavioral" | "technical" | "coach"
  metadata?: Record<string, unknown> | null
}

export default function PrepPage() {
  const { applications, isLoading } = useJobApplications({ limit: 50, include_interviews: true })
  const { session } = useSupabase()
  const [selectedApplicationId, setSelectedApplicationId] = useState<string>("")
  const [selectedInterviewId, setSelectedInterviewId] = useState<string | null>(null)
  const [chats, setChats] = useState<PrepChat[]>([])
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [isChatListLoading, setIsChatListLoading] = useState(false)
  const [isMessagesLoading, setIsMessagesLoading] = useState(false)
  const [isCreatingChat, setIsCreatingChat] = useState(false)
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null)
  const [chatError, setChatError] = useState<string | null>(null)
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({})
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isSessionEnded, setIsSessionEnded] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [isProcessingVoice, setIsProcessingVoice] = useState(false)
  const [voiceReplyUrl, setVoiceReplyUrl] = useState<string | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [isVoiceReplyEnabled, setIsVoiceReplyEnabled] = useState(true)
  const [isFocusMode, setIsFocusMode] = useState(false)
  const [visualizerNotice, setVisualizerNotice] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [usageRemaining, setUsageRemaining] = useState<number | null>(null)
  const [usageLimit, setUsageLimit] = useState<number | null>(null)
  const chatRef = useRef<HTMLDivElement | null>(null)
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const recordingStartedAtRef = useRef<number | null>(null)
  const vadRef = useRef<MicVAD | null>(null)
  const streamingMessageIndexRef = useRef<number | null>(null)
  const typewriterIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const voicePlaybackRef = useRef<HTMLAudioElement | null>(null)
  const isVoiceProcessingRef = useRef(false)
  const titleStreamControllersRef = useRef<Record<string, AbortController>>({})
  const visualizerContainerRef = useRef<HTMLDivElement | null>(null)
  const visualizerInstanceRef = useRef<AudioVisualizer | null>(null)
  const micVisualizationStreamRef = useRef<MediaStream | null>(null)

  const jobOptions = useMemo(
    () =>
      applications.map((job) => ({
        id: job.id,
        label: `${job.position_title ?? "Untitled role"} @ ${job.company_name ?? "Company"}`,
      })),
    [applications],
  )

  useEffect(() => {
    if (!selectedApplicationId && applications.length > 0) {
      setSelectedApplicationId(applications[0].id)
    }
  }, [applications, selectedApplicationId])

  const selectedApplication = useMemo(
    () => applications.find((application) => application.id === selectedApplicationId),
    [applications, selectedApplicationId],
  )

  const interviewOptions = useMemo(
    () =>
      (selectedApplication?.interviews ?? []).map((interview) => {
        const parts = [
          interview.interview_type ?? "Interview",
          interview.scheduled_date ? new Date(interview.scheduled_date).toLocaleDateString() : null,
        ].filter(Boolean)

        return { id: interview.id, label: parts.join(" · ") || "Interview" }
      }),
    [selectedApplication?.interviews],
  )

  useEffect(() => {
    if (!selectedApplication) {
      setSelectedInterviewId(null)
      return
    }

    if (selectedApplication.interviews?.length) {
      setSelectedInterviewId((previous) => {
        if (previous && selectedApplication.interviews?.some((interview) => interview.id === previous)) {
          return previous
        }
        return selectedApplication.interviews?.[0]?.id ?? null
      })
    } else {
      setSelectedInterviewId(null)
    }
  }, [selectedApplication])

  const mapPrepMessage = useCallback((record: PrepMessage): ChatMessage => {
    const tone =
      (record.metadata as { tone?: ChatMessage["tone"] } | null | undefined)?.tone ??
      (record.role === "assistant" ? "technical" : undefined)
    return {
      id: record.id,
      role: record.role,
      content: record.content,
      tone,
      metadata: record.metadata ?? null,
    }
  }, [])

  const refreshUsage = useCallback(async () => {
    if (!session?.access_token) return

    try {
      const response = await fetch("/api/prep-usage", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({ error: "Unable to load usage." }))
        throw new Error(errorPayload.error || "Unable to load usage.")
      }

      const usage = (await response.json()) as { remaining?: number; limit?: number }
      setUsageRemaining(usage.remaining ?? null)
      setUsageLimit(usage.limit ?? null)
    } catch {
      setUsageRemaining(null)
      setUsageLimit(null)
    }
  }, [session?.access_token])

  const updateUsageFromResponse = useCallback(
    async (response: Response | null | undefined) => {
      const remainingHeader = response?.headers.get("x-llm-remaining")
      const limitHeader = response?.headers.get("x-llm-limit")

      if (remainingHeader || limitHeader) {
        setUsageRemaining(remainingHeader ? Number(remainingHeader) : usageRemaining)
        setUsageLimit(limitHeader ? Number(limitHeader) : usageLimit)
        return
      }

      await refreshUsage()
    },
    [refreshUsage, usageLimit, usageRemaining],
  )

  const requestMessages = useCallback(
    async (chatId: string) => {
      const response = await fetch(`/api/prep/messages?chatId=${chatId}`)
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({ error: "Unable to load messages." }))
        throw new Error(errorPayload.error || "Unable to load messages.")
      }

      const payload = (await response.json()) as { data?: PrepMessage[] }
      return (payload.data ?? []).map(mapPrepMessage)
    },
    [mapPrepMessage],
  )

  const fetchChats = useCallback(
    async (interviewId: string | null, options?: { loadMessages?: boolean }) => {
      const shouldLoadMessages = options?.loadMessages ?? false
      setIsChatListLoading(true)
      if (shouldLoadMessages) {
        setIsMessagesLoading(true)
      }
      setChatError(null)

      try {
        const search = `?interviewId=${encodeURIComponent(interviewId ?? "")}`
        const response = await fetch(`/api/prep/chats${search}`)

        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({ error: "Unable to load chats." }))
          throw new Error(errorPayload.error || "Unable to load chats.")
        }

        const payload = (await response.json()) as { data?: PrepChat[] }
        const chatList = payload.data ?? []

        const resolvedChats = chatList.map((chat) =>
          titleDrafts[chat.id] ? { ...chat, title: titleDrafts[chat.id] } : chat,
        )
        const nextSelectedChatId = chatList.some((chat) => chat.id === selectedChatId)
          ? selectedChatId
          : chatList[0]?.id ?? null

        setChats(resolvedChats)
        setSelectedChatId(nextSelectedChatId)

        if (shouldLoadMessages) {
          if (nextSelectedChatId) {
            const nextMessages = await requestMessages(nextSelectedChatId)
            setMessages(nextMessages)
          } else {
            setMessages([])
          }
        }
      } catch (error) {
        setChatError(error instanceof Error ? error.message : "Unable to load chats.")
        setChats([])
        setSelectedChatId(null)
        if (shouldLoadMessages) {
          setMessages([])
        }
      } finally {
        setIsChatListLoading(false)
        if (shouldLoadMessages) {
          setIsMessagesLoading(false)
        }
      }
    },
    [requestMessages, selectedChatId, titleDrafts],
  )

  useEffect(() => {
    void refreshUsage()
  }, [refreshUsage])

  const fetchMessages = useCallback(
    async (chatId: string) => {
      setIsMessagesLoading(true)
      setChatError(null)

      try {
        const nextMessages = await requestMessages(chatId)
        setMessages(nextMessages)
      } catch (error) {
        setChatError(error instanceof Error ? error.message : "Unable to load messages.")
        setMessages([])
      } finally {
        setIsMessagesLoading(false)
      }
    },
    [requestMessages],
  )

  useEffect(() => {
    if (!selectedApplicationId) return
    void fetchChats(selectedInterviewId, { loadMessages: true })
  }, [fetchChats, selectedApplicationId, selectedInterviewId])

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (typeof document === "undefined") return

    const previousOverflow = document.body.style.overflow

    if (isFocusMode) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = previousOverflow
    }

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isFocusMode])

  const teardownVisualizer = useCallback(() => {
    visualizerInstanceRef.current?.stop()
    visualizerInstanceRef.current = null
  }, [])

  const stopMicVisualizationStream = useCallback(() => {
    if (micVisualizationStreamRef.current) {
      micVisualizationStreamRef.current.getTracks().forEach((track) => track.stop())
      micVisualizationStreamRef.current = null
    }
  }, [])

  const handleVisualizerFailure = useCallback(
    (error: unknown) => {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Audio visualization is unavailable. Playing audio without visuals."

      setVisualizerNotice(message)

      if (isFocusMode) {
        // Focus mode regression check: surface a warning when we fall back to audio-only playback.
        console.warn(
          "[Prep focus mode] Visualizer setup failed; continuing with audio-only playback.",
          error,
        )
      }
    },
    [isFocusMode],
  )

  const initializeVisualizer = useCallback(
    async (source: MediaStream | HTMLAudioElement | null) => {
      if (!isFocusMode || !source || !visualizerContainerRef.current) return

      try {
        if (!visualizerInstanceRef.current) {
          visualizerInstanceRef.current = await createAudioVisualizer(visualizerContainerRef.current)
        }

        await visualizerInstanceRef.current.connectSource(source)
        setVisualizerNotice(null)
      } catch (error) {
        teardownVisualizer()
        throw error instanceof Error ? error : new Error("Unable to start visualizer")
      }
    },
    [isFocusMode, teardownVisualizer],
  )

  const startMicVisualization = useCallback(async () => {
    if (!isFocusMode) return null

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micVisualizationStreamRef.current = stream
      await initializeVisualizer(stream)
      return stream
    } catch (error) {
      stopMicVisualizationStream()
      teardownVisualizer()
      handleVisualizerFailure(error)
      return null
    }
  }, [handleVisualizerFailure, initializeVisualizer, isFocusMode, stopMicVisualizationStream, teardownVisualizer])

  useEffect(
    () => () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
      }
      if (typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current)
      }
      if (vadRef.current) {
        vadRef.current.pause()
        vadRef.current = null
      }
      if (voiceReplyUrl) {
        URL.revokeObjectURL(voiceReplyUrl)
      }
      stopMicVisualizationStream()
      teardownVisualizer()
    },
    [stopMicVisualizationStream, teardownVisualizer, voiceReplyUrl],
  )

  useEffect(() => {
    if (!isFocusMode) {
      stopMicVisualizationStream()
      teardownVisualizer()
      setVisualizerNotice(null)
    }
  }, [isFocusMode, stopMicVisualizationStream, teardownVisualizer])


  type ApplicationCardKey =
    | "jobInformation"
    | "resumeHighlights"
    | "responsibilities"
    | "qualifications"
    | "notes"

  interface ApplicationCardConfig {
    key: ApplicationCardKey
    title: string
    icon?: React.ComponentType<{ className?: string }>
    render: (application: JobApplicationWithInterviews) => React.ReactNode
  }

  const applicationCards: ApplicationCardConfig[] = selectedApplication
    ? [
        {
          key: "jobInformation",
          title: "Job information",
          icon: Briefcase,
          render: (current) => (
            <div className="space-y-3 text-xs text-muted-foreground">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-foreground">Location</p>
                  <p>{current.location ?? "Not specified"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-foreground">Employment</p>
                  <p>{current.employment_type ?? "N/A"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-foreground">Application date</p>
                  <p>{current.application_date ? new Date(current.application_date).toLocaleDateString() : "N/A"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-foreground">Salary range</p>
                  <p>{current.salary_range ?? "Not provided"}</p>
                </div>
              </div>

              <div className="space-y-2">
                {(current.contact_person || current.contact_email) && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-foreground">Recruiter / Contact</p>
                    <p>
                      {current.contact_person ?? "Unknown"}
                      {current.contact_email ? ` • ${current.contact_email}` : ""}
                    </p>
                  </div>
                )}

              </div>
            </div>
          ),
        },
        {
          key: "resumeHighlights",
          title: "Resume highlights",
          icon: FileText,
          render: (current) => (
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>Top resume matches for this role</span>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {current.resume_match_summary ?? "No resume highlights yet."}
              </p>
            </div>
          ),
        },
        {
          key: "responsibilities",
          title: "Responsibilities",
          icon: ListChecks,
          render: (current) => (
            <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
              {current.job_responsibilities ? (
                current.job_responsibilities.split("\n").map((item, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary/70" />
                    <p className="leading-relaxed">{item || "Responsibility"}</p>
                  </div>
                ))
              ) : (
                <p>No responsibilities listed.</p>
              )}
            </div>
          ),
        },
        {
          key: "qualifications",
          title: "Qualifications",
          icon: GraduationCap,
          render: (current) => (
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {current.qualifications ?? "No qualifications noted yet."}
            </p>
          ),
        },
        {
          key: "notes",
          title: "Notes",
          icon: StickyNote,
          render: (current) => (
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {current.notes ?? "No notes added."}
            </p>
          ),
        },
      ]
    : []

  const latestAssistantMessage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === "assistant") return messages[index]
    }
    return null
  }, [messages])

  const activeChatTitle = useMemo(() => {
    const activeChat = chats.find((chat) => chat.id === selectedChatId)
    if (!activeChat) return null
    return titleDrafts[activeChat.id] ?? activeChat.title
  }, [chats, selectedChatId, titleDrafts])

  const startTypewriterStream = useCallback(
    (
      targetIndex: number,
      fullText: string,
      tone: ChatMessage["tone"] = "technical",
      onComplete?: () => void,
    ) => {
      if (typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current)
      }

      const sanitized = fullText.trim()
      if (!sanitized) {
        streamingMessageIndexRef.current = null
        setMessages((previous) => {
          const next = [...previous]
          const target = next[targetIndex]
          if (target) {
            next[targetIndex] = { ...target, content: "", tone }
          }
          return next
        })
        onComplete?.()
        return
      }

      let currentLength = 0
      const chunkSize = 6
      const tickInterval = 28

      typewriterIntervalRef.current = setInterval(() => {
        currentLength = Math.min(sanitized.length, currentLength + chunkSize)
        const nextSlice = sanitized.slice(0, currentLength)

        setMessages((previous) => {
          const next = [...previous]
          const target = next[targetIndex]
          if (target) {
            next[targetIndex] = { ...target, content: nextSlice, tone }
          }
          return next
        })

        if (currentLength >= sanitized.length) {
          if (typewriterIntervalRef.current) {
            clearInterval(typewriterIntervalRef.current)
            typewriterIntervalRef.current = null
          }
          streamingMessageIndexRef.current = null
          onComplete?.()
        }
      }, tickInterval)
    },
    [],
  )

  const persistChatTitle = useCallback(async (chatId: string, title: string) => {
    try {
      const response = await apiFetch("/api/prep/chats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: chatId, title }),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({ error: "Unable to update chat title." }))
        throw new Error(errorPayload.error || "Unable to update chat title.")
      }

      const payload = (await response.json()) as { data?: PrepChat }
      if (payload.data) {
        setChats((previous) =>
          previous.map((chat) => (chat.id === payload.data?.id ? { ...chat, title: payload.data.title } : chat)),
        )
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Unable to update chat title.")
    }
  }, [])

  const streamChatTitle = useCallback(
    async (chatId: string, context: ChatMessage[] = []) => {
      setChatError(null)
      if (titleStreamControllersRef.current[chatId]) {
        titleStreamControllersRef.current[chatId]?.abort()
      }

      const controller = new AbortController()
      titleStreamControllersRef.current[chatId] = controller
      setTitleDrafts((previous) => ({ ...previous, [chatId]: previous[chatId] ?? "New chat" }))

      try {
        const response = await apiFetch("/api/prep/chat-title", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            application: {
              role: selectedApplication?.position_title ?? undefined,
              company: selectedApplication?.company_name ?? undefined,
            },
            messages: context.slice(-6).map((message) => ({ role: message.role, content: message.content })),
          }),
        })

        if (!response.ok || !response.body) {
          const errorPayload = await response.json().catch(() => ({ error: "Unable to generate title." }))
          throw new Error(errorPayload.error || "Unable to generate title.")
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let accumulated = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          accumulated += decoder.decode(value, { stream: true })
          setTitleDrafts((previous) => ({ ...previous, [chatId]: accumulated.trim() || "New chat" }))
        }

        const finalizedTitle = accumulated.trim() || "Prep chat"
        setChats((previous) => previous.map((chat) => (chat.id === chatId ? { ...chat, title: finalizedTitle } : chat)))
        setTitleDrafts((previous) => {
          const next = { ...previous }
          delete next[chatId]
          return next
        })
        await persistChatTitle(chatId, finalizedTitle)
      } catch (error) {
        if (controller.signal.aborted) return
        setChatError(error instanceof Error ? error.message : "Unable to generate title.")
      } finally {
        delete titleStreamControllersRef.current[chatId]
      }
    },
    [persistChatTitle, selectedApplication?.company_name, selectedApplication?.position_title],
  )

  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      setChatError(null)
      setDeletingChatId(chatId)
      titleStreamControllersRef.current[chatId]?.abort()

      try {
        const response = await apiFetch(`/api/prep/chats?chatId=${encodeURIComponent(chatId)}`, {
          method: "DELETE",
        })

        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({ error: "Unable to delete chat." }))
          throw new Error(errorPayload.error || "Unable to delete chat.")
        }

        setTitleDrafts((previous) => {
          const next = { ...previous }
          delete next[chatId]
          return next
        })
        setChats((previous) => {
          const remaining = previous.filter((chat) => chat.id !== chatId)
          if (selectedChatId === chatId) {
            const nextChatId = remaining[0]?.id ?? null
            setSelectedChatId(nextChatId)
            if (nextChatId) {
              void fetchMessages(nextChatId)
            } else {
              setMessages([])
            }
          }
          return remaining
        })
      } catch (error) {
        setChatError(error instanceof Error ? error.message : "Unable to delete chat.")
      } finally {
        setDeletingChatId(null)
      }
    },
    [fetchMessages, selectedChatId],
  )

  const createChatRecord = useCallback(async () => {
    if (isCreatingChat) return null

    setIsCreatingChat(true)
    setChatError(null)

    try {
      const response = await apiFetch("/api/prep/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewId: selectedInterviewId }),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({ error: "Unable to create chat." }))
        throw new Error(errorPayload.error || "Unable to create chat.")
      }

      const payload = (await response.json()) as { data: PrepChat }
      return payload.data
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Unable to create chat.")
      return null
    } finally {
      setIsCreatingChat(false)
    }
  }, [isCreatingChat, selectedInterviewId])

  const handleCreateChat = useCallback(async () => {
    setChatError(null)
    setIsSessionEnded(false)
    setIsGenerating(false)
    streamingMessageIndexRef.current = null
    setMessages([])
    setInput("")

    const createdChat = await createChatRecord()
    if (!createdChat) return

    setChats((previous) => [createdChat, ...previous])
    setSelectedChatId(createdChat.id)
  }, [createChatRecord])

  const handleSelectChat = useCallback(
    (chatId: string) => {
      if (chatId === selectedChatId) return
      setSelectedChatId(chatId)
      void fetchMessages(chatId)
    },
    [fetchMessages, selectedChatId],
  )

  const handleSend = async () => {
    if (!input.trim() || isGenerating || isSessionEnded || isMessagesLoading) return

    const trimmed = input.trim()
    const userMessage: ChatMessage = { role: "user", content: trimmed }
    const history = [...messages, userMessage]
    let chatId = selectedChatId
    let isNewChat = false
    let didAppendMessages = false

    setInput("")
    setIsSessionEnded(false)
    setIsGenerating(true)
    streamingMessageIndexRef.current = null
    setChatError(null)

    let assistantMessageId: string | null = null

    try {
      if (!chatId) {
        const createdChat = await createChatRecord()
        if (!createdChat) return
        chatId = createdChat.id
        isNewChat = true
        const placeholderTitle = titleDrafts[createdChat.id] ?? "New chat"
        setTitleDrafts((previous) => ({ ...previous, [createdChat.id]: placeholderTitle }))
        setChats((previous) => [{ ...createdChat, title: placeholderTitle }, ...previous])
        setSelectedChatId(createdChat.id)
        setMessages([])
      }

      const appendResponse = await apiFetch("/api/prep/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chatId,
          userContent: trimmed,
          assistantContent: "",
          userMetadata: { mode: "text" },
          assistantMetadata: { mode: "text" },
        }),
      })

      if (!appendResponse.ok) {
        const errorPayload = await appendResponse.json().catch(() => ({ error: "Unable to start chat." }))
        throw new Error(errorPayload.error || "Unable to start chat.")
      }

      const appendPayload = (await appendResponse.json()) as { data?: PrepMessage[] }
      const assistantRecord = appendPayload.data?.find((message) => message.role === "assistant")
      assistantMessageId = assistantRecord?.id ?? null
      const appendedMessages = (appendPayload.data ?? []).map(mapPrepMessage)
      didAppendMessages = true

      setMessages((previous) => {
        const next = [...previous, ...appendedMessages]
        const assistantIndex = assistantMessageId
          ? next.findIndex((message) => message.id === assistantMessageId)
          : next.length - 1
        streamingMessageIndexRef.current = assistantIndex >= 0 ? assistantIndex : null
        return next
      })

      if (!assistantMessageId) {
        throw new Error("Unable to track the assistant reply.")
      }

      if (isNewChat && chatId) {
        void streamChatTitle(chatId, history)
      }

      const response = await apiFetch("/api/prep", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          applicationId: selectedApplication?.id ?? null,
          chatId,
          assistantMessageId,
          messages: history.map((message) => ({ role: message.role, content: message.content })),
        }),
      })

      if (!response.ok || !response.body) {
        const errorPayload = await response.json().catch(() => ({ error: "The assistant couldn't respond right now." }))
        throw new Error(errorPayload.error || "The assistant couldn't respond right now.")
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })

        if (streamingMessageIndexRef.current !== null) {
          setMessages((previous) => {
            const next = [...previous]
            const target = next[streamingMessageIndexRef.current!]
            if (target) {
              next[streamingMessageIndexRef.current!] = { ...target, content: accumulated }
            }
            return next
          })
        }
      }

      void updateUsageFromResponse(response)
    } catch (error) {
      const fallbackMessage =
        error instanceof Error ? error.message : "We hit a snag fetching a response. Please try again."
      if (streamingMessageIndexRef.current !== null) {
        setMessages((previous) => {
          const next = [...previous]
          const target = next[streamingMessageIndexRef.current!]
          if (target) {
            next[streamingMessageIndexRef.current!] = { ...target, content: fallbackMessage, tone: "coach" }
          }
          return next
        })
      }
      setChatError(error instanceof Error ? error.message : "We hit a snag fetching a response.")
      if (isNewChat && chatId && !didAppendMessages) {
        setChats((previous) => previous.filter((chat) => chat.id !== chatId))
        setSelectedChatId(null)
        setTitleDrafts((previous) => {
          const next = { ...previous }
          delete next[chatId!]
          return next
        })
        void apiFetch(`/api/prep/chats?chatId=${encodeURIComponent(chatId)}`, { method: "DELETE" })
      }
    } finally {
      setIsGenerating(false)
      streamingMessageIndexRef.current = null
    }
  }

  const handleEndSession = () => {
    stopRecordingTimer()
    if (vadRef.current) {
      vadRef.current.pause()
      vadRef.current = null
    }
    if (voicePlaybackRef.current) {
      voicePlaybackRef.current.pause()
      voicePlaybackRef.current.currentTime = 0
      voicePlaybackRef.current = null
    }
    stopMicVisualizationStream()
    teardownVisualizer()
    setIsRecording(false)
    setIsProcessingVoice(false)
    setIsSessionEnded(true)
    setVisualizerNotice(null)
  }

  const handleRestart = () => {
    stopRecordingTimer()
    if (vadRef.current) {
      vadRef.current.pause()
      vadRef.current = null
    }
    if (voicePlaybackRef.current) {
      voicePlaybackRef.current.pause()
      voicePlaybackRef.current.currentTime = 0
      voicePlaybackRef.current = null
    }
    stopMicVisualizationStream()
    teardownVisualizer()
    setIsSessionEnded(false)
    setMessages([])
    setVoiceTranscript("")
    setVoiceError(null)
    setVoiceReplyUrl(null)
    setVisualizerNotice(null)
  }

  const stopRecordingTimer = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    recordingStartedAtRef.current = null
  }

  const playProcessingTone = () => {
    if (typeof window === "undefined") return

    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      const audioContext = new AudioContextClass()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.frequency.value = 660
      gainNode.gain.value = 0.05

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      const now = audioContext.currentTime
      oscillator.start(now)
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.25)
      oscillator.stop(now + 0.25)
      oscillator.onended = () => {
        audioContext.close().catch(() => undefined)
      }
    } catch {
      // Best-effort UX enhancement; ignore audio errors
    }
  }

  const handleStartRecording = async () => {
    if (isProcessingVoice || isRecording || isSessionEnded || isGenerating) return
    setVoiceError(null)

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setVoiceError("This browser doesn't support microphone recording.")
      return
    }

    try {
      void startMicVisualization()

      if (!vadRef.current) {
        vadRef.current = await MicVAD.new({
          baseAssetPath: "/vad-assets/",
          onnxWASMBasePath: "/vad-assets/",
          startOnLoad: false,
          onSpeechStart: () => {
            setIsRecording(true)
            setRecordingSeconds(0)
            recordingStartedAtRef.current = Date.now()
            if (recordingTimerRef.current) {
              clearInterval(recordingTimerRef.current)
            }
            recordingTimerRef.current = setInterval(() => {
              const start = recordingStartedAtRef.current
              if (!start) return
              const elapsedSeconds = Math.floor((Date.now() - start) / 1000)
              setRecordingSeconds(elapsedSeconds)
            }, 1000)
          },
          onSpeechEnd: (audio) => {
            vadRef.current?.pause()
            stopRecordingTimer()
            setIsRecording(false)
            setIsProcessingVoice(true)
            setRecordingSeconds(0)
            stopMicVisualizationStream()
            teardownVisualizer()

            void (async () => {
              try {
                const wavBuffer = utils.encodeWAV(audio)
                const audioBlob = new Blob([wavBuffer], { type: "audio/wav" })
                await sendVoiceMessage(audioBlob)
              } catch (error) {
                setVoiceError(error instanceof Error ? error.message : "Voice processing failed.")
              } finally {
                setIsProcessingVoice(false)
              }
            })()
          },
        })
      }

      await vadRef.current.start()
      setIsRecording(true)
      setRecordingSeconds(0)
    } catch {
      stopMicVisualizationStream()
      teardownVisualizer()
      setVoiceError("Microphone access was blocked. Please enable permissions and try again.")
    }
  }

  const handleStopRecording = () => {
    if (vadRef.current) {
      vadRef.current.pause()
      vadRef.current = null
    }
    stopRecordingTimer()
    stopMicVisualizationStream()
    teardownVisualizer()
    setIsRecording(false)
  }

  const sendVoiceMessage = async (audioBlob: Blob) => {
    if (isSessionEnded) return
    if (isVoiceProcessingRef.current) return
    if (!selectedChatId) {
      setVoiceError("Create a chat to start voice prep.")
      setIsProcessingVoice(false)
      return
    }
    if (audioBlob.size === 0) {
      setVoiceError("We couldn't capture any audio. Try again.")
      setIsProcessingVoice(false)
      return
    }

    setVoiceError(null)
    setVoiceTranscript("")
    setIsProcessingVoice(true)
    isVoiceProcessingRef.current = true
    playProcessingTone()

    try {
      const recentMessages = messages.slice(-6)
      const formData = new FormData()
      formData.append("audio", audioBlob, "voice-input.wav")
      formData.append("messages", JSON.stringify(recentMessages))
      formData.append("voiceReplies", isVoiceReplyEnabled ? "true" : "false")
      formData.append("chatId", selectedChatId)

      if (selectedApplication?.id) {
        formData.append("applicationId", selectedApplication.id)
      }

      if (selectedApplication) {
        formData.append(
          "jobContext",
          JSON.stringify({
            role: selectedApplication.position_title ?? "the role",
            company: selectedApplication.company_name ?? "the company",
            latestNote: selectedApplication.notes ?? "",
          }),
        )
      }

      const response = await apiFetch("/api/prep/voice", {
        method: "POST",
        headers: undefined,
        body: formData,
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({ error: "Unable to process voice input." }))
        throw new Error(errorPayload.error)
      }

      const data = (await response.json()) as { transcript?: string; reply?: string; audioBase64?: string }

      setMessages((previous) => {
        const nextMessages = [...previous]

        if (data.transcript) {
          nextMessages.push({ role: "user", content: data.transcript })
          setVoiceTranscript(data.transcript)
        }

        if (data.reply) {
          nextMessages.push({ role: "assistant", tone: "technical", content: "" })
          streamingMessageIndexRef.current = nextMessages.length - 1
          const messageIndex = streamingMessageIndexRef.current
          if (messageIndex !== null) {
            setTimeout(
              () => startTypewriterStream(messageIndex, data.reply ?? "", "technical"),
              0,
            )
          }
        }

        return nextMessages
      })

      if (voiceReplyUrl) {
        URL.revokeObjectURL(voiceReplyUrl)
      }

      if (data.audioBase64) {
        const byteCharacters = atob(data.audioBase64)
        const byteNumbers = new Array(byteCharacters.length)
        for (let index = 0; index < byteCharacters.length; index += 1) {
          byteNumbers[index] = byteCharacters.charCodeAt(index)
        }
        const audioResponse = new Blob([new Uint8Array(byteNumbers)], { type: "audio/wav" })
        const objectUrl = URL.createObjectURL(audioResponse)
        setVoiceReplyUrl(objectUrl)

        if (isVoiceReplyEnabled) {
          const audioElement = new Audio(objectUrl)
          voicePlaybackRef.current = audioElement
          audioElement.addEventListener("ended", () => {
            voicePlaybackRef.current = null
            if (!isSessionEnded) {
              void handleStartRecording()
            }
          })
          audioElement.addEventListener("pause", () => {
            if (voicePlaybackRef.current === audioElement) {
              voicePlaybackRef.current = null
            }
          })

          try {
            await audioElement.play()
          } catch (playbackError) {
            setVoiceError(
              playbackError instanceof Error ? playbackError.message : "Unable to play the audio reply.",
            )
            return
          }

          try {
            await initializeVisualizer(audioElement)
          } catch (error) {
            handleVisualizerFailure(error)
          }
        }
      } else {
        setVoiceReplyUrl(null)
      }

      void updateUsageFromResponse(response)

    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : "Voice mode is unavailable right now.")
    } finally {
      setIsProcessingVoice(false)
      isVoiceProcessingRef.current = false
      setRecordingSeconds(0)
    }
  }


  return (
    <div className="adaptive-scroll-layout min-h-screen overflow-hidden ">
      <Header />
      <main className="mx-auto max-w-[83rem] px-3 sm:px-6 pt-24 pb-4">
        <Card className="overflow-hidden border-border/70 shadow-xl">
          <div className="grid h-[calc(100vh-10.1rem)] max-h-[1040px] grid-rows-[auto_1fr]">
            <div className="flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleRestart} disabled={messages.length === 0}>
                  Restart
                </Button>
                <Button variant="destructive" size="sm" onClick={handleEndSession} disabled={isSessionEnded}>
                  <StopCircle className="h-4 w-4 mr-1" />
                  End
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Messages left: {usageRemaining ?? "--"}
                  {usageLimit !== null ? ` / ${usageLimit}` : ""}
                </Badge>
                <Button
                  variant={isFocusMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIsFocusMode((previous) => !previous)}
                >
                  {isFocusMode ? "Focus mode on" : "Focus mode"}
                </Button>
              </div>
            </div>

            <div className="grid h-full min-h-0 overflow-hidden lg:grid-cols-[280px_1fr_340px]">
              <aside className="flex min-h-0 min-w-0 flex-col border-border/60 bg-background/70 lg:border-r">
                <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Chats</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {selectedApplication
                        ? `${selectedApplication.position_title ?? "Role"} @ ${selectedApplication.company_name ?? "Company"}`
                        : "Pick a role to tailor chat titles"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCreateChat}
                    disabled={isCreatingChat || isChatListLoading}
                  >
                    <Plus className="h-4 w-4" />
                    <span className="ml-2 hidden sm:inline">New</span>
                  </Button>
                </div>
                <ScrollArea className="flex-1 p-3">
                  <div className="space-y-2">
                    {chats.map((chat) => {
                      const isActive = chat.id === selectedChatId
                      const workingTitle = titleDrafts[chat.id] ?? chat.title

                      return (
                        <div
                          key={chat.id}
                          className={cn(
                            "group flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition",
                            isActive
                              ? "border-primary/60 bg-primary/5 shadow-sm"
                              : "border-border/60 hover:border-primary/50 hover:bg-muted/40",
                          )}
                        >
                          <button
                            type="button"
                            className="flex-1 text-left"
                            onClick={() => handleSelectChat(chat.id)}
                          >
                            <p className="text-sm font-semibold leading-tight text-foreground line-clamp-2">
                              {workingTitle || "Untitled chat"}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span>{new Date(chat.created_at).toLocaleDateString()}</span>
                            </div>
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-80 hover:opacity-100"
                            onClick={(event) => {
                              event.stopPropagation()
                              void handleDeleteChat(chat.id)
                            }}
                            disabled={deletingChatId === chat.id || isChatListLoading}
                            aria-label="Delete chat"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>

                  {!isChatListLoading && chats.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                      No chats yet. Start one to begin prepping.
                    </div>
                  )}
                </ScrollArea>
              </aside>

              <div
                className={cn(
                  "flex h-full min-h-0 flex-col overflow-hidden bg-background",
                  isFocusMode && "bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70",
                )}
              >
                <div className="flex-1 flex min-h-0 min-w-0 flex-col gap-4 p-4 sm:p-6 overflow-hidden">
                  {isFocusMode && (
                    <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-muted/30 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">Focus mode</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {isVoiceReplyEnabled ? "Voice replies on" : "Voice replies muted"}
                          <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_0_6px_rgba(99,102,241,0.25)]" />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant={isRecording ? "destructive" : "default"}
                          onClick={isRecording ? handleStopRecording : handleStartRecording}
                          disabled={isProcessingVoice || isSessionEnded}
                        >
                          {isRecording ? <Square className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
                          {isRecording ? "Stop recording" : "Start speaking"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (voiceReplyUrl) {
                              const audioElement = new Audio(voiceReplyUrl)
                              voicePlaybackRef.current = audioElement
                              void initializeVisualizer(audioElement)
                              void audioElement.play().catch(() => undefined)
                            }
                          }}
                          disabled={!voiceReplyUrl}
                        >
                          <Volume2 className="mr-2 h-4 w-4" />
                          Replay last reply
                        </Button>
                        <div className="text-xs text-muted-foreground">
                          {isSessionEnded ? "Session ended" : "Prep will auto-listen after it speaks"}
                        </div>
                      </div>
                    </div>
                  )}

                  {(activeChatTitle || chatError) && (
                    <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                      {activeChatTitle && (
                        <p className="text-sm font-semibold text-foreground line-clamp-2">
                          {activeChatTitle}
                        </p>
                      )}
                      {chatError && (
                        <p className="mt-1 text-xs text-destructive">
                          {chatError}
                        </p>
                      )}
                    </div>
                  )}

                  <ScrollArea className="flex-1 overflow-y-auto" ref={chatRef}>
                    <div className="space-y-4 pr-2 pb-4">
                     
                      {messages.map((message, index) => (
                        <div key={message.id ?? `${message.role}-${index}`} className="flex gap-3">
                          <div
                            className={cn(
                              "h-10 w-10 rounded-full flex items-center justify-center border",
                              message.role === "assistant" ? "bg-primary/10 border-primary/30" : "bg-muted",
                            )}
                          >
                            {message.role === "assistant" ? <Bot className="h-5 w-5 text-primary" /> : <Sparkles className="h-5 w-5" />}
                          </div>
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">{message.role === "assistant" ? "Prep" : "You"}</span>
                              {message.tone && <Badge variant="outline" className="text-[10px] h-5">{message.tone}</Badge>}
                            </div>
                            <p className="leading-relaxed break-words text-sm text-foreground whitespace-pre-wrap">{message.content}</p>
                          </div>
                        </div>
                      ))}
                      {messages.length === 0 && !isMessagesLoading && (
                        <div className="text-center text-muted-foreground text-sm">Start chatting to begin your interview</div>
                      )}
                    </div>
                  </ScrollArea>
                  <form
                    className="flex flex-col gap-3"
                    onSubmit={(event) => {
                      event.preventDefault()
                      handleSend()
                    }}
                  >
                    
                    <div className="flex items-center gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="shrink-0 h-9 w-9"
                            aria-label="Open voice and session controls"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 space-y-4" align="start">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                              <Volume2 className="h-4 w-4" />
                              Voice replies
                            </div>
                            <Switch
                              checked={isVoiceReplyEnabled}
                              onCheckedChange={setIsVoiceReplyEnabled}
                              aria-label="Toggle voice replies"
                            />
                          </div>

                          

                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {isRecording && <span className="text-destructive font-semibold">Recording</span>}
                            {isRecording && <span>• {recordingSeconds}s</span>}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant={isRecording ? "destructive" : "default"}
                              onClick={isRecording ? handleStopRecording : handleStartRecording}
                              disabled={isProcessingVoice || isSessionEnded}
                            >
                              {isRecording ? <Square className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
                              {isRecording ? "Stop recording" : "Start speaking"}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                if (!voiceReplyUrl) return

                                const audioElement = new Audio(voiceReplyUrl)
                                voicePlaybackRef.current = audioElement

                                audioElement.addEventListener("ended", () => {
                                  if (voicePlaybackRef.current === audioElement) {
                                    voicePlaybackRef.current = null
                                  }
                                })

                                audioElement.addEventListener("pause", () => {
                                  if (voicePlaybackRef.current === audioElement) {
                                    voicePlaybackRef.current = null
                                  }
                                })

                                try {
                                  await audioElement.play()
                                } catch (playbackError) {
                                  setVoiceError(
                                    playbackError instanceof Error
                                      ? playbackError.message
                                      : "Unable to replay the audio reply.",
                                  )
                                  return
                                }

                                try {
                                  await initializeVisualizer(audioElement)
                                } catch (error) {
                                  handleVisualizerFailure(error)
                                }
                              }}
                              disabled={!voiceReplyUrl}
                            >
                              <Volume2 className="mr-2 h-4 w-4" />
                              Replay
                            </Button>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            Recording will end automatically after a moment of silence.
                          </p>

                          {voiceError && <p className="text-xs text-destructive">{voiceError}</p>}

                          {visualizerNotice && (
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                              {visualizerNotice}
                            </p>
                          )}
                        </PopoverContent>
                      </Popover>
                      <Textarea
                        id="prep-input"
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        placeholder={isSessionEnded ? "Session ended. Restart to continue." : "..."}
                        className="h-9 min-h-[2.25rem] flex-1 resize-none"
                        disabled={isGenerating || isSessionEnded}
                      />
                      <Button type="submit" disabled={!input.trim() || isGenerating || isSessionEnded}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
              <aside className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto border-border/60 bg-background/70 p-4 sm:p-6 lg:border-l">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Job context</p>
                  <Select
                    value={selectedApplicationId}
                    onValueChange={(value) => setSelectedApplicationId(value)}
                    disabled={isLoading || jobOptions.length === 0}
                  >
                    <SelectTrigger id="role-select" className="w-full bg-background/70 text-left">
                      <SelectValue placeholder="Pick a role" className="truncate" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72 truncate max-w-[18.5rem]">
                      {jobOptions.map((job) => (
                        <SelectItem key={job.id} value={job.id} title={job.label}>
                          {job.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!isLoading && jobOptions.length === 0 && (
                    <p className="text-sm text-muted-foreground">No roles found yet. Add one from the dashboard to get started.</p>
                  )}
                </div>

                {selectedApplication && (
                  <>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-foreground">Interview</p>
                      {interviewOptions.length > 0 ? (
                        <Select
                          value={selectedInterviewId ?? GENERAL_INTERVIEW_VALUE}
                          onValueChange={(value) =>
                            setSelectedInterviewId(value === GENERAL_INTERVIEW_VALUE ? null : value)
                          }
                        >
                          <SelectTrigger className="bg-background/70 text-left">
                            <SelectValue
                              placeholder="Choose an interview"
                              className="truncate"
                              aria-label="Select interview"
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={GENERAL_INTERVIEW_VALUE}>General prep</SelectItem>
                            {interviewOptions.map((interview) => (
                              <SelectItem key={interview.id} value={interview.id} title={interview.label}>
                                {interview.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm text-muted-foreground">No interviews yet. Chats will be unassigned.</p>
                      )}
                    </div>

                    <Accordion type="multiple" collapsible defaultValue={["jobInformation"]} className="space-y-2">
                      {applicationCards.map((card) => {
                        const Icon = card.icon

                        return (
                          <AccordionItem
                            key={card.key}
                            value={card.key}
                            className="overflow-hidden rounded-lg border border-border/60 bg-background/80 shadow-sm"
                          >
                            <AccordionTrigger className="px-3 py-3 min-h-[120px] items-center">
                              <div className="flex items-center gap-2 text-base font-semibold leading-6 text-foreground">
                                {Icon && <Icon className="h-4 w-4 text-primary" />}
                                <span>{card.title}</span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-3 pb-4">{card.render(selectedApplication)}</AccordionContent>
                          </AccordionItem>
                        )
                      })}
                    </Accordion>
                  </>
                )}
              </aside>
            </div>
          </div>
        </Card>
      </main>

      {isFocusMode && (
        <div className="fixed inset-0 z-50 isolate bg-gradient-to-b from-black via-zinc-950 to-black text-white transition-opacity duration-500">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.08),transparent_35%),radial-gradient(circle_at_80%_40%,rgba(16,185,129,0.12),transparent_30%)] blur-3xl" />

          <div className="relative flex h-full flex-col">
            <div className="flex items-center justify-between px-6 py-5 text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-400/80">
              <span className="text-primary/70">Focus mode</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsFocusMode(false)}
                className="border border-white/10 bg-white/10 text-white shadow-[0_10px_40px_rgba(0,0,0,0.45)] backdrop-blur hover:bg-white/20"
              >
                Exit focus
              </Button>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 pb-12 text-center">
              <div
                role="button"
                tabIndex={0}
                aria-label={isRecording ? "Stop recording" : "Start speaking"}
                onClick={() => {
                  if (isProcessingVoice) return
                  if (isRecording) {
                    handleStopRecording()
                  } else {
                    void handleStartRecording()
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    if (isProcessingVoice) return
                    if (isRecording) {
                      handleStopRecording()
                    } else {
                      void handleStartRecording()
                    }
                  }
                }}
                className="relative flex h-52 w-52 cursor-pointer items-center justify-center rounded-full sm:h-60 sm:w-60"
              >
                <div
                  ref={visualizerContainerRef}
                  className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
                  aria-hidden
                />
                <div
                  className={cn(
                    "absolute inset-0 rounded-full bg-emerald-400/10 transition-all duration-700",
                    isRecording ? "animate-[pulse_2s_ease-in-out_infinite]" : "opacity-50",
                  )}
                />
                <div
                  className={cn(
                    "absolute inset-3 rounded-full border border-white/10 transition-all duration-700",
                    isRecording
                      ? "shadow-[0_0_0_18px_rgba(52,211,153,0.15)]"
                      : isProcessingVoice
                        ? "shadow-[0_0_0_12px_rgba(99,102,241,0.12)]"
                        : "shadow-[0_0_0_8px_rgba(255,255,255,0.04)]",
                  )}
                />
                <div className="relative flex h-36 w-36 items-center justify-center rounded-full bg-white/5 shadow-[0_20px_120px_rgba(0,0,0,0.65)] backdrop-blur">
                  {isRecording ? (
                    <Mic className="h-10 w-10 text-emerald-400" />
                  ) : (
                    <Volume2 className={cn("h-10 w-10", isProcessingVoice ? "text-primary" : "text-zinc-300")} />
                  )}
                </div>
              </div>

              <div className="max-w-3xl space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70">Prep is speaking</p>
                <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-left shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
                  <p className="text-lg leading-relaxed text-white/90 whitespace-pre-wrap" aria-live="polite">
                    {latestAssistantMessage?.content?.trim()
                      ? latestAssistantMessage.content
                      : "Say hello to start."}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-zinc-400">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      isRecording
                        ? "bg-emerald-400 shadow-[0_0_0_6px_rgba(52,211,153,0.25)]"
                        : "bg-zinc-600",
                    )}
                  />
                  <span>
                    {isRecording ? "Listening... tap to end" : "Tap the circle to start speaking"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  <span>{isVoiceReplyEnabled ? "Voice replies on" : "Voice replies muted"}</span>
                </div>
              </div>

              {visualizerNotice && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
                  {visualizerNotice}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
