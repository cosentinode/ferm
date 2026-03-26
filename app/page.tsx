"use client"
import dynamic from "next/dynamic"
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CalendarClock, Filter, LayoutPanelLeft, Plus, Search, Table2, X } from "lucide-react"

import { Header } from "@/components/header"
import { JobApplicationCard } from "@/components/job-application-card"
import { BulkActions } from "@/components/bulk-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ApplicationsDrawer } from "@/components/applications-drawer"
import { AddApplicationDialog } from "@/components/add-application-dialog"
import { JobScoreIndicator } from "@/components/job-score-indicator"
import { useJobApplications } from "@/lib/hooks/use-job-applications"
import { createSearchParamsWithFilters, parseJobApplicationFilters } from "@/lib/job-filters"
import type { CreateJobApplicationData, JobApplicationFilters, JobApplicationSort } from "@/lib/types/database"
import { useSettings } from "@/components/settings-provider"
import { ApplicationActionsMenu } from "@/components/application-actions-menu"
import { defaultViewOptions } from "@/lib/settings"
import { apiFetch } from "@/lib/fetcher"
import { cn } from "@/lib/utils"
import { getDateOrNull } from "@/lib/date"
import { formatStatusLabel, getStatusBadgeClass } from "@/lib/status"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TruncatedText } from "@/components/ui/truncate"

const ActivityTimeline = dynamic(() => import("@/components/activity-timeline").then((mod) => mod.ActivityTimeline), {
  ssr: false,
  loading: () => <div className="h-full rounded-xl border bg-muted/40" />,
})

const UpcomingReminders = dynamic(() => import("@/components/upcoming-reminders").then((mod) => mod.UpcomingReminders), {
  ssr: false,
  loading: () => <div className="h-full rounded-xl border bg-muted/40" />,
})

const serializeFilters = (filters: JobApplicationFilters) =>
  createSearchParamsWithFilters(new URLSearchParams(), filters).toString()

const FALLBACK_SORT: JobApplicationSort = { field: "created_at", direction: "desc" }
const sortPreferenceMap: Record<string, JobApplicationSort> = {
  recent: FALLBACK_SORT,
  upcoming: { field: "application_date", direction: "asc" },
  priority: { field: "priority", direction: "asc" },
}
const DEFAULT_DASHBOARD_LIMIT = 25

type DashboardView = (typeof defaultViewOptions)[number]["value"]

const isDashboardView = (value: string | null): value is DashboardView =>
  defaultViewOptions.some((option) => option.value === value)

const INTERACTIVE_ELEMENT_SELECTOR =
  "button, a, [role='button'], input, textarea, select, [data-prevent-selection-toggle='true']"

const countActiveFilters = (filters: JobApplicationFilters) => {
  let count = 0

  if (filters.search?.trim()) count++
  if (filters.company_name?.trim()) count++

  if (filters.status?.length) count+=filters.status.length
  if (filters.priority?.length) count+=filters.priority.length
  if (filters.employment_type?.length) count+=filters.employment_type.length

  if (filters.date_from || filters.date_to) count++

  return count
}

export default function Dashboard() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { settings } = useSettings()


  const preferredView = useMemo<DashboardView>(() => settings.defaultView as DashboardView, [settings.defaultView])

  const filtersFromParams = useMemo(() => parseJobApplicationFilters(searchParams), [searchParams])

  const preferredSort = useMemo<JobApplicationSort>(() => {
    return sortPreferenceMap[settings.defaultSort] ?? FALLBACK_SORT
  }, [settings.defaultSort])

  const viewFromParams = useMemo<DashboardView>(() => {
    const viewParam = searchParams.get("view")
    if (isDashboardView(viewParam)) {
      return viewParam
    }
    return preferredView
  }, [preferredView, searchParams])

  const sortFromParams = useMemo<JobApplicationSort>(() => {
    const fieldParam = searchParams.get("sort_field") as JobApplicationSort["field"] | null
    const directionParam = searchParams.get("sort_direction")
    const hasSortParams = Boolean(fieldParam) || Boolean(directionParam)

    if (hasSortParams) {
      const direction: JobApplicationSort["direction"] = directionParam === "asc" ? "asc" : "desc"

      return {
        field: fieldParam ?? preferredSort.field,
        direction,
      }
    }

    return preferredSort
  }, [preferredSort, searchParams])

  const [filters, setFilters] = useState<JobApplicationFilters>(filtersFromParams)
  const [sort, setSort] = useState<JobApplicationSort>(sortFromParams)
  const [selectedApplications, setSelectedApplications] = useState<string[]>([])
  const [isApplicationsDrawerOpen, setIsApplicationsDrawerOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState(filters.search ?? "")
  const [view, setView] = useState<DashboardView>(viewFromParams)
  const [resultsLimit, setResultsLimit] = useState(DEFAULT_DASHBOARD_LIMIT)
  const filtersSignature = useMemo(() => serializeFilters(filters), [filters])
  const activeFilterCount = useMemo(
  () => countActiveFilters(filters),
  [filters]
)
  useEffect(() => {
    setFilters((previous) => {
      if (serializeFilters(previous) === serializeFilters(filtersFromParams)) {
        return previous
      }
      return filtersFromParams
    })
  }, [filtersFromParams])

  useEffect(() => {
    setView((previous) => (previous === viewFromParams ? previous : viewFromParams))
  }, [viewFromParams])

  useEffect(() => {
    setSort((previous) => {
      if (previous.field === sortFromParams.field && previous.direction === sortFromParams.direction) {
        return previous
      }
      return sortFromParams
    })
  }, [sortFromParams])

  const buildDashboardHref = useCallback(
    (next?: {
      filters?: JobApplicationFilters
      sort?: JobApplicationSort
      view?: DashboardView
    }) => {
      const nextFilters = next?.filters ?? filters
      const nextSort = next?.sort ?? sort
      const nextView = next?.view ?? view

      const params = createSearchParamsWithFilters(searchParams, nextFilters)

      params.delete("sort_field")
      params.delete("sort_direction")
      params.delete("view")

      const isSortFieldDefault = nextSort.field === preferredSort.field
      const isSortDirectionDefault = nextSort.direction === preferredSort.direction
      const isViewDefault = nextView === preferredView

      if (!isSortFieldDefault) {
        params.set("sort_field", nextSort.field)
      }
      if (!isSortDirectionDefault || !isSortFieldDefault) {
        params.set("sort_direction", nextSort.direction)
      }
      if (!isViewDefault) {
        params.set("view", nextView)
      }

      const query = params.toString()
      return query ? `${pathname}?${query}` : pathname
    },
    [filters, pathname, preferredSort, preferredView, searchParams, sort, view],
  )

  const commitState = useCallback(
    (next?: {
      filters?: JobApplicationFilters
      sort?: JobApplicationSort
      view?: DashboardView
    }) => {
      const href = buildDashboardHref(next)
      router.replace(href, { scroll: false })
    },
    [buildDashboardHref, router],
  )

  const { applications, isLoading, error, mutate, count } = useJobApplications({
    page: 1,
    limit: resultsLimit,
    filters,
    sort,
    include_interviews: true,
  })

  useEffect(() => {
    if (!isLoading && count > 0 && resultsLimit < count) {
      setResultsLimit(count)
    }
  }, [count, isLoading, resultsLimit])

  useEffect(() => {
    setResultsLimit(DEFAULT_DASHBOARD_LIMIT)
  }, [filtersSignature, sort.direction, sort.field])

  const timelineDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    [],
  )

  const relativeDayFormatter = useMemo(() => new Intl.RelativeTimeFormat("en", { numeric: "auto" }), [])

  const formatDaysSinceApplied = useCallback(
    (dateString: string) => {
      const appliedDate = getDateOrNull(dateString)
      if (!appliedDate) {
        return "Date unavailable"
      }
      const now = new Date()
      const millisecondsInDay = 1000 * 60 * 60 * 24
      const diff = Math.round((appliedDate.getTime() - now.getTime()) / millisecondsInDay)

      if (diff === 0) {
        return "Today"
      }

      return relativeDayFormatter.format(diff, "day")
    },
    [relativeDayFormatter],
  )

  const formatApplicationDate = useCallback(
    (dateString: string) => {
      const parsed = getDateOrNull(dateString)
      if (!parsed) {
        return "Date unavailable"
      }
      return timelineDateFormatter.format(parsed)
    },
    [timelineDateFormatter],
  )

  useEffect(() => {
    setSearchTerm(filters.search ?? "")
  }, [filters.search])

  const handleFilterChange = (newFilters: JobApplicationFilters) => {
    setFilters(newFilters)
    setResultsLimit(DEFAULT_DASHBOARD_LIMIT)
    commitState({ filters: newFilters })
  }

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    setSearchTerm(value)

    const trimmed = value.trim()
    const normalized = trimmed.length > 0 ? trimmed : undefined

    if (normalized === filters.search) {
      return
    }

    handleFilterChange({
      ...filters,
      search: normalized,
    })
  }

  const clearSearch = () => {
    if (!filters.search) {
      setSearchTerm("")
      return
    }

    setSearchTerm("")
    handleFilterChange({
      ...filters,
      search: undefined,
    })
  }

  const handleSortChange = useCallback(
    (nextSort: JobApplicationSort) => {
      if (nextSort.field === sort.field && nextSort.direction === sort.direction) {
        return
      }

      setSort(nextSort)
      setResultsLimit(DEFAULT_DASHBOARD_LIMIT)
      commitState({ sort: nextSort })
    },
    [commitState, sort.direction, sort.field],
  )

  const handleViewChange = (nextView: DashboardView) => {
    if (nextView === view) {
      return
    }

    setView(nextView)
    setSelectedApplications([])
    commitState({ view: nextView })
  }

  const handleAddApplication = async (application: CreateJobApplicationData) => {
    try {
      const response = await apiFetch("/api/job-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(application),
      })

      if (!response.ok) {
        throw new Error("Failed to add application")
      }

      handleApplicationUpdate()
    } catch (error) {
      console.error("Failed to add application:", error)
    }
  }

  const handleApplicationUpdate = () => {
    mutate() // Refresh data after updates
  }

  const handleSelectApplication = (id: string, selected: boolean) => {
    setSelectedApplications((previous) => {
      if (selected) {
        if (previous.includes(id)) {
          return previous
        }

        return [...previous, id]
      }

      return previous.filter((appId) => appId !== id)
    })
  }

  const handleBulkStatusUpdate = async (status: string) => {
    try {
      const response = await apiFetch("/api/job-applications/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedApplications,
          updates: { status },
        }),
      })

      if (response.ok) {
        setSelectedApplications([])
        mutate()
      }
    } catch (error) {
      console.error("Failed to bulk update applications:", error)
    }
  }

  const handleBulkDelete = async () => {
    try {
      const response = await apiFetch("/api/job-applications/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedApplications,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to bulk delete applications")
      }

      setSelectedApplications([])
      mutate()
    } catch (error) {
      console.error("Failed to bulk delete applications:", error)
      throw error
    }
  }

  const handleStatusChange = async (applicationId: string, status: string, note?: string) => {
    try {
      const response = await apiFetch(`/api/job-applications/${applicationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          ...(note && { notes: note }),
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to update application status")
      }

      mutate()
    } catch (error) {
      console.error("Failed to update application status:", error)
    }
  }

  if (error) {
    return (
      <div className="h-screen bg-background">
        <Header />
        <main className="pt-24 p-6">
          <div className="w-full">
            <div className="text-center py-12">
              <p className="text-destructive">Error loading applications. Please try again.</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="adaptive-scroll-layout flex h-screen flex-col bg-background overflow-hidden">
      <Header />
      <main className="flex-1 overflow-hidden px-6 pt-24">
        <div className="adaptive-scroll-content flex h-full w-full flex-col space-y-6 overflow-hidden">
          <div className="grid h-full grid-cols-1 gap-6 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="flex flex-col gap-6 overflow-hidden">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <UpcomingReminders />
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-4">
                <ActivityTimeline />
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-6 overflow-hidden lg:col-span-1">
              <div className="flex min-h-0 flex-1 flex-col gap-4 pb-4">
                  <Tabs
                    value={view}
                    onValueChange={(next) => {
                      if (isDashboardView(next)) {
                        handleViewChange(next)
                      }
                    }}
                    className="flex min-h-0 flex-1 flex-col gap-4"
                  >
               <div className="flex flex-wrap items-center gap-3">
  {/* Tabs */}
  <TabsList className="shrink-0 whitespace-nowrap overflow-x-auto">
    <TabsTrigger value="full" className="gap-2" href={buildDashboardHref({ view: "full" })}>
      <LayoutPanelLeft className="h-4 w-4" />
      Full
    </TabsTrigger>
    <TabsTrigger value="table" className="gap-2" href={buildDashboardHref({ view: "table" })}>
      <Table2 className="h-4 w-4" />
      Table
    </TabsTrigger>
    <TabsTrigger value="condensed" className="gap-2" href={buildDashboardHref({ view: "condensed" })}>
      <CalendarClock className="h-4 w-4" />
      Condensed
    </TabsTrigger>
  </TabsList>
  {/* Search bar (flexes) */}
  <div className="relative min-w-[240px] flex-1">
    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    <Input
      value={searchTerm}
      onChange={handleSearchChange}
      placeholder="Search applications..."
      className="w-full pl-9 pr-9"
    />
    {searchTerm ? (
      <button
        type="button"
        onClick={clearSearch}
        className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Clear search</span>
      </button>
    ) : null}
  </div>
  {/* Add application button */}
  <AddApplicationDialog
    onAdd={handleAddApplication}
    trigger={
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 shrink-0"
      >
        <Plus className="h-4 w-4" />
        Add application
      </Button>
    }
  />



  {/* Open Library button */}
  <div className=" shrink-0">
<Button
  type="button"
  variant="ghost"
  size="sm"
  className="gap-2"
  onClick={() => setIsApplicationsDrawerOpen(true)}
>
  <Filter className="h-4 w-4" />
  Filters
  {activeFilterCount > 0 && (
    <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium">
      {activeFilterCount}
    </span>
  )}
</Button>
  </div>
</div>



                    <TabsContent value="full" className="flex min-h-0 flex-1 flex-col gap-4">
                      <BulkActions
                        selectedCount={selectedApplications.length}
                        onBulkStatusUpdate={handleBulkStatusUpdate}
                        onBulkDelete={handleBulkDelete}
                        onClearSelection={() => setSelectedApplications([])}
                      />

                      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card/40">
                        <ScrollArea className="flex-1">
                          <div className="space-y-4 p-4">
                            {isLoading ? (
                              <div className="grid gap-4">
                                {[...Array(3)].map((_, i) => (
                                  <div key={i} className="h-48 rounded-lg bg-muted animate-pulse" />
                                ))}
                              </div>
                            ) : applications.length === 0 ? (
                              <div className="py-12 text-center">
                                <p className="text-muted-foreground">
                                  No applications found. Add your first application to get started!
                                </p>
                              </div>
                            ) : (
                              applications.map((application) => (
                                <JobApplicationCard
                                  key={application.id}
                                  application={application}
                                  isSelected={selectedApplications.includes(application.id)}
                                  onSelect={(selected) => handleSelectApplication(application.id, selected)}
                                  onUpdate={handleApplicationUpdate}
                                />
                              ))
                            )}
                          </div>
                        </ScrollArea>
                      </div>
                    </TabsContent>

                    <TabsContent value="table" className="flex min-h-0 flex-1 flex-col gap-4">
                      <BulkActions
                        selectedCount={selectedApplications.length}
                        onBulkStatusUpdate={handleBulkStatusUpdate}
                        onBulkDelete={handleBulkDelete}
                        onClearSelection={() => setSelectedApplications([])}
                      />

                      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card/40">
                        <ScrollArea className="flex-1">
                          <div className="min-w-full p-4">
                            {isLoading ? (
                              <div className="space-y-2">
                                {[...Array(4)].map((_, index) => (
                                  <div key={index} className="h-12 rounded-md border bg-muted animate-pulse" />
                                ))}
                              </div>
                            ) : applications.length === 0 ? (
                              <div className="py-12 text-center">
                                <p className="text-muted-foreground">
                                  No applications found. Adjust your filters or add a new application.
                                </p>
                              </div>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="min-w-[40rem]">Role</TableHead>
                                    <TableHead className="w-[120px] text-center">Status</TableHead>
                                    <TableHead className="w-[150px] text-center">Match score</TableHead>
                                    <TableHead className="w-[150px] text-center">Employment type</TableHead>
                                    <TableHead className="w-[170px] text-center">Salary</TableHead>
                                    <TableHead className="hidden lg:table-cell w-[190px] text-center">Location</TableHead>
                                    <TableHead className="w-[130px] text-center">Applied</TableHead>
                                    <TableHead className="w-[72px] text-right">Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {applications.map((application) => {
                                    const isSelected = selectedApplications.includes(application.id)
                                    return (
                                      <TableRow
                                        key={application.id}
                                        data-state={isSelected ? "selected" : undefined}
                                        className={cn(
                                          "cursor-pointer transition-colors hover:bg-accent/50",
                                          isSelected && "bg-muted",
                                        )}
                                        onClick={(event) => {
                                          if (event.defaultPrevented) return

                                          const target = event.target as HTMLElement
                                          if (target.closest(INTERACTIVE_ELEMENT_SELECTOR)) {
                                            return
                                          }

                                          handleSelectApplication(application.id, !isSelected)
                                        }}
                                      >
                                        <TableCell className="w-[50%] max-w-[40rem]">
                                          <div className="min-w-0 space-y-1">
                                            <TruncatedText
                                              text={application.position_title}
                                              className="text-sm font-medium leading-tight"
                                              maxWidthClass="max-w-full"
                                            />
                                            <TruncatedText
                                              text={application.company_name}
                                              className="text-xs text-muted-foreground"
                                              maxWidthClass="max-w-full"
                                            />
                                          </div>
                                        </TableCell>
                                        <TableCell className="w-[190px] align-middle text-center">
                                          <div className="flex justify-center">
                                            <Badge variant="outline" className={getStatusBadgeClass(application.status)}>
                                              {formatStatusLabel(application.status)}
                                            </Badge>
                                          </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                          <div className="flex justify-center">
                                            <JobScoreIndicator
                                              score={application.resume_match_score ?? null}
                                              createdAt={application.created_at}
                                              size={48}
                                              showDescription={false}
                                            />
                                          </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                          <span className="text-sm">{application.employment_type ?? "—"}</span>
                                        </TableCell>
                                        <TableCell className="text-center">
                                          {application.salary_range ? (
                                            <TruncatedText
                                              as="span"
                                              text={application.salary_range}
                                              className="inline-block text-sm"
                                              maxWidthClass="max-w-[10rem]"
                                            />
                                          ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                          )}
                                        </TableCell>
                                        <TableCell className="hidden w-[190px] max-w-[14rem] text-center lg:table-cell">
                                          {application.location ? (
                                            <div className="flex justify-center">
                                              <TruncatedText
                                                as="span"
                                                text={application.location}
                                                className="block text-sm"
                                                maxWidthClass="max-w-full"
                                              />
                                            </div>
                                          ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-center">
                                          <div className="flex flex-col items-center">
                                            <span className="text-sm font-medium">
                                              {formatApplicationDate(application.application_date)}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                              {formatDaysSinceApplied(application.application_date)}
                                            </span>
                                          </div>
                                        </TableCell>
                                        <TableCell className="w-[72px] text-right">
                                          <div className="flex justify-end">
                                            <ApplicationActionsMenu
                                              application={application}
                                              onStatusUpdate={(status, note) =>
                                                handleStatusChange(application.id, status, note)
                                              }
                                              onApplicationUpdate={handleApplicationUpdate}
                                            />
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    )
                                  })}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        </ScrollArea>
                      </div>
                    </TabsContent>

                    <TabsContent value="condensed" className="flex min-h-0 flex-1 flex-col gap-6">
                      <BulkActions
                        selectedCount={selectedApplications.length}
                        onBulkStatusUpdate={handleBulkStatusUpdate}
                        onBulkDelete={handleBulkDelete}
                        onClearSelection={() => setSelectedApplications([])}
                      />

                      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card/40">
                        <ScrollArea className="flex-1">
                          <div className="relative w-full space-y-6 p-6">
                            {isLoading ? (
                              <div className="space-y-4">
                                {[...Array(4)].map((_, index) => (
                                  <div key={index} className="h-20 rounded-md border bg-muted animate-pulse" />
                                ))}
                              </div>
                            ) : applications.length === 0 ? (
                              <div className="py-12 text-center">
                                <p className="text-muted-foreground">
                                  No applications to display yet. Apply to a role to start your timeline.
                                </p>
                              </div>
                            ) : (
                              <>
                                {applications.map((application) => {
                                  const isSelected = selectedApplications.includes(application.id)

                                  return (
                                    <div key={application.id}>
                                      <div
                                        className={cn(
                                          "flex flex-col gap-2 rounded-lg border bg-card/50 p-4 transition-colors hover:bg-accent/50",
                                          isSelected && "border-primary/40 bg-muted",
                                        )}
                                        onClick={(event) => {
                                          if (event.defaultPrevented) return

                                          const target = event.target as HTMLElement
                                          if (target.closest(INTERACTIVE_ELEMENT_SELECTOR)) {
                                            return
                                          }

                                          handleSelectApplication(application.id, !isSelected)
                                        }}
                                      >
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                          <div className="min-w-0">
                                            <TruncatedText
                                              text={application.position_title}
                                              className="font-medium leading-tight"
                                              maxWidthClass="max-w-[40rem]"
                                            />
                                            <TruncatedText
                                              text={application.company_name}
                                              className="text-sm text-muted-foreground"
                                              maxWidthClass="max-w-[40rem]"
                                            />
                                          </div>

                                          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-3">
                                            <JobScoreIndicator
                                              score={application.resume_match_score ?? null}
                                              createdAt={application.created_at}
                                              size={48}
                                              showDescription={false}
                                            />
                                            <ApplicationActionsMenu
                                              application={application}
                                              onStatusUpdate={(status, note) =>
                                                handleStatusChange(application.id, status, note)
                                              }
                                              onApplicationUpdate={handleApplicationUpdate}
                                            />
                                          </div>
                                        </div>
                                        {application.notes && (
                                          <TruncatedText
                                            text={application.notes}
                                            className="break-words max-w-[35rem] text-sm text-muted-foreground"
                                            clampClassName="line-clamp-2"
                                            maxWidthClass="max-w-full"
                                          />
                                        )}
                                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
                                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                            <span>Applied {formatApplicationDate(application.application_date)}</span>
                                            <span>•</span>
                                            <span>{formatDaysSinceApplied(application.application_date)}</span>
                                            {application.location && (
                                              <>
                                                <span>•</span>
                                                <TruncatedText
                                                  as="span"
                                                  text={application.location}
                                                  className="inline-block"
                                                  maxWidthClass="max-w-[14rem]"
                                                />
                                              </>
                                            )}
                                          </div>
                                          <Badge
                                            variant="outline"
                                            className={cn("shrink-0", getStatusBadgeClass(application.status))}
                                          >
                                            {formatStatusLabel(application.status)}
                                          </Badge>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </>
                            )}
                          </div>
                        </ScrollArea>
                      </div>
                    </TabsContent>
                  </Tabs>

              </div>
            </div>
          </div>
        </div>
      </main>

      <ApplicationsDrawer
        open={isApplicationsDrawerOpen}
        onOpenChange={setIsApplicationsDrawerOpen}
        filters={filters}
        sort={sort}
        onFiltersChange={handleFilterChange}
        onSortChange={handleSortChange}
      />
    </div>
  )
}
