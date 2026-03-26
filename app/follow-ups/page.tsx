"use client"

import { useCallback, useMemo, useState } from "react"
import { format, formatDistanceToNow } from "date-fns"
import { ArrowDown, ArrowUp, ArrowUpDown, Filter, MoreHorizontal, RotateCcw, Search, X } from "lucide-react"
import { Header } from "@/components/header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Calendar } from "@/components/ui/calendar"
import { useToast } from "@/components/ui/use-toast"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { apiFetch } from "@/lib/fetcher"
import { TruncatedText } from "@/components/ui/truncate"

import { useJobApplications } from "@/lib/hooks/use-job-applications"
import { useApplicationFollowUps } from "@/lib/hooks/use-application-follow-ups"
import type { ApplicationFollowUp, JobApplication } from "@/lib/types/database"
import { getDateOrNull } from "@/lib/date"

import { FollowUpDraftDialog } from "@/components/follow-up-draft-dialog"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type FollowUpRow = {
  application: JobApplication
  followUp: ApplicationFollowUp | undefined
  enabled: boolean
  nextReminder: Date | null
  lastSent: Date | null
  status: "due" | "upcoming" | "disabled"
}

type ReminderDialogState = {
  application: JobApplication
  date: Date | null
  isEnabling: boolean
}

type SortValue = "company" | "applied" | "next" | "last" | "status"
type SortDirection = "asc" | "desc"
type StatusFilter = FollowUpRow["status"]

const sortDirectionDefaults: Record<SortValue, SortDirection> = {
  company: "asc",
  applied: "desc",
  next: "asc",
  last: "desc",
  status: "asc",
}

function SortHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string
  active: boolean
  direction: SortDirection
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-auto inline-flex items-center justify-center gap-1 font-medium text-foreground transition-colors hover:text-primary"
    >
      <span>{label}</span>
      {active ? (
        direction === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </button>
  )
}

function computeNextReminder(followUp: ApplicationFollowUp | undefined): Date | null {
  if (!followUp?.enabled) {
    return null
  }

  return getDateOrNull(followUp.next_follow_up_date ?? null)
}

function dateToLocalISOString(date: Date | null): string | null {
  if (!date) {
    return null
  }

  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
  return Number.isNaN(localDate.getTime()) ? null : localDate.toISOString()
}

function toDateInputValue(date: Date | null): string {
  if (!date) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function isWithinDateRange(date: Date | null, startDate: string, endDate: string): boolean {
  if (!startDate && !endDate) return true
  if (!date) return false

  const value = toDateInputValue(date)
  if (startDate && value < startDate) return false
  if (endDate && value > endDate) return false

  return true
}

export default function FollowUpsPage() {
  const { toast } = useToast()
  const {
    applications,
    isLoading: isLoadingApplications,
    error,
    mutate: mutateJobApplications,
  } = useJobApplications({ limit: 200 })
  const { followUps, isLoading: isLoadingFollowUps, mutate: mutateFollowUps } = useApplicationFollowUps()
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const [reminderDialog, setReminderDialog] = useState<ReminderDialogState | null>(null)
  const [sortBy, setSortBy] = useState<SortValue>("next")
  const [sortDirection, setSortDirection] = useState<SortDirection>(sortDirectionDefaults.next)
  const [applicationQuery, setApplicationQuery] = useState("")
  const [appliedStartDate, setAppliedStartDate] = useState("")
  const [appliedEndDate, setAppliedEndDate] = useState("")
  const [nextReminderStartDate, setNextReminderStartDate] = useState("")
  const [nextReminderEndDate, setNextReminderEndDate] = useState("")
  const [lastReminderStartDate, setLastReminderStartDate] = useState("")
  const [lastReminderEndDate, setLastReminderEndDate] = useState("")
  const [statusFilters, setStatusFilters] = useState<StatusFilter[]>([])

  const handleDraftUpdated = useCallback(
    (applicationId: string, update: { draft: string; generatedAt?: string | null }) => {
      void mutateJobApplications(
        (current) => {
          if (!current) return current
          return {
            ...current,
            data: current.data.map((application) => {
              if (application.id !== applicationId) {
                return application
              }

              return {
                ...application,
                ai_follow_up_draft_text: update.draft,
                ai_follow_up_draft_generated_at:
                  update.generatedAt !== undefined
                    ? update.generatedAt
                    : application.ai_follow_up_draft_generated_at,
              }
            }),
          }
        },
        { revalidate: false },
      )
    },
    [mutateJobApplications],
  )

  const rows = useMemo<FollowUpRow[]>(() => {
    const now = Date.now()
    return applications.map((application) => {
      const followUp = followUps.find((item) => item.job_application_id === application.id)
      const enabled = followUp?.enabled ?? false
      const nextReminder = computeNextReminder(followUp)
      const lastSent = getDateOrNull(followUp?.last_notified_at ?? null)
      let status: FollowUpRow["status"] = "disabled"
      if (enabled && nextReminder) {
        status = nextReminder.getTime() <= now ? "due" : "upcoming"
      } else if (enabled) {
        status = "upcoming"
      }

      return {
        application,
        followUp,
        enabled,
        nextReminder,
        lastSent,
        status,
      }
    })
  }, [applications, followUps])


  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const normalizedQuery = applicationQuery.trim().toLowerCase()
      const company = (row.application.company_name ?? "").toLowerCase()
      const title = (row.application.position_title ?? "").toLowerCase()
      const appliedDate = getDateOrNull(row.application.application_date)

      if (normalizedQuery && !company.includes(normalizedQuery) && !title.includes(normalizedQuery)) {
        return false
      }
      if (!isWithinDateRange(appliedDate, appliedStartDate, appliedEndDate)) {
        return false
      }
      if (!isWithinDateRange(row.nextReminder, nextReminderStartDate, nextReminderEndDate)) {
        return false
      }
      if (!isWithinDateRange(row.lastSent, lastReminderStartDate, lastReminderEndDate)) {
        return false
      }
      if (statusFilters.length > 0 && !statusFilters.includes(row.status)) {
        return false
      }
      return true
    })
  }, [
    applicationQuery,
    appliedEndDate,
    appliedStartDate,
    lastReminderEndDate,
    lastReminderStartDate,
    nextReminderEndDate,
    nextReminderStartDate,
    rows,
    statusFilters,
  ])

  const sortedRows = useMemo(() => {
    const directionMultiplier = sortDirection === "asc" ? 1 : -1
    const getNextReminderValue = (row: FollowUpRow) =>
      row.nextReminder
        ? row.nextReminder.getTime()
        : sortDirection === "asc"
          ? Number.POSITIVE_INFINITY
          : Number.NEGATIVE_INFINITY

    const items = [...filteredRows]
    switch (sortBy) {
      case "status": {
        const priority: Record<FollowUpRow["status"], number> = { due: 0, upcoming: 1, disabled: 2 }
        return items.sort((a, b) => {
          const statusDiff = directionMultiplier * (priority[a.status] - priority[b.status])
          if (statusDiff !== 0) {
            return statusDiff
          }

          const left = getNextReminderValue(a)
          const right = getNextReminderValue(b)
          return directionMultiplier * (left - right)
        })
      }
      case "next":
        return items.sort((a, b) => {
          const left = getNextReminderValue(a)
          const right = getNextReminderValue(b)
          return directionMultiplier * (left - right)
        })
      case "applied":
        return items.sort((a, b) => {
          const left = getDateOrNull(a.application.application_date)?.getTime() ?? 0
          const right = getDateOrNull(b.application.application_date)?.getTime() ?? 0
          return directionMultiplier * (left - right)
        })
      case "last":
        return items.sort((a, b) => {
          const left = a.lastSent?.getTime() ?? 0
          const right = b.lastSent?.getTime() ?? 0
          return directionMultiplier * (left - right)
        })
      case "company":
        return items.sort((a, b) => {
          const left = a.application.company_name ?? ""
          const right = b.application.company_name ?? ""
          return directionMultiplier * left.localeCompare(right)
        })
      default:
        return items
    }
  }, [filteredRows, sortBy, sortDirection])

  const hasActiveFilters = useMemo(() => {
    return Boolean(
      applicationQuery.trim() ||
      appliedStartDate ||
      appliedEndDate ||
      nextReminderStartDate ||
      nextReminderEndDate ||
      lastReminderStartDate ||
      lastReminderEndDate ||
      statusFilters.length,
    )
  }, [
    applicationQuery,
    appliedEndDate,
    appliedStartDate,
    lastReminderEndDate,
    lastReminderStartDate,
    nextReminderEndDate,
    nextReminderStartDate,
    statusFilters.length,
  ])

  const isLoading = isLoadingApplications || isLoadingFollowUps

  const setPendingState = useCallback((id: string, value: boolean) => {
    setPending((previous) => ({ ...previous, [id]: value }))
  }, [])

  const updateFollowUp = useCallback(
    async (applicationId: string, enabled: boolean, nextReminder: string | null) => {
      setPendingState(applicationId, true)
      try {
        const response = await apiFetch("/api/follow-ups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            job_application_id: applicationId,
            enabled,
            next_follow_up_date: nextReminder,
          }),
        })

        if (!response.ok) {
          const body = await response.json().catch(() => ({ error: "Unable to update follow-up preferences" }))
          throw new Error(body.error ?? "Unable to update follow-up preferences")
        }

        toast({ title: "Follow-up reminder updated" })
        await mutateFollowUps()
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to update follow-up preferences"
        toast({ title: "Update failed", description: message, variant: "destructive" })
      } finally {
        setPendingState(applicationId, false)
      }
    },
    [mutateFollowUps, setPendingState, toast],
  )

  const openReminderDialog = useCallback((row: FollowUpRow, options?: { isEnabling?: boolean }) => {
    const fallbackDate = row.nextReminder
      ? new Date(row.nextReminder)
      : row.followUp?.next_follow_up_date
        ? getDateOrNull(row.followUp.next_follow_up_date)
        : new Date()

    setReminderDialog({
      application: row.application,
      date: fallbackDate ?? new Date(),
      isEnabling: options?.isEnabling ?? false,
    })
  }, [])

  const disableReminder = useCallback(() => {
    if (!reminderDialog) {
      return
    }

    void updateFollowUp(reminderDialog.application.id, false, null)
    setReminderDialog(null)
  }, [reminderDialog, updateFollowUp])

  const onSortChange = useCallback((value: SortValue) => {
    if (sortBy === value) {
      setSortDirection((previous) => (previous === "asc" ? "desc" : "asc"))
      return
    }

    setSortBy(value)
    setSortDirection(sortDirectionDefaults[value])
  }, [sortBy])

  const toggleStatusFilter = useCallback((status: StatusFilter) => {
    setStatusFilters((previous) =>
      previous.includes(status) ? previous.filter((current) => current !== status) : [...previous, status],
    )
  }, [])

  const resetFilters = useCallback(() => {
    setApplicationQuery("")
    setAppliedStartDate("")
    setAppliedEndDate("")
    setNextReminderStartDate("")
    setNextReminderEndDate("")
    setLastReminderStartDate("")
    setLastReminderEndDate("")
    setStatusFilters([])
  }, [])

  return (
    <div className="adaptive-scroll-layout flex h-screen flex-col bg-background overflow-hidden">
      <Header />
      <main className="flex-1 overflow-hidden px-6 pb-4 pt-24">
        <div className="adaptive-scroll-content flex h-full w-full flex-col space-y-8 overflow-hidden">
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="rounded-md border border-dashed p-4">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="mt-2 h-4 w-64" />
                  </div>
                ))}
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add job applications to start planning your follow-up cadence.
              </p>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden">
                <div className="space-y-4 overflow-y-auto md:hidden">
                  {sortedRows.map((row) => {
                    const isPending = pending[row.application.id]
                    const appliedDate = getDateOrNull(row.application.application_date)
                    const appliedLabel = appliedDate ? format(appliedDate, "MMM d, yyyy") : "Date unavailable"
                    const nextReminderLabel = row.enabled && row.nextReminder
                      ? row.status === "due"
                        ? `Due ${formatDistanceToNow(row.nextReminder, { addSuffix: true })}`
                        : format(row.nextReminder, "MMM d, yyyy")
                      : "Not scheduled"
                    const lastReminderLabel = row.lastSent ? format(row.lastSent, "MMM d, yyyy") : "Never"

                    return (
                      <div key={row.application.id} className="rounded-md border p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-medium leading-tight">{row.application.company_name ?? "Unknown company"}</p>
                            <p className="text-sm text-muted-foreground leading-tight">{row.application.position_title ?? "Unknown role"}</p>
                          </div>
                          <Badge variant="outline" className={getStatusBadgeTone(row.status)}>
                            {row.status === "due"
                              ? "Follow-up due"
                              : row.status === "upcoming"
                                ? "Scheduled"
                                : "Not scheduled"}
                          </Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <div>
                            <p className="font-medium text-foreground">Applied</p>
                            <p>{appliedLabel}</p>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">Next reminder</p>
                            <p>{nextReminderLabel}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="font-medium text-foreground">Last reminder</p>
                            <p>{lastReminderLabel}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon" disabled={isPending} aria-label="Open actions menu">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <div className="px-2 py-1">
                                <FollowUpDraftDialog
                                  application={row.application}
                                  disabled={(!row.enabled && !row.lastSent) || isPending}
                                  hasGeneratedDraft={Boolean(
                                    row.application.ai_follow_up_draft_generated_at ||
                                      row.application.ai_follow_up_draft_text,
                                  )}
                                  onDraftUpdated={(update) => handleDraftUpdated(row.application.id, update)}
                                  triggerVariant="ghost"
                                  triggerSize="sm"
                                  triggerClassName="w-full justify-start"
                                />
                              </div>
                              <DropdownMenuItem
                                onSelect={() => openReminderDialog(row, { isEnabling: !row.enabled })}
                                disabled={isPending}
                              >
                                Set reminder
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="relative hidden min-h-0 overflow-hidden rounded-lg border bg-card/40 md:block md:flex-1">
                  {hasActiveFilters && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={resetFilters}
                      className="absolute right-3 top-3 z-50 h-8 w-8"
                      aria-label="Reset all table filters"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}

                  <ScrollArea className="h-full w-full">
                  <table className="w-full table-fixed caption-bottom text-sm">
                    <colgroup>
                      <col className="w-1/6" />
                      <col className="w-1/6" />
                      <col className="w-1/6" />
                      <col className="w-1/6" />
                      <col className="w-1/6" />
                      <col className="w-1/6" />
                    </colgroup>
                    <TableHeader className="sticky top-0 z-30 bg-muted">
                      <TableRow>
                        <TableHead className="sticky top-0 z-40 bg-muted px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <SortHeader
                              label="Application"
                              active={sortBy === "company"}
                              direction={sortDirection}
                              onClick={() => onSortChange("company")}
                            />
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground" aria-label="Filter application column">
                                  <Filter className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="center" className="w-64 p-3">
                                <div className="space-y-2">
                                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Search company or title</p>
                                  <div className="relative">
                                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                      value={applicationQuery}
                                      onChange={(event) => setApplicationQuery(event.target.value)}
                                      placeholder="Company or title"
                                      className="h-8 pl-7"
                                    />
                                  </div>
                                </div>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableHead>
                        <TableHead className="sticky top-0 z-40 bg-muted px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <SortHeader
                              label="Applied"
                              active={sortBy === "applied"}
                              direction={sortDirection}
                              onClick={() => onSortChange("applied")}
                            />
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground" aria-label="Filter applied column">
                                  <Filter className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="center" className="w-64 p-3">
                                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Applied range</p>
                                <div className="space-y-2">
                                  <div>
                                    <p className="mb-1 text-xs text-muted-foreground">From</p>
                                    <Input
                                      type="date"
                                      value={appliedStartDate}
                                      onChange={(event) => setAppliedStartDate(event.target.value)}
                                      className="h-8"
                                    />
                                  </div>
                                  <div>
                                    <p className="mb-1 text-xs text-muted-foreground">To</p>
                                    <Input
                                      type="date"
                                      value={appliedEndDate}
                                      onChange={(event) => setAppliedEndDate(event.target.value)}
                                      className="h-8"
                                    />
                                  </div>
                                </div>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableHead>
                        <TableHead className="sticky top-0 z-40 bg-muted px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <SortHeader
                              label="Next reminder"
                              active={sortBy === "next"}
                              direction={sortDirection}
                              onClick={() => onSortChange("next")}
                            />
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground" aria-label="Filter next reminder column">
                                  <Filter className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="center" className="w-64 p-3">
                                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Next reminder range</p>
                                <div className="space-y-2">
                                  <div>
                                    <p className="mb-1 text-xs text-muted-foreground">From</p>
                                    <Input
                                      type="date"
                                      value={nextReminderStartDate}
                                      onChange={(event) => setNextReminderStartDate(event.target.value)}
                                      className="h-8"
                                    />
                                  </div>
                                  <div>
                                    <p className="mb-1 text-xs text-muted-foreground">To</p>
                                    <Input
                                      type="date"
                                      value={nextReminderEndDate}
                                      onChange={(event) => setNextReminderEndDate(event.target.value)}
                                      className="h-8"
                                    />
                                  </div>
                                </div>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableHead>
                        <TableHead className="sticky top-0 z-40 bg-muted px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <SortHeader
                              label="Last reminder"
                              active={sortBy === "last"}
                              direction={sortDirection}
                              onClick={() => onSortChange("last")}
                            />
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground" aria-label="Filter last reminder column">
                                  <Filter className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="center" className="w-64 p-3">
                                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Last reminder range</p>
                                <div className="space-y-2">
                                  <div>
                                    <p className="mb-1 text-xs text-muted-foreground">From</p>
                                    <Input
                                      type="date"
                                      value={lastReminderStartDate}
                                      onChange={(event) => setLastReminderStartDate(event.target.value)}
                                      className="h-8"
                                    />
                                  </div>
                                  <div>
                                    <p className="mb-1 text-xs text-muted-foreground">To</p>
                                    <Input
                                      type="date"
                                      value={lastReminderEndDate}
                                      onChange={(event) => setLastReminderEndDate(event.target.value)}
                                      className="h-8"
                                    />
                                  </div>
                                </div>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableHead>
                        <TableHead className="sticky top-0 z-40 bg-muted px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <SortHeader
                              label="Status"
                              active={sortBy === "status"}
                              direction={sortDirection}
                              onClick={() => onSortChange("status")}
                            />
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground" aria-label="Filter status column">
                                  <Filter className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="center" className="w-56 p-3">
                                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
                                <div className="space-y-2">
                                  {[
                                    { label: "Follow-up due", value: "due" as const },
                                    { label: "Scheduled", value: "upcoming" as const },
                                    { label: "Not scheduled", value: "disabled" as const },
                                  ].map((item) => (
                                    <label key={item.value} className="flex cursor-pointer items-center gap-2 text-sm">
                                      <Checkbox
                                        checked={statusFilters.includes(item.value)}
                                        onCheckedChange={() => toggleStatusFilter(item.value)}
                                      />
                                      <span>{item.label}</span>
                                    </label>
                                  ))}
                                </div>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableHead>
                        <TableHead className="sticky top-0 z-40 bg-muted px-4 py-4 text-center">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedRows.map((row) => {
                          const isPending = pending[row.application.id]
                          const appliedDate = getDateOrNull(row.application.application_date)
                          const appliedLabel = appliedDate ? format(appliedDate, "MMM d, yyyy") : "Date unavailable"
                          const nextReminderLabel = row.enabled && row.nextReminder
                            ? row.status === "due"
                              ? `Due ${formatDistanceToNow(row.nextReminder, { addSuffix: true })}`
                              : format(row.nextReminder, "MMM d, yyyy")
                            : "Not scheduled"
                          const lastReminderLabel = row.lastSent ? format(row.lastSent, "MMM d, yyyy") : "Never"
                        return (
                          <TableRow
                            key={row.application.id}
                            className={`align-top [&>td]:py-5 transition-colors `}
                          >
                            <TableCell className="px-4 text-center">
                              <div className="flex flex-col items-center space-y-1">
                                <TruncatedText
                                  text={row.application.company_name ?? ""}
                                  className="font-medium leading-tight"
                                  maxWidthClass="max-w-[10rem] xl:max-w-[12rem]"
                                />
                                <TruncatedText
                                  text={row.application.position_title ?? ""}
                                  className="text-sm text-muted-foreground leading-tight"
                                  maxWidthClass="max-w-[10rem] xl:max-w-[12rem]"
                                />
                              </div>
                            </TableCell>
                            <TableCell className="px-4 text-center text-sm">{appliedLabel}</TableCell>
                            <TableCell className="px-4 text-center text-sm">{nextReminderLabel}</TableCell>
                            <TableCell className="px-4 text-center text-sm">{lastReminderLabel}</TableCell>
                            <TableCell className="px-4 text-center">
                              <Badge variant="outline" className={getStatusBadgeTone(row.status)}>
                                {row.status === "due"
                                  ? "Follow-up due"
                                  : row.status === "upcoming"
                                    ? "Scheduled"
                                    : "Not scheduled"}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-4 align-top">
                              <div className="flex flex-row items-center justify-center gap-2">
                                <FollowUpDraftDialog
                                  application={row.application}
                                  disabled={(!row.enabled && !row.lastSent) || isPending}
                                  hasGeneratedDraft={Boolean(
                                    row.application.ai_follow_up_draft_generated_at ||
                                      row.application.ai_follow_up_draft_text,
                                  )}
                                  onDraftUpdated={(update) => handleDraftUpdated(row.application.id, update)}
                                  triggerClassName="w-auto"
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openReminderDialog(row, { isEnabling: !row.enabled })}
                                  disabled={isPending}
                                  className="w-auto"
                                >
                                  Set reminder
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </table>
                  </ScrollArea>
                </div>
              </div>
            )}
          </section>

          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              <p>There was a problem loading your applications. Please refresh and try again.</p>
            </div>
          )}
        </div>
      </main>

      <Dialog
        open={Boolean(reminderDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setReminderDialog(null)
          }
        }}
      >
        <DialogContent className="flex flex-col gap-4 sm:max-w-[420px]" showCloseButton={false}>
          <DialogHeader className="sr-only">
            <DialogTitle>Set follow-up reminder</DialogTitle>
          </DialogHeader>

          <div className="relative flex flex-1 items-center justify-center">
            <Calendar
              mode="single"
              selected={reminderDialog?.date ?? undefined}
              defaultMonth={reminderDialog?.date ?? undefined}
              onSelect={(date) => {
                setReminderDialog((previous) => (previous ? { ...previous, date: date ?? previous.date } : previous))
              }}
              className="w-full max-w-[360px] rounded-md border p-4"
            />
            
          </div>
          <DialogFooter className="mx-auto flex w-full max-w-[360px] flex-col gap-2">
            {!reminderDialog?.isEnabling && (
              <Button
                variant="outline"
                size="icon"
                className="border-destructive text-destructive hover:border-destructive/80 hover:bg-destructive/10"
                onClick={disableReminder}
                disabled={reminderDialog ? pending[reminderDialog.application.id] : false}
                aria-label="Clear reminder"
              >
                <RotateCcw className="size-4" aria-hidden />
              </Button>
            )}

            <div className="flex w-full items-center gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setReminderDialog(null)}
                disabled={reminderDialog ? pending[reminderDialog.application.id] : false}
              >
                Close
              </Button>

              <Button
                className="flex-1"
                onClick={() => {
                  if (!reminderDialog) return
                  const selectedDate = reminderDialog.date
                  const normalizedSelectedDate =
                    selectedDate
                      ? new Date(
                          selectedDate.getFullYear(),
                          selectedDate.getMonth(),
                          selectedDate.getDate(),
                          0,
                          0,
                          0,
                          0,
                        )
                      : null

                  if (!normalizedSelectedDate || Number.isNaN(normalizedSelectedDate.getTime())) {
                    toast({
                      title: "Select a date",
                      description: "Pick when you’d like to be reminded.",
                      variant: "destructive",
                    })
                    return
                  }

                  const today = new Date()
                  today.setHours(0, 0, 0, 0)

                  if (normalizedSelectedDate < today) {
                    toast({
                      title: "Choose a future date",
                      description: "Reminders can’t be scheduled in the past",
                      variant: "destructive",
                    })
                    return
                  }

                  if (normalizedSelectedDate.getTime() === today.getTime()) {
                    toast({
                      title: "Choose a future date",
                      description: "Reminders can’t be scheduled for the same day",
                      variant: "destructive",
                    })
                    return
                  }

                  const iso = dateToLocalISOString(normalizedSelectedDate)
                  if (!iso) {
                    toast({
                      title: "Select a date",
                      description: "Pick when you’d like to be reminded",
                      variant: "destructive",
                    })
                    return
                  }
                  void updateFollowUp(reminderDialog.application.id, true, iso)
                  setReminderDialog(null)
                }}
                disabled={reminderDialog ? pending[reminderDialog.application.id] : false}
              >
                Save reminder
              </Button>
            </div>
          </DialogFooter>


        </DialogContent>
      </Dialog>
    </div>
  )
}

function getStatusBadgeTone(status: FollowUpRow["status"]) {
  switch (status) {
    case "due":
      return "bg-destructive/10 text-destructive border-destructive/40"
    case "upcoming":
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/40"
    default:
      return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700"
  }
}
