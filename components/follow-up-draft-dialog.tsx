"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { differenceInCalendarDays } from "date-fns"
import { Loader2, Wand2, Copy, Check } from "lucide-react"

import { Button, type ButtonProps } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import type { JobApplication } from "@/lib/types/database"
import { useToast } from "@/components/ui/use-toast"
import { apiFetch } from "@/lib/fetcher"

interface FollowUpDraftDialogProps {
  application: JobApplication
  disabled?: boolean
  hasGeneratedDraft?: boolean
  onDraftUpdated?: (update: { draft: string; generatedAt?: string | null }) => void
  triggerClassName?: string
  triggerLabel?: string
  showTriggerLabel?: boolean
  triggerVariant?: ButtonProps["variant"]
  triggerSize?: ButtonProps["size"]
}

export function FollowUpDraftDialog({
  application,
  disabled,
  hasGeneratedDraft,
  onDraftUpdated,
  triggerClassName,
  triggerLabel = "AI draft",
  showTriggerLabel = true,
  triggerVariant = "secondary",
  triggerSize = "sm",
}: FollowUpDraftDialogProps) {
  const storedDraft = application.ai_follow_up_draft_text?.trim() ?? ""
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(storedDraft)
  const [savedDraft, setSavedDraft] = useState(storedDraft)
  const [isGenerating, setIsGenerating] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(Boolean(hasGeneratedDraft || storedDraft))
  const [hasRequestedGeneration, setHasRequestedGeneration] = useState(Boolean(hasGeneratedDraft || storedDraft))
  const [isSaving, setIsSaving] = useState(false)
  const [hasCopied, setHasCopied] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const nextStoredDraft = application.ai_follow_up_draft_text?.trim() ?? ""
    const hasExistingDraft = Boolean(hasGeneratedDraft || nextStoredDraft)

    if (open) {
      if (hasExistingDraft) {
        setHasGenerated(true)
        setHasRequestedGeneration(true)
      }
      return
    }

    setHasGenerated(hasExistingDraft)
    setHasRequestedGeneration(hasExistingDraft)

    if (nextStoredDraft !== savedDraft) {
      setDraft(nextStoredDraft)
      setSavedDraft(nextStoredDraft)
    }
  }, [application.ai_follow_up_draft_text, hasGeneratedDraft, open, savedDraft])

  useEffect(() => {
    if (!hasCopied) return
    const timeout = window.setTimeout(() => setHasCopied(false), 2000)
    return () => window.clearTimeout(timeout)
  }, [hasCopied])

  const hasUnsavedChanges = useMemo(() => draft !== savedDraft, [draft, savedDraft])

  const generateDraft = useCallback(async () => {
    if (hasGenerated) {
      toast({
        title: "Draft already generated",
        description: "You can only create one AI follow-up draft per application.",
      })
      return
    }

    setHasRequestedGeneration(true)
    setIsGenerating(true)
    try {
      const appliedAt = application.application_date ? new Date(application.application_date) : null
      const daysSinceApplication = appliedAt
        ? Math.max(0, differenceInCalendarDays(new Date(), appliedAt))
        : 0
      const response = await apiFetch("/api/follow-ups/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_application_id: application.id,
          companyName: application.company_name,
          positionTitle: application.position_title,
          contactName: application.contact_person,
          notes: application.notes,
          jobDescription: application.job_description,
          appliedAt: application.application_date,
          daysSinceApplication,
        }),
      })

      if (!response.ok) {
        if (response.status === 409) {
          setHasGenerated(true)
        }
        const body = await response.json().catch(() => ({ error: "Failed to generate follow-up" }))
        const existingDraft = typeof body?.data?.draft === "string" ? body.data.draft.trim() : ""
        if (existingDraft) {
          setDraft(existingDraft)
          setSavedDraft(existingDraft)
          onDraftUpdated?.({ draft: existingDraft })
        } else {
          setHasRequestedGeneration(true)
        }
        throw new Error(body.error ?? "Failed to generate follow-up")
      }

      const payload = (await response.json()) as { data?: { draft?: string } }
      const content = payload.data?.draft?.trim()
      if (!content) {
        throw new Error("The AI response did not include a draft to share.")
      }

      setDraft(content)
      setSavedDraft(content)
      setHasGenerated(true)
      onDraftUpdated?.({ draft: content, generatedAt: new Date().toISOString() })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate follow-up"
      toast({ title: "Draft failed", description: message, variant: "destructive" })
    } finally {
      setIsGenerating(false)
    }
  }, [application, hasGenerated, onDraftUpdated, toast])

  useEffect(() => {
    if (!open || hasGenerated || hasRequestedGeneration || isGenerating) {
      return
    }

    void generateDraft()
  }, [generateDraft, hasGenerated, hasRequestedGeneration, isGenerating, open])

  const saveDraft = useCallback(async () => {
    if (!hasGenerated || !hasUnsavedChanges) {
      return
    }

    const sanitizedDraft = draft.trim()
    if (!sanitizedDraft) {
      toast({
        title: "Draft is empty",
        description: "Add some content before saving your changes.",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      const response = await apiFetch("/api/follow-ups/draft", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_application_id: application.id, draft: sanitizedDraft }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Failed to save draft" }))
        throw new Error(body.error ?? "Failed to save draft")
      }

      setDraft(sanitizedDraft)
      setSavedDraft(sanitizedDraft)
      onDraftUpdated?.({ draft: sanitizedDraft })
      toast({ title: "Draft saved" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save draft"
      toast({ title: "Save failed", description: message, variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }, [application.id, draft, hasGenerated, hasUnsavedChanges, onDraftUpdated, toast])

  const handleCopy = useCallback(() => {
    if (!draft) return
    navigator.clipboard
      .writeText(draft)
      .then(() => {
        setHasCopied(true)
        toast({ title: "Draft copied" })
      })
      .catch(() => {
        toast({
          title: "Copy failed",
          description: "We couldn't copy your draft. Please try again.",
          variant: "destructive",
        })
      })
  }, [draft, toast])

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen)
      if (!nextOpen) {
        setIsGenerating(false)
      }
    }}>
      <DialogTrigger asChild>
        <Button
          variant={triggerVariant}
          size={triggerSize}
          disabled={disabled}
          className={`gap-2 ${triggerClassName ?? "w-[12.5rem]"}`}
        >
          <Wand2 className="h-4 w-4" />
          {showTriggerLabel ? triggerLabel : <span className="sr-only">{triggerLabel}</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl" showCloseButton={false}>
     
        <div className="space-y-3">
          <div className="relative">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={10}
              placeholder="Your AI-generated follow-up will appear here."
              className="max-h-80 min-h-[18rem] resize-none pr-12"
            />
            {isGenerating && !draft && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-background/80 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating your draft...
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              disabled={!draft}
              className="absolute right-2 top-2"
            >
              {hasCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              <span className="sr-only">{hasCopied ? "Draft copied" : "Copy draft"}</span>
            </Button>
          </div>
        
        </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" className="flex-1" size="sm" onClick={() => setOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void saveDraft()}
              disabled={!hasGenerated || !hasUnsavedChanges || isSaving}
              className="flex-1"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSaving ? "Saving" : "Save changes"}
            </Button>
          </div>
      </DialogContent>
    </Dialog>
  )
}
