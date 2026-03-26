"use client"

import { useMemo } from "react"
import { BellRing } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TruncatedText } from "@/components/ui/truncate"

import { useApplicationFollowUps } from "@/lib/hooks/use-application-follow-ups"
import { useJobApplications } from "@/lib/hooks/use-job-applications"
import type { ApplicationFollowUp } from "@/lib/types/database"
import { cn } from "@/lib/utils"
import { getDateOrNull } from "@/lib/date"

function computeNextReminder(followUp: ApplicationFollowUp): Date | null {
  if (!followUp.enabled) {
    return null
  }

  return getDateOrNull(followUp.next_follow_up_date ?? null)
}

type ReminderStatus = "overdue" | "soon" | "scheduled"

type ReminderTheme = {
  card: string
  label: string
  time: string
}

const reminderThemes: Record<ReminderStatus, ReminderTheme> = {
  overdue: {
    card:
      "text-destructive/80 shadow-none  dark:text-destructive/70",
    label: "text-destructive dark:text-destructive/80",
    time: "text-destructive dark:text-destructive/80",
  },
  soon: {
    card:
      "  text-amber-800/80 shadow-none  dark:text-amber-200/80",
    label: "text-amber-800 dark:text-amber-200",
    time: "text-amber-800 dark:text-amber-200",
  },
  scheduled: {
    card:
      " text-emerald-800/80 shadow-none  dark:text-emerald-200/80",
    label: "text-emerald-800 dark:text-emerald-200",
    time: "text-emerald-800 dark:text-emerald-200",
  },
}

export function UpcomingReminders() {
  const { followUps, isLoading: isLoadingFollowUps, error } = useApplicationFollowUps()
  const {
    applications,
    isLoading: isLoadingApplications,
    error: applicationsError,
  } = useJobApplications({ limit: 200 })

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }),
    [],
  )

  const isLoading = isLoadingFollowUps || isLoadingApplications
  const loadError = error || applicationsError

  const reminders = useMemo(() => {
    const applicationMap = new Map(applications.map((application) => [application.id, application]))
    const now = Date.now()

    return followUps
      .map((followUp) => {
        const application = applicationMap.get(followUp.job_application_id)
        if (!application) {
          return null
        }

        const nextReminder = computeNextReminder(followUp)
        if (!nextReminder) {
          return null
        }

        const difference = nextReminder.getTime() - now
        const dayMs = 1000 * 60 * 60 * 24
        const remainingDays = difference / dayMs
        let status: ReminderStatus = "scheduled"
        if (difference < 0) {
          status = "overdue"
        } else if (difference <= 1000 * 60 * 60 * 48) {
          status = "soon"
        }

        let countdownLabel: string
        if (difference < 0) {
          const overdueDays = Math.max(1, Math.ceil(Math.abs(remainingDays)))
          countdownLabel =
            overdueDays === 1 ? "Overdue by 1 day" : `Overdue by ${overdueDays} days`
        } else if (difference <= dayMs) {
          countdownLabel = "in <24hrs"
        } else {
          const daysLeft = Math.ceil(remainingDays)
          countdownLabel =
            daysLeft === 1 ? "in 1 day" : `in ${daysLeft} days`
        }

        return {
          id: followUp.id,
          application,
          nextReminder,
          status,
          countdownLabel,
        }
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .sort((left, right) => left.nextReminder.getTime() - right.nextReminder.getTime())
  }, [applications, followUps])

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="shrink-0">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-muted-foreground" />
            Upcoming Reminders
          </span>

        </CardTitle>

      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="space-y-4">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, index) => (
                  <div key={index} className="rounded-lg border bg-muted/20 p-4">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-40" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                  </div>
                ))}
              </div>
            ) : loadError ? (
              <p className="text-sm text-destructive">Error loading reminders</p>
            ) : reminders.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/10 p-6 text-center text-sm text-muted-foreground">
                No reminders scheduled yet.
              </div>
            ) : (
              <div className="space-y-3">
                {reminders.map((reminder) => {
                  const theme = reminderThemes[reminder.status]
                  return (
                    <div
                      key={reminder.id}
                      className={cn(
                        "rounded-lg border bg-card/70 p-4 transition-colors",
                        theme.card,
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <TruncatedText
                            text={reminder.application.company_name}
                            className="text-sm font-medium text-card-foreground"
                            maxWidthClass="max-w-[12rem]"
                          />
                          <TruncatedText
                            text={reminder.application.position_title}
                            className="text-xs text-muted-foreground"
                            maxWidthClass="max-w-[12rem]"
                          />
                        </div>
                    
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                        <div className="flex items-center gap-2">
                          <span className={cn("whitespace-nowrap", theme.time)}>
                            {dateFormatter.format(reminder.nextReminder)} at {"9:00 AM EST"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
