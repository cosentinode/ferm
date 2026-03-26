"use client"

import { Calendar, CheckCircle, Clock, History, MessageSquare, Plus } from "lucide-react"
import { useActivityLogInfinite } from "@/lib/hooks/use-activity-log-infinite"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ActivityDetailsDialog } from "@/components/activity-details-dialog"
import { TruncatedText } from "@/components/ui/truncate"
import type { ActivityLogWithApplication } from "@/lib/types/database"

const activityIcons = {
  application_created: Plus,
  status_change: Clock,
  notes_update: MessageSquare,
  interview_scheduled: Calendar,
  interview_completed: CheckCircle,
}

const activityColors = {
  application_created: "text-blue-500",
  status_change: "text-yellow-500",
  notes_update: "text-gray-500",
  interview_scheduled: "text-purple-500",
  interview_completed: "text-green-500",
}

export function ActivityTimeline() {
    const {
    activities,
    totalCount,
    isLoading,
    error,
    hasMore,
    isLoadingMore,
    loadMore,
  } = useActivityLogInfinite(undefined, 30)

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)

    if (Number.isNaN(date.getTime())) {
      return "Just now"
    }

    const now = new Date()
    let diffMs = now.getTime() - date.getTime()

    if (diffMs < 0) {
      diffMs = Math.abs(diffMs)
    }

    const diffInMinutes = Math.floor(diffMs / (1000 * 60))

    if (diffInMinutes < 1) return "Just now"
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`

    const diffInHours = Math.floor(diffInMinutes / 60)

    if (diffInHours < 24) return `${diffInHours}h ago`
    if (diffInHours < 48) return "Yesterday"
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  const renderActivityItem = (item: ActivityLogWithApplication) => {
    const Icon = activityIcons[item.action_type] || Clock
    const colorClass = activityColors[item.action_type] || "text-gray-500"
    const jobTitle = item.job_applications?.position_title ?? item.job_position_snapshot ?? undefined
    const companyName = item.job_applications?.company_name ?? item.job_company_snapshot ?? undefined
    const hasJobInfo = Boolean(jobTitle || companyName)
    const jobRemoved = !item.job_applications && hasJobInfo

    return (
      <ActivityDetailsDialog
        key={item.id}
        activity={item}
        trigger={
          <button
            type="button"
            className="flex w-full items-start gap-3 rounded-lg border border-border/60 bg-card/70 p-3 text-left transition hover:border-border hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className={`mt-1 ${colorClass}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-pretty text-sm text-muted-foreground">{item.description}</p>
              {hasJobInfo ? (
                <div className="space-y-0.5">
                  <TruncatedText
                    text={jobTitle ?? "Job title unavailable"}
                    className="text-xs font-medium text-foreground"
                    maxWidthClass="max-w-[12rem]"
                  />
                  {companyName ? (
                    <TruncatedText
                      text={companyName}
                      className="text-xs font-medium text-muted-foreground"
                      maxWidthClass="max-w-[12rem]"
                    />
                  ) : null}
                  {jobRemoved ? <p className="text-[11px] italic text-muted-foreground">Application removed</p> : null}
                </div>
              ) : (
                <p className="text-xs italic text-muted-foreground">Application removed</p>
              )}
              {item.new_value && item.old_value ? (
                <TruncatedText
                  text={`${item.old_value} -> ${item.new_value}`}
                  className="text-xs text-muted-foreground"
                  maxWidthClass="max-w-[12rem]"
                />
              ) : null}
              <p className="text-xs text-muted-foreground">{formatTimestamp(item.created_at)}</p>
            </div>
          </button>
        }
      />
    )
  }

   return (
    <Card className="flex h-full flex-col">
      <CardHeader className="shrink-0">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            Recent Activity
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          {isLoading ? (
            /* your skeleton */
            <div>Loading...</div>
          ) : error ? (
            <p className="text-sm text-destructive">Error loading activity</p>
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              <span>No recent activity</span>
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map((item) => renderActivityItem(item))}
            </div>
          )}

          {activities.length > 0 ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Showing {Math.min(activities.length, totalCount)} of {totalCount} updates
            </p>
          ) : null}

          {hasMore ? (
            <div className="mt-3">
              <button
                type="button"
                className="w-full rounded-md border bg-card px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
                onClick={loadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "Loading..." : "Load more"}
              </button>
            </div>
          ) : null}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
