"use client"

import { useEffect, useMemo, useState } from "react"
import { format, formatDistanceToNow } from "date-fns"
import {
  CalendarClock,
  CalendarIcon,
  ChevronDown,
  ClipboardPen,
  NotebookPen,
  Trash,
  Plus,
  Search,
} from "lucide-react"

import { Header } from "@/components/header"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { apiFetch } from "@/lib/fetcher"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TruncatedText } from "@/components/ui/truncate"
import { cn } from "@/lib/utils"
import { useInterviews } from "@/lib/hooks/use-interviews"
import { useJobApplications } from "@/lib/hooks/use-job-applications"
import { getStatusRound } from "@/lib/status"
import type {
  InterviewStatus,
  InterviewType,
  InterviewWithApplication,
} from "@/lib/types/database"

type NotesUpdatePayload = Pick<InterviewWithApplication, "prep_notes" | "post_interview_notes">

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const interviewTypeOptions: InterviewType[] = ["Phone", "Video", "In-person", "Technical", "Final"]
const interviewStatusOptions: InterviewStatus[] = ["Scheduled", "Completed", "Cancelled", "Rescheduled"]
const timeOptions = Array.from({ length: 96 }, (_, index) => {
  const hours = Math.floor(index / 4)
  const minutes = (index % 4) * 15

  const value = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
  const period = hours >= 12 ? "PM" : "AM"
  const displayHour = hours % 12 === 0 ? 12 : hours % 12
  const label = `${displayHour}:${minutes.toString().padStart(2, "0")} ${period}`

  return { value, label }
})
const statusClassMap: Record<InterviewStatus, string> = {
  Scheduled: "border-primary/30 text-primary",
  Completed: "border-emerald-500/40 text-emerald-500",
  Cancelled: "border-destructive/30 text-destructive",
  Rescheduled: "border-amber-500/40 text-amber-500",
}

const scheduledInPastMessage = "Scheduled interviews must use a future date and time"

type InterviewFormState = {
  job_application_id: string
  interview_round: string
  interview_type: InterviewType
  duration_minutes: string
  interviewer_name: string
  interviewer_email: string
  notes: string
  prep_notes: string
  post_interview_notes: string
  status: InterviewStatus
}

type FormSnapshot = {
  formState: InterviewFormState
  scheduledDate: string | null
  scheduledTime: string
}

const createDefaultFormState = (): InterviewFormState => ({
  job_application_id: "",
  interview_round: "1",
  interview_type: interviewTypeOptions[0],
  duration_minutes: "60",
  interviewer_name: "",
  interviewer_email: "",
  notes: "",
  prep_notes: "",
  post_interview_notes: "",
  status: "Scheduled",
})

interface InterviewNotesCardProps {
  interview: InterviewWithApplication
  onSave: (id: string, payload: NotesUpdatePayload) => Promise<void>
  pendingId: string | null
}

function InterviewNotesCard({ interview, onSave, pendingId }: InterviewNotesCardProps) {
  const [prepNotes, setPrepNotes] = useState(interview.prep_notes ?? "")
  const [postNotes, setPostNotes] = useState(interview.post_interview_notes ?? "")

  useEffect(() => {
    setPrepNotes(interview.prep_notes ?? "")
    setPostNotes(interview.post_interview_notes ?? "")
  }, [interview.id, interview.post_interview_notes, interview.prep_notes])

  const isDirty =
    prepNotes !== (interview.prep_notes ?? "") || postNotes !== (interview.post_interview_notes ?? "")

  const isPending = pendingId === interview.id

  return (
    <Card className="flex h-full flex-col border-border/70 shadow-sm">
      <CardContent className="flex flex-1 flex-col gap-5">
        <div className="flex min-h-0 flex-1 flex-col gap-5 md:flex-row">
          <div className="flex min-h-0 flex-1 flex-col space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ClipboardPen className="h-4 w-4" />
              <span>Prep notes</span>
            </div>
            <Textarea
              value={prepNotes}
              onChange={(event) => setPrepNotes(event.target.value)}
              placeholder="Research the company, confirm portfolio links, outline stories to share..."
              className="min-h-0 flex-1 resize-none"
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <NotebookPen className="h-4 w-4" />
              <span>Post-interview recap</span>
            </div>
            <Textarea
              value={postNotes}
              onChange={(event) => setPostNotes(event.target.value)}
              placeholder="Document how the conversation went, follow-up questions, or next steps."
              className="min-h-0 flex-1 resize-none"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!isDirty || isPending}
            onClick={() => onSave(interview.id, { prep_notes: prepNotes, post_interview_notes: postNotes })}
          >
            Save notes
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function InterviewsPage() {
  const { toast } = useToast()
  const { interviews, isLoading, mutate } = useInterviews()
  const {
    applications,
    isLoading: isLoadingApplications,
    mutate: mutateApplications,
  } = useJobApplications<undefined, true>({
    limit: 200,
    include_interviews: true,
  })
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingInterviewId, setEditingInterviewId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [selectedInterviewId, setSelectedInterviewId] = useState<string | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [formState, setFormState] = useState<InterviewFormState>(createDefaultFormState)
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined)
  const [scheduledTime, setScheduledTime] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState<{
    job_application_id?: string
    scheduled_date?: string
    interview_round?: string
  }>({})
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [initialFormSnapshot, setInitialFormSnapshot] = useState<FormSnapshot | null>(null)

  const createFormSnapshot = (
    state: InterviewFormState,
    date: Date | undefined,
    time: string,
  ): FormSnapshot => ({
    formState: state,
    scheduledDate: date ? date.toISOString() : null,
    scheduledTime: time,
  })

  const resetFormState = () => {
    const defaults = createDefaultFormState()
    setFormState(defaults)
    setScheduledDate(undefined)
    setScheduledTime("")
    setFormErrors({})
    setFormErrorMessage(null)

    return defaults
  }

  const sortedInterviews = useMemo(() => {
    return [...interviews].sort((a, b) => {
      const first = new Date(a.scheduled_date).getTime()
      const second = new Date(b.scheduled_date).getTime()

      return Number.isNaN(second) || Number.isNaN(first) ? 0 : second - first
    })
  }, [interviews])

  const eligibleApplications = useMemo(() => {
    return applications.filter((application) => {
      const maxInterviewRound = getStatusRound(application.status) ?? 0
      const loggedInterviews = application.interviews?.length ?? 0

      return maxInterviewRound > 0 && loggedInterviews < maxInterviewRound
    })
  }, [applications])

  const selectedApplication = useMemo(
    () => applications.find((application) => application.id === formState.job_application_id),
    [applications, formState.job_application_id],
  )

  const selectedApplicationRoundCap = useMemo(() => {
    if (!selectedApplication) return null

    return getStatusRound(selectedApplication.status) ?? null
  }, [selectedApplication])

  const applicationOptions = useMemo(
    () => (isEditing ? applications : eligibleApplications),
    [applications, eligibleApplications, isEditing],
  )

  useEffect(() => {
    if (isEditing) return

    if (!selectedApplication) {
      setFormState((prev) => ({ ...prev, interview_round: "1" }))
      return
    }

    const nextRound = Math.min(
      (selectedApplication.interviews?.length ?? 0) + 1,
      selectedApplicationRoundCap ?? (selectedApplication.interviews?.length ?? 0) + 1,
    )

    setFormState((prev) => ({ ...prev, interview_round: String(nextRound) }))
  }, [isEditing, selectedApplication, selectedApplicationRoundCap])

  const handleDialogChange = (open: boolean) => {
    setIsDialogOpen(open)
    if (!open) {
      setIsEditing(false)
      setEditingInterviewId(null)
      resetFormState()
      setInitialFormSnapshot(null)
    }
  }

  const handleOpenCreateDialog = () => {
    setIsEditing(false)
    setEditingInterviewId(null)
    const defaults = resetFormState()
    setInitialFormSnapshot(createFormSnapshot(defaults, undefined, ""))
    setIsDialogOpen(true)
  }

  const handleEditInterview = (interview: InterviewWithApplication) => {
    const scheduledDateValue = interview.scheduled_date ? new Date(interview.scheduled_date) : undefined
    const isValidDate = !!(scheduledDateValue && !Number.isNaN(scheduledDateValue.getTime()))

    setIsEditing(true)
    setEditingInterviewId(interview.id)
    const nextFormState: InterviewFormState = {
      job_application_id: interview.job_application_id ?? "",
      interview_round: interview.interview_round ? String(interview.interview_round) : "1",
      interview_type: interview.interview_type ?? interviewTypeOptions[0],
      duration_minutes: interview.duration_minutes ? String(interview.duration_minutes) : "60",
      interviewer_name: interview.interviewer_name ?? "",
      interviewer_email: interview.interviewer_email ?? "",
      notes: interview.notes ?? "",
      prep_notes: interview.prep_notes ?? "",
      post_interview_notes: interview.post_interview_notes ?? "",
      status: interview.status,
    }
    const nextScheduledDate = isValidDate ? scheduledDateValue : undefined
    const nextScheduledTime =
      isValidDate
        ? `${scheduledDateValue.getHours().toString().padStart(2, "0")}:${scheduledDateValue
            .getMinutes()
            .toString()
            .padStart(2, "0")}`
        : ""

    setFormState(nextFormState)
    setScheduledDate(nextScheduledDate)
    setScheduledTime(nextScheduledTime)
    setFormErrors({})
    setFormErrorMessage(null)
    setInitialFormSnapshot(createFormSnapshot(nextFormState, nextScheduledDate, nextScheduledTime))
    setIsDialogOpen(true)
  }

  const [searchQuery, setSearchQuery] = useState("")

  const filteredInterviews = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    if (!query) {
      return sortedInterviews
    }

    return sortedInterviews.filter((interview) => {
      const company = interview.job_applications?.company_name?.toLowerCase() ?? ""
      const title = interview.job_applications?.position_title?.toLowerCase() ?? ""
      const type = interview.interview_type?.toLowerCase() ?? ""

      return company.includes(query) || title.includes(query) || type.includes(query)
    })
  }, [searchQuery, sortedInterviews])

  const groupedInterviews = useMemo(() => {
    const order: string[] = []
    const groups = new Map<
      string,
      {
        id: string
        company: string
        position: string
        interviews: InterviewWithApplication[]
      }
    >()

    filteredInterviews.forEach((interview) => {
      const groupId = interview.job_application_id || "unknown"
      if (!groups.has(groupId)) {
        order.push(groupId)
        groups.set(groupId, {
          id: groupId,
          company: interview.job_applications?.company_name ?? "Company",
          position: interview.job_applications?.position_title ?? "Interview",
          interviews: [],
        })
      }

      const group = groups.get(groupId)
      if (group) {
        group.interviews.push(interview)
      }
    })
    return order.map((id) => groups.get(id)!)
  }, [filteredInterviews])

  useEffect(() => {
    setExpandedGroups((previous) => {
      const next = { ...previous }
      let changed = false
      const validIds = new Set(groupedInterviews.map((group) => group.id))

      groupedInterviews.forEach((group) => {
        if (next[group.id] === undefined) {
          next[group.id] = true
          changed = true
        }
      })

      Object.keys(next).forEach((id) => {
        if (!validIds.has(id)) {
          delete next[id]
          changed = true
        }
      })

      return changed ? next : previous
    })
  }, [groupedInterviews])

  useEffect(() => {
    if (filteredInterviews.length === 0) {
      setSelectedInterviewId(null)
      return
    }

    setSelectedInterviewId((current) => {
      if (current && filteredInterviews.some((interview) => interview.id === current)) {
        return current
      }

      return filteredInterviews[0]?.id ?? null
    })
  }, [filteredInterviews])

  const currentFormSnapshot = useMemo(
    () => createFormSnapshot(formState, scheduledDate, scheduledTime),
    [formState, scheduledDate, scheduledTime],
  )

  const isScheduleEdited = useMemo(() => {
    if (!isEditing || !initialFormSnapshot) return true

    return (
      initialFormSnapshot.scheduledDate !== currentFormSnapshot.scheduledDate ||
      initialFormSnapshot.scheduledTime !== currentFormSnapshot.scheduledTime
    )
  }, [currentFormSnapshot.scheduledDate, currentFormSnapshot.scheduledTime, initialFormSnapshot, isEditing])

  const hasChanges = useMemo(() => {
    if (!initialFormSnapshot) return true

    const formStateEqual = Object.entries(initialFormSnapshot.formState).every(
      ([key, value]) =>
        currentFormSnapshot.formState[key as keyof InterviewFormState] ===
        value,
    )

    return !(
      formStateEqual &&
      initialFormSnapshot.scheduledDate === currentFormSnapshot.scheduledDate &&
      initialFormSnapshot.scheduledTime === currentFormSnapshot.scheduledTime
    )
  }, [currentFormSnapshot, initialFormSnapshot])

  const handleSubmitInterview = async () => {
    if (!hasChanges) {
      return
    }

    const newErrors: typeof formErrors = {}

    if (!formState.job_application_id) {
      newErrors.job_application_id = "Select a job"
    }

    const parsedRound = Number(formState.interview_round)
    if (!Number.isFinite(parsedRound) || parsedRound < 1) {
      newErrors.interview_round = "Enter a valid round"
    } else if (selectedApplicationRoundCap && parsedRound > selectedApplicationRoundCap) {
      newErrors.interview_round = `Round must be ${selectedApplicationRoundCap} or below`
    }

    if (!scheduledDate || !scheduledTime.trim()) {
      newErrors.scheduled_date = "Add a date and time"
    }

    setFormErrors(newErrors)

    if (Object.keys(newErrors).length > 0) {
      setFormErrorMessage("")
      return
    }

    setFormErrorMessage(null)

    const [hours, minutes] = scheduledTime.split(":").map(Number)
    const hasValidTime = Number.isFinite(hours) && Number.isFinite(minutes)

    if (!scheduledDate || !hasValidTime) {
      setFormErrors((prev) => ({
        ...prev,
        scheduled_date: newErrors.scheduled_date ?? "Add a valid date and time",
      }))
      setFormErrorMessage("Fill in the required fields before saving.")
      return
    }

    const scheduledDateTime = new Date(scheduledDate)
    scheduledDateTime.setHours(hours ?? 0, minutes ?? 0, 0, 0)

    const isEligible = eligibleApplications.some(
      (application) => application.id === formState.job_application_id,
    )

    if (!isEditing && !isEligible) {
      toast({
        title: "Update job status first",
        description: "Progress the job to the next interview round before logging it.",
        variant: "destructive",
      })
      return
    }

    if (formState.status === "Scheduled" && isScheduleEdited && scheduledDateTime.getTime() < Date.now()) {
      toast({
        title: "Pick a future time",
        description: scheduledInPastMessage,
        variant: "destructive",
      })
      setFormErrorMessage(scheduledInPastMessage)
      setFormErrors((prev) => ({ ...prev, scheduled_date: "Choose a future date and time" }))
      return
    }

    setIsSubmitting(true)
    try {
      const cappedRound = Number.isFinite(parsedRound)
        ? Math.min(parsedRound, selectedApplicationRoundCap ?? parsedRound)
        : undefined
      const payload = {
        ...formState,
        interview_round: cappedRound,
        scheduled_date: scheduledDateTime.toISOString(),
        duration_minutes: Number(formState.duration_minutes) || 60,
        notes: formState.notes.trim() || undefined,
        prep_notes: formState.prep_notes.trim() || undefined,
        post_interview_notes: formState.post_interview_notes.trim() || undefined,
        interviewer_name: formState.interviewer_name.trim() || undefined,
        interviewer_email: formState.interviewer_email.trim() || undefined,
      }

      const isUpdate = isEditing && editingInterviewId
      const requestUrl = isUpdate ? `/api/interviews/${editingInterviewId}` : "/api/interviews"
      const requestMethod = isUpdate ? "PUT" : "POST"

      const response = await apiFetch(requestUrl, {
        method: requestMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        const message = data?.message || data?.error || `Request failed (${response.status})`
        const error = new Error(message) as Error & { code?: string }
        error.code = data?.code
        throw error
      }


      toast({
        title: isEditing ? "Interview updated" : "Interview logged",
        description: isEditing ? "Details saved." : "Keep prepping and add notes as you go.",
      })
      handleDialogChange(false)
      await Promise.all([mutate(), mutateApplications()])
      if (editingInterviewId) {
        setSelectedInterviewId(editingInterviewId)
      }
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : String(error)
      const errorCode = (error as { code?: string } | null)?.code
      const sequencingConflict =
        errorCode === "ROUND_SEQUENCE_CONFLICT" || message.includes("must be scheduled")

      if (message === scheduledInPastMessage && isScheduleEdited) {
        toast({
          title: "Pick a future time",
          description: scheduledInPastMessage,
          variant: "destructive",
        })
        setFormErrorMessage(scheduledInPastMessage)
        setFormErrors((prev) => ({ ...prev, scheduled_date: "Choose a future date and time" }))
        return
      }

      if (sequencingConflict) {
        toast({
          title: "Interview order conflict",
          description: message,
          variant: "destructive",
        })
        return
      }

      toast({
        title: isEditing ? "Unable to update interview" : "Unable to create interview",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSaveNotes = async (id: string, payload: NotesUpdatePayload) => {
    setPendingId(id)
    try {
      const response = await apiFetch(`/api/interviews/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error("Failed to update interview")
      }

      toast({ title: "Notes saved" })
      await Promise.all([mutate(), mutateApplications()])
    } catch (error) {
      console.error(error)
      toast({ title: "Unable to update interview", variant: "destructive" })
    } finally {
      setPendingId(null)
    }
  }

  const selectedInterview = useMemo(
    () => filteredInterviews.find((interview) => interview.id === selectedInterviewId) ?? null,
    [filteredInterviews, selectedInterviewId],
  )

  const handleDeleteInterview = async () => {
    if (!selectedInterview) return

    const interviewId = selectedInterview.id

    const nextSelection = (() => {
      const currentIndex = filteredInterviews.findIndex((interview) => interview.id === interviewId)
      if (currentIndex === -1) return null

      return filteredInterviews[currentIndex + 1]?.id ?? filteredInterviews[currentIndex - 1]?.id ?? null
    })()

    setDeletingId(interviewId)

    try {
      const response = await apiFetch(`/api/interviews/${interviewId}`, { method: "DELETE" })

      if (!response.ok) {
        throw new Error("Failed to delete interview")
      }

      toast({ title: "Interview deleted" })
      setSelectedInterviewId(nextSelection)
      await Promise.all([mutate(), mutateApplications()])
    } catch (error) {
      console.error(error)
      toast({ title: "Unable to delete interview", variant: "destructive" })
    } finally {
      setDeletingId(null)
      setIsDeleteDialogOpen(false)
    }
  }

  const selectedInterviewSchedule = useMemo(() => {
    if (!selectedInterview?.scheduled_date) {
      return null
    }

    const scheduledDate = new Date(selectedInterview.scheduled_date)

    if (Number.isNaN(scheduledDate.getTime())) {
      return null
    }

    return {
      formatted: format(scheduledDate, "MMM d, yyyy • h:mm a"),
      relative: formatDistanceToNow(scheduledDate, { addSuffix: true }),
    }
  }, [selectedInterview])

  return (
    <div className="adaptive-scroll-layout flex h-screen flex-col bg-background overflow-hidden">
      <Header />
      <main className="flex-1 overflow-hidden px-6 pb-4 pt-24">
        <div className="adaptive-scroll-content mx-auto flex h-full max-w-7xl flex-col gap-6">
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden gap-2">
            <CardHeader className="gap-3 pb-2 sm:pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="w-full sm:max-w-md">
                  <Label htmlFor="interview-search" className="sr-only">
                    Search interviews...
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="interview-search"
                      placeholder="Search interviews..."
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
                  <Button onClick={handleOpenCreateDialog} className="gap-2" disabled={isLoadingApplications}>
                    <Plus className="h-4 w-4" />
                    Log interview
                  </Button>
                  <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
                    <DialogHeader>
                      <DialogTitle>{isEditing ? "Edit interview" : "Log interview"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Job application *</Label>
                          <Select
                            value={formState.job_application_id}
                            onValueChange={(value) => {
                              setFormState((prev) => ({ ...prev, job_application_id: value }))
                              setFormErrors((prev) => ({ ...prev, job_application_id: undefined }))
                            }}
                            disabled={applicationOptions.length === 0 && !isEditing}
                          >
                            <SelectTrigger
                              className={cn(
                                "w-full",
                                formErrors.job_application_id &&
                                  "border-destructive focus-visible:ring-destructive",
                              )}
                            >
                              <SelectValue
                                placeholder={
                                  isLoadingApplications
                                    ? "Loading applications..."
                                    : applicationOptions.length === 0
                                        ? "Update job statuses to log interviews"
                                        : "Select a job"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent className="w-[--radix-select-trigger-width]">
                              {applicationOptions.length === 0 ? (
                                <SelectItem value="no-available-applications" disabled>
                                  No jobs ready for interviews yet
                                </SelectItem>
                              ) : (
                                applicationOptions.map((application) => (
                                  <SelectItem
                                    key={application.id}
                                    value={application.id}
                                    maxWidthClassName="max-w-[25rem]"
                                  > 
                                    {application.company_name} — {application.position_title}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          {formErrors.job_application_id ? (
                            <p className="text-sm text-destructive">{formErrors.job_application_id}</p>
                          ) : null}
                        </div>
                        <div className="space-y-2">
                          <Label>Interview type</Label>
                          <Select
                            value={formState.interview_type}
                            onValueChange={(value) =>
                              setFormState((prev) => ({ ...prev, interview_type: value as InterviewType }))
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="w-[--radix-select-trigger-width]">
                              {interviewTypeOptions.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_140px]">
                        <div className="space-y-2">
                          <Label>Status</Label>
                          <Select
                            value={formState.status}
                            onValueChange={(value) =>
                              setFormState((prev) => ({ ...prev, status: value as InterviewStatus }))
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="w-[--radix-select-trigger-width]">
                              {interviewStatusOptions.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {status}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Duration (minutes)</Label>
                          <Input
                            type="number"
                            min={10}
                            value={formState.duration_minutes}
                            onChange={(event) =>
                              setFormState((prev) => ({ ...prev, duration_minutes: event.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Label>Round *</Label>
                            {selectedApplicationRoundCap ? (
                              <span className="text-xs text-muted-foreground">Max {selectedApplicationRoundCap}</span>
                            ) : null}
                          </div>
                          <Input
                            type="number"
                            min={1}
                            max={selectedApplicationRoundCap ?? undefined}
                            value={formState.interview_round}
                            onChange={(event) => {
                              setFormState((prev) => ({ ...prev, interview_round: event.target.value }))
                              setFormErrors((prev) => ({ ...prev, interview_round: undefined }))
                            }}
                          />
                          {formErrors.interview_round ? (
                            <p className="text-sm text-destructive">{formErrors.interview_round}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Scheduled for *</Label>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full justify-start text-left font-normal sm:w-auto sm:flex-1",
                                  formErrors.scheduled_date &&
                                    "border-destructive focus-visible:ring-destructive",
                                )}
                                onClick={() =>
                                  setFormErrors((prev) => ({ ...prev, scheduled_date: undefined }))
                                }
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {scheduledDate ? format(scheduledDate, "PPP") : "Pick a date"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={scheduledDate}
                                onSelect={(date) => {
                                  setScheduledDate(date ?? undefined)
                                  setFormErrors((prev) => ({ ...prev, scheduled_date: undefined }))
                                }}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <Select
                            value={scheduledTime}
                            onValueChange={(value) => {
                              setScheduledTime(value)
                              setFormErrors((prev) => ({ ...prev, scheduled_date: undefined }))
                            }}
                          >
                            <SelectTrigger
                              className={cn(
                                "w-full sm:w-[200px]",
                                formErrors.scheduled_date &&
                                  "border-destructive focus-visible:ring-destructive",
                              )}
                            >
                              <SelectValue placeholder="Time" />
                            </SelectTrigger>
                            <SelectContent className="w-[--radix-select-trigger-width]">
                              {timeOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {formErrors.scheduled_date ? (
                          <p className="text-sm text-destructive">{formErrors.scheduled_date}</p>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Interviewer name</Label>
                          <Input
                            value={formState.interviewer_name}
                            onChange={(event) =>
                              setFormState((prev) => ({ ...prev, interviewer_name: event.target.value }))
                            }
                            placeholder="Who are you meeting with?"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Interviewer email</Label>
                          <Input
                            type="email"
                            value={formState.interviewer_email}
                            onChange={(event) =>
                              setFormState((prev) => ({ ...prev, interviewer_email: event.target.value }))
                            }
                            placeholder="Add their email for quick reference"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Interview notes</Label>
                          <Textarea
                            value={formState.notes}
                            onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
                            placeholder="Add any prep notes or agenda items"
                            className="min-h-[80px]"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Prep notes</Label>
                          <Textarea
                            value={formState.prep_notes}
                            onChange={(event) => setFormState((prev) => ({ ...prev, prep_notes: event.target.value }))}
                            placeholder="Key stories, research, or questions to cover"
                            className="min-h-[80px]"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Post-interview notes</Label>
                        <Textarea
                          value={formState.post_interview_notes}
                          onChange={(event) =>
                            setFormState((prev) => ({ ...prev, post_interview_notes: event.target.value }))
                          }
                          placeholder="Capture takeaways right after the call"
                          className="min-h-[80px]"
                        />
                      </div>
                      {formErrorMessage && (
                        <p className="text-sm text-destructive">{formErrorMessage}</p>
                      )}
                    </div>
                    <DialogFooter>
                      <Button onClick={() => handleDialogChange(false)} type="button" variant="outline" className="flex-1">
                        Close
                      </Button>
                      <Button className="flex-1" onClick={handleSubmitInterview} disabled={isSubmitting || !hasChanges}>
                        {isSubmitting ? "Saving..." : isEditing ? "Save Changes" : "Add Interview"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

            
            </CardHeader>

            <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
              {isLoading ? (
                <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[360px_1fr]">
                  <div className="space-y-3">
                    {[...Array(4)].map((_, index) => (
                      <Skeleton key={index} className="h-24 w-full" />
                    ))}
                  </div>
                  <Skeleton className="h-full w-full" />
                </div>
              ) : interviews.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-center">
                  <div className="space-y-2">
                    <p className="text-lg font-semibold">No interviews yet</p>
                    <p className="text-sm text-muted-foreground">
                      Log your first interview to see details and notes here.
                    </p>
                  </div>
                </div>
              ) : filteredInterviews.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-center">
                  <div className="space-y-2">
                    <p className="text-lg font-semibold">No matches found</p>
                    <p className="text-sm text-muted-foreground">
                      Adjust your search to find a saved interview.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[360px_1fr]">
                  <div className="flex min-h-0 flex-col rounded-lg border bg-muted/40">

                    <ScrollArea className="flex-1">
                      <div className="space-y-3 p-4 pr-2">
                        {groupedInterviews.map((group) => {
                          const isExpanded = expandedGroups[group.id] ?? true

                          return (
                            <div key={group.id} className="rounded-lg border bg-card shadow-sm">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedGroups((previous) => ({
                                    ...previous,
                                    [group.id]: !isExpanded,
                                  }))
                                }
                                className="flex w-full items-start justify-between gap-3 rounded-lg p-3 text-left"
                              >
                                <div className="space-y-1">
                                  <TruncatedText
                                    text={group.company}
                                    className="text-xs uppercase tracking-wide text-muted-foreground"
                                    maxWidthClass="max-w-[17rem]"
                                  />
                                  <TruncatedText
                                    text={group.position}
                                    className="text-sm font-semibold leading-tight"
                                    maxWidthClass="max-w-[17rem]"
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    {group.interviews.length} interview{group.interviews.length === 1 ? "" : "s"}
                                  </p>
                                </div>
                                <ChevronDown
                                  className={cn(
                                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                                    isExpanded ? "rotate-180" : "rotate-0",
                                  )}
                                />
                              </button>
                              {isExpanded ? (
                                <div className="space-y-2 border-t bg-muted/40 p-3">
                                  {group.interviews.map((interview) => {
                                    const scheduledDate = new Date(interview.scheduled_date)
                                    const formattedDate = Number.isNaN(scheduledDate.getTime())
                                      ? "Date unavailable"
                                      : format(scheduledDate, "MMM d, yyyy")
                                    const timeLabel = Number.isNaN(scheduledDate.getTime())
                                      ? ""
                                      : format(scheduledDate, "h:mm a")

                                    return (
                                      <button
                                        key={interview.id}
                                        type="button"
                                        onClick={() => setSelectedInterviewId(interview.id)}
                                        className={cn(
                                          "w-full rounded-lg border bg-background p-3 text-left transition",
                                          selectedInterviewId === interview.id
                                            ? "border-primary bg-primary/5 shadow-sm"
                                            : "border-border/70 hover:border-primary/40",
                                        )}
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="space-y-1">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                              Round {interview.interview_round ?? "—"}
                                            </p>
                                            <p className="text-sm font-semibold leading-tight">
                                              {interview.interview_type ?? "Interview"}
                                            </p>
                                          </div>
                                          <Badge variant="outline" className={statusClassMap[interview.status]}>
                                            {interview.status}
                                          </Badge>
                                        </div>
                                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                          <CalendarClock className="h-3.5 w-3.5" />
                                          <span>{formattedDate}</span>
                                          {timeLabel ? <span>• {timeLabel}</span> : null}
                                        </div>
                                      </button>
                                    )
                                  })}
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    </ScrollArea>
                  </div>

                  <div className="min-h-0 rounded-lg border bg-card p-4 shadow-sm">
                    {selectedInterview ? (
                      <div className="flex h-full flex-col gap-4 overflow-hidden">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <CalendarClock className="h-4 w-4" />
                            {selectedInterviewSchedule ? (
                              <>
                                <span>{selectedInterviewSchedule.formatted}</span>
                                <span className="text-xs text-muted-foreground">
                                  ({selectedInterviewSchedule.relative})
                                </span>
                              </>
                            ) : (
                              <span>Date unavailable</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {/* {selectedInterview.interview_type ? (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "h-9 items-center rounded-md px-3 text-sm",
                                  statusClassMap[selectedInterview.status],
                                )}
                              >
                                {selectedInterview.interview_type}
                              </Badge>
                            ) : null} */}
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleEditInterview(selectedInterview)}
                            >
                              <NotebookPen/>
                            </Button>
                        
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setIsDeleteDialogOpen(true)}
                              disabled={deletingId === selectedInterview.id}
                            >
                              <Trash/>
                            </Button>

                          </div>
                        </div>

                        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
                          <div className="grid gap-3 rounded-lg border bg-muted/50 p-3 sm:grid-cols-4 sm:p-4">
                            <div className="rounded-md border bg-background/60 p-3 shadow-sm">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Round
                              </p>
                              <p className="text-sm font-semibold text-foreground">
                                {selectedInterview.interview_round
                                  ? `Round ${selectedInterview.interview_round}`
                                  : "Not set"}
                              </p>
                            </div>
                            <div className="rounded-md border bg-background/60 p-3 shadow-sm">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Duration
                              </p>
                              <p className="text-sm font-semibold text-foreground">
                                {selectedInterview.duration_minutes
                                  ? `${selectedInterview.duration_minutes} minutes`
                                  : "Not set"}
                              </p>
                            </div>
                            <div className="rounded-md border bg-background/60 p-3 shadow-sm">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Interviewer
                              </p>
                              <p className="text-sm font-semibold text-foreground">
                                {selectedInterview.interviewer_name ?? "Not provided"}
                              </p>
                            </div>
                            <div className="rounded-md border bg-background/60 p-3 shadow-sm">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Interviewer email
                              </p>
                              <p className="text-sm font-semibold text-foreground break-words">
                                {selectedInterview.interviewer_email ? (
                                  <a
                                    href={`mailto:${selectedInterview.interviewer_email}`}
                                    className="hover:underline"
                                  >
                                    {selectedInterview.interviewer_email}
                                  </a>
                                ) : (
                                  "Not provided"
                                )}
                              </p>
                            </div>
                          </div>

                          <div className="min-h-0 flex-1 overflow-y-auto">
                            <InterviewNotesCard
                              interview={selectedInterview}
                              onSave={handleSaveNotes}
                              pendingId={pendingId}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-center">
                        <div className="space-y-2">
                          <p className="text-lg font-semibold">Select an interview</p>
                          <p className="text-sm text-muted-foreground">
                            Choose a row on the left to view details, notes, and status changes.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <DeleteConfirmationDialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            title="Delete interview"
            description="This action cannot be undone. Are you sure you want to delete this interview?"
            confirmLabel="Delete"
            onConfirm={handleDeleteInterview}
          />
        </div>
      </main>
    </div>
  )
}
