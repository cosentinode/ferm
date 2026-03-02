"use client"

import { useCallback, useMemo, useState } from "react"
import { format, formatDistanceToNow } from "date-fns"
import { ArrowDownAZ, ArrowUpAZ, MoreHorizontal, Search, RotateCcw } from "lucide-react"
import { Header } from "@/components/header"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
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

type SortValue = "status" | "next" | "applied" | "company"
type SortDirection = "asc" | "desc"

const sortOptions: { label: string; value: SortValue }[] = [
  { label: "Status (due first)", value: "status" },
  { label: "Next reminder", value: "next" },
  { label: "Applied date", value: "applied" },
  { label: "Company name", value: "company" },
]

const sortDirectionDefaults: Record<SortValue, SortDirection> = {
  status: "asc",
  next: "asc",
  applied: "desc",
  company: "asc",
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
  const [sortBy, setSortBy] = useState<SortValue>("status")
  const [sortDirection, setSortDirection] = useState<SortDirection>(sortDirectionDefaults.status)
  const [searchQuery, setSearchQuery] = useState("")

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


  const sortedRows = useMemo(() => {
    const directionMultiplier = sortDirection === "asc" ? 1 : -1
    const getNextReminderValue = (row: FollowUpRow) =>
      row.nextReminder
        ? row.nextReminder.getTime()
        : sortDirection === "asc"
          ? Number.POSITIVE_INFINITY
          : Number.NEGATIVE_INFINITY

    const items = [...rows]
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
      case "company":
        return items.sort((a, b) => {
          const left = a.application.company_name ?? ""
          const right = b.application.company_name ?? ""
          return directionMultiplier * left.localeCompare(right)
        })
      default:
        return items
    }
  }, [rows, sortBy, sortDirection])

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return sortedRows
    }

    return sortedRows.filter((row) => {
      const values = [row.application.company_name, row.application.position_title]
      return values.some((value) => value?.toLowerCase().includes(query))
    })
  }, [searchQuery, sortedRows])

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

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      <Header />
      <main className="flex-1 overflow-hidden px-6 pb-4 pt-24">
        <div className="mx-auto flex h-full max-w-7xl flex-col space-y-8 overflow-hidden">
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <CardHeader className="gap-3">
              
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="relative w-full md:max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search by company or role..."
                      className="w-full pl-9"
                    />
                  </div>
                  <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center md:gap-3">
                    <ToggleGroup
                      type="single"
                      value={sortDirection}
                      onValueChange={(value) => {
                        if (value === "asc" || value === "desc") {
                          setSortDirection(value)
                        }
                      }}
                      variant="outline"
                      className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap md:w-auto"
                    >
                      <ToggleGroupItem
                        value="asc"
                        className="min-w-0 flex-1 items-center gap-1 px-2 sm:px-3 md:flex-none"
                        aria-label="Sort ascending"
                      >
                        <ArrowUpAZ className="h-4 w-4 shrink-0" />
                        <span className="truncate text-xs sm:text-sm">Ascending</span>
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="desc"
                        className="min-w-0 flex-1 items-center gap-1 px-2 sm:px-3 md:flex-none"
                        aria-label="Sort descending"
                      >
                        <ArrowDownAZ className="h-4 w-4 shrink-0" />
                        <span className="truncate text-xs sm:text-sm">Descending</span>
                      </ToggleGroupItem>
                    </ToggleGroup>
                    <Select
                      value={sortBy}
                      onValueChange={(value) => {
                        const sortValue = value as SortValue
                        setSortBy(sortValue)
                        setSortDirection(sortDirectionDefaults[sortValue])
                      }}
                    >
                      <SelectTrigger className="w-full md:w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {sortOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden">
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
                ) : filteredRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No follow-ups match your search.</p>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden">
                    <ScrollArea className="flex-1">
                      <div className="space-y-4 md:hidden">
                        {filteredRows.map((row) => {
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

                      <div className="relative hidden md:block">
                        <div className="overflow-x-auto rounded-md border px-3 pb-2 md:px-4 lg:px-6">
                          <Table className="table-auto min-w-[760px]">
                            <TableHeader>
                              <TableRow>
                                <TableHead className="min-w-[170px] py-4 md:min-w-[220px]">Application</TableHead>
                                <TableHead className="py-4">Applied</TableHead>
                                <TableHead className="py-4">Next reminder</TableHead>
                                <TableHead className="py-4">Last reminder</TableHead>
                                <TableHead className="py-4">Status</TableHead>
                                <TableHead className="py-4 min-w-[170px] md:min-w-[220px] text-left">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredRows.map((row) => {
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
                                    <TableCell className="max-w-[280px]">
                                      <div className="space-y-1">
                                        <TruncatedText
                                          text={row.application.company_name ?? ""}
                                          className="font-medium leading-tight"
                                          maxWidthClass="max-w-[13rem] lg:max-w-[15rem]"
                                        />
                                        <TruncatedText
                                          text={row.application.position_title ?? ""}
                                          className="text-sm text-muted-foreground leading-tight"
                                          maxWidthClass="max-w-[13rem] lg:max-w-[15rem]"
                                        />
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-sm">{appliedLabel}</TableCell>
                                    <TableCell className="text-sm">{nextReminderLabel}</TableCell>
                                    <TableCell className="text-sm">{lastReminderLabel}</TableCell>
                                    <TableCell>
                                      <Badge variant="outline" className={getStatusBadgeTone(row.status)}>
                                        {row.status === "due"
                                          ? "Follow-up due"
                                          : row.status === "upcoming"
                                            ? "Scheduled"
                                            : "Not scheduled"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="align-top [&>td]:py-5 transition-colors">
                                      <div className="flex flex-col items-start gap-2 lg:flex-row lg:flex-wrap lg:justify-start">
                                        <FollowUpDraftDialog
                                          application={row.application}
                                          disabled={(!row.enabled && !row.lastSent) || isPending}
                                          hasGeneratedDraft={Boolean(
                                            row.application.ai_follow_up_draft_generated_at ||
                                              row.application.ai_follow_up_draft_text,
                                          )}
                                          onDraftUpdated={(update) => handleDraftUpdated(row.application.id, update)}
                                          triggerClassName="w-full lg:w-[11rem]"
                                        />
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => openReminderDialog(row, { isEnabling: !row.enabled })}
                                          disabled={isPending}
                                          className="w-full lg:w-[11rem]"
                                        >
                                          Set reminder
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>
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
