"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Header } from "@/components/header"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { ResponsiveContainer, Sankey, Tooltip as RechartsTooltip } from "recharts"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toPng } from "html-to-image"
import { getStatusChartColor, parseStatus } from "@/lib/status"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ArrowLeft, ArrowRight } from "lucide-react"
import  {TruncatedText} from "@/components/ui/truncate"
import { useJobApplications } from "@/lib/hooks/use-job-applications"
import { cn } from "@/lib/utils"

const SANKEY_BASE_NODE = "Applications Submitted"
const SANKEY_BASE_COLOR = "#0EA5E9"
const ACTIVITY_LEVEL_CLASSES = [
  "bg-muted/60",
  "bg-sky-200/70",
  "bg-sky-300/80",
  "bg-sky-400/80",
  "bg-sky-500",
]
type SankeyNodeWithCount = {
  name: string
  color: string
  count: number
}

type SankeyLink = {
  source: number
  target: number
  value: number
}

const CustomSankeyNode = ({ x, y, width, height, payload }: {
  x: number
  y: number
  width: number
  height: number
  payload: SankeyNodeWithCount
}) => {
  const labelY = y + height / 2
  const isBaseNode = payload.name === SANKEY_BASE_NODE
  const labelX = isBaseNode ? x + width + 12 : x - 12
  const textAnchor = isBaseNode ? "start" : "end"

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={3}
        ry={3}
        fill={payload.color}
        stroke="hsl(var(--background))"
        strokeWidth={1}
      />
      <text
        x={labelX}
        y={labelY}
        textAnchor={textAnchor}
        alignmentBaseline="middle"
        style={{
          fontSize: "30px",
          fontWeight: 800,
          fill: "var(--foreground)",
          opacity: 1,
          paintOrder: "stroke",
          stroke: "(var(--background) / 0.75)",
          strokeWidth: 3,
          strokeLinejoin: "round",
        }}
      >
        {payload.count}
      </text>
    </g>
  )
}

export default function AnalyticsPage() {
  const sankeyContainerRef = useRef<HTMLDivElement>(null)
  const sankeyLegendRef = useRef<HTMLDivElement>(null)
  const { applications, isLoading: appsLoading } = useJobApplications({ limit: 200, include_status_history: true })
  const [selectedDay, setSelectedDay] = useState<{
    date: string
    applications: (typeof applications)[number][]
  } | null>(null)
  const [canScrollLegendLeft, setCanScrollLegendLeft] = useState(false)
  const [canScrollLegendRight, setCanScrollLegendRight] = useState(false)
  const sankeyData = useMemo(() => {
    const baseNode = SANKEY_BASE_NODE
    const baseColor = SANKEY_BASE_COLOR
    const links = new Map<string, number>()
    const nodes = new Map<string, { color: string; count: number; order: number }>([
      [baseNode, { color: baseColor, count: 0, order: -100 }],
    ])

    const registerLink = (source: string, target: string) => {
      const key = `${source}=>${target}`
      links.set(key, (links.get(key) ?? 0) + 1)
    }

    const incrementNode = (label: string, color: string, order: number) => {
      const existing = nodes.get(label)

      if (existing) {
        nodes.set(label, {
          color: existing.color,
          count: existing.count + 1,
          order: Math.min(existing.order, order),
        })
      } else {
        nodes.set(label, { color, count: 1, order })
      }
    }

    applications.forEach((application) => {
      const historyStatuses = (application.status_history ?? []).map((entry) => parseStatus(entry.status).value)
      const latestStatus = parseStatus(application.status).value
      const baseSequence = historyStatuses.length > 0 ? historyStatuses : [latestStatus]
      const dedupedSequence = baseSequence.filter((status, index, array) => index === 0 || status !== array[index - 1])
      const statusSequence =
        dedupedSequence[dedupedSequence.length - 1] === latestStatus
          ? dedupedSequence
          : [...dedupedSequence, latestStatus]

      const metadataSequence = statusSequence.map((status) => parseStatus(status))
      const pathMetadata = [
        { label: baseNode, color: baseColor, order: -100 },
        ...metadataSequence.map((meta) => ({ label: meta.label, color: meta.chartColor, order: meta.order })),
      ]

      pathMetadata.forEach(({ label, color, order }) => incrementNode(label, color, order))

      for (let index = 0; index < pathMetadata.length - 1; index += 1) {
        const source = pathMetadata[index].label
        const target = pathMetadata[index + 1].label
        registerLink(source, target)
      }
    })

    const orderedNodes: SankeyNodeWithCount[] = Array.from(nodes.entries())
      .sort((left, right) => {
        if (left[1].order === right[1].order) {
          return left[0].localeCompare(right[0])
        }

        return left[1].order - right[1].order
      })
      .map(([name, info]) => ({
        name,
        color: info.color,
        count: info.count,
      }))

    const orderedNodeIndex = Object.fromEntries(orderedNodes.map((node, index) => [node.name, index]))

    const orderedLinks: SankeyLink[] = Array.from(links.entries()).flatMap(([key, value]) => {
      const [source, target] = key.split("=>")
      const sourceIndex = orderedNodeIndex[source]
      const targetIndex = orderedNodeIndex[target]

      if (sourceIndex === undefined || targetIndex === undefined) {
        return []
      }

      return {
        source: sourceIndex,
        target: targetIndex,
        value,
      }
    })

    return {
      nodes: orderedNodes,
      links: orderedLinks,
    }
  }, [applications])

  const sankeyHeight = useMemo(() => {
    if (!sankeyData.nodes.length) return 340

    const baseNode = sankeyData.nodes.find((node) => node.name === SANKEY_BASE_NODE)
    const largestNode = sankeyData.nodes.reduce(
      (max, node) => (node.count > max ? node.count : max),
      baseNode?.count ?? 0,
    )

    const totalFlow = baseNode?.count ?? largestNode
    const minHeight = 340
    const maxHeight = 340
    const pixelsPerApplication = 33.9

    return Math.max(minHeight, Math.min(maxHeight, totalFlow * pixelsPerApplication))
  }, [sankeyData.nodes])

  const handleExportSankey = async () => {
    if (!sankeyContainerRef.current) return

    const appliedFontElements = new Map<Element, string>()
    let exportWrapper: HTMLDivElement | null = null

    try {
      const fallbackFontFamily = "var(--font-sans), system-ui, sans-serif"
      const resolvedFontFamily = (() => {
        const container = sankeyContainerRef.current
        if (!container) return fallbackFontFamily

        const computedFontFamily = getComputedStyle(container).fontFamily
        console.debug("[sankey export] computed font family", computedFontFamily)
        if (computedFontFamily) {
          return computedFontFamily
        }

        for (const sheet of Array.from(document.styleSheets)) {
          let rules: CSSRuleList | undefined

          try {
            rules = sheet.cssRules
          } catch {
            continue
          }

          if (!rules) continue

          for (const rule of Array.from(rules)) {
            if (!("style" in rule) || !("selectorText" in rule)) continue

            const fontValue = rule.style.getPropertyValue("font-family")
            if (!fontValue) continue

            const selectors = String(rule.selectorText)
              .split(",")
              .map((selector) => selector.trim())
              .filter(Boolean)

            if (selectors.some((selector) => container.matches(selector))) {
              const trimmedFontValue = fontValue.trim()
              if (trimmedFontValue) {
                console.debug("[sankey export] matched font family rule", {
                  selectorText: rule.selectorText,
                  fontFamily: trimmedFontValue,
                })
                return trimmedFontValue
              }
            }
          }
        }

        return fallbackFontFamily
      })()
      console.debug("[sankey export] resolved font family", resolvedFontFamily)

      const exportRoot = sankeyContainerRef.current
      exportWrapper = document.createElement("div")
      exportWrapper.style.position = "fixed"
      exportWrapper.style.left = "-9999px"
      exportWrapper.style.top = "0"
      exportWrapper.style.pointerEvents = "none"
      exportWrapper.style.opacity = "0"
      exportWrapper.style.zIndex = "-1"

      const localClonedRoot = exportRoot.cloneNode(true) as HTMLElement
      exportWrapper.appendChild(localClonedRoot)
      document.body.appendChild(exportWrapper)

      const clonedLegend = localClonedRoot.querySelector("[data-sankey-legend]")
      if (clonedLegend instanceof HTMLElement) {
        clonedLegend.classList.remove("overflow-x-auto")
        clonedLegend.style.overflowX = "visible"
        clonedLegend.style.width = `${clonedLegend.scrollWidth}px`
      }

      const exportWidth = localClonedRoot.scrollWidth
      const exportHeight = localClonedRoot.scrollHeight
      localClonedRoot.style.width = `${exportWidth}px`
      localClonedRoot.style.height = `${exportHeight}px`

      const exportElements = [localClonedRoot, ...Array.from(localClonedRoot.querySelectorAll("*"))]
      exportElements.forEach((element) => {
        if (element instanceof HTMLElement || element instanceof SVGElement) {
          appliedFontElements.set(element, element.style.fontFamily)
          element.style.fontFamily = resolvedFontFamily
        } else {
          appliedFontElements.set(element, "")
        }
      })
      console.debug("[sankey export] applied font family to elements", exportElements.length)

      const backgroundColor = getComputedStyle(document.body).backgroundColor || "#0f1729"
      console.debug("[sankey export] background color", backgroundColor)
      const dataUrl = await toPng(localClonedRoot, {
        cacheBust: true,
        backgroundColor,
        skipFonts: true,
        width: exportWidth,
        height: exportHeight,
        style: {
          fontFamily: resolvedFontFamily,
        },
      })

      const link = document.createElement("a")
      link.href = dataUrl
      link.download = "job-search-journey.png"
      link.click()
    } catch (error) {
      console.error("Failed to export Sankey chart", error)
    } finally {
      appliedFontElements.forEach((previousFontFamily, element) => {
        if (element instanceof HTMLElement || element instanceof SVGElement) {
          element.style.fontFamily = previousFontFamily
        }
      })
      if (exportWrapper) {
        exportWrapper.remove()
      }
    }
  }

  const applicationActivity = useMemo(() => {
    if (!applications.length) {
      return {
        weeks: [] as { date: string; count: number; level: number; applications: (typeof applications)[number][] }[][],
        maxDailyCount: 0,
      }
    }

    const countsByDate = new Map<string, { count: number; applications: (typeof applications)[number][] }>()

    applications.forEach((application) => {
      const createdAt = application.created_at ?? application.application_date
      if (!createdAt) return
      const timestamp = new Date(createdAt)
      if (Number.isNaN(timestamp.getTime())) return
      const dayKey = timestamp.toISOString().split("T")[0]
      const existing = countsByDate.get(dayKey) ?? { count: 0, applications: [] }
      countsByDate.set(dayKey, {
        count: existing.count + 1,
        applications: [...existing.applications, application],
      })
    })

    if (countsByDate.size === 0) {
      return {
        weeks: [] as { date: string; count: number; level: number; applications: (typeof applications)[number][] }[][],
        maxDailyCount: 0,
      }
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = new Date(today)
    start.setDate(start.getDate() - 364)
    while (start.getDay() !== 0) {
      start.setDate(start.getDate() - 1)
    }

    const end = new Date(today)
    while (end.getDay() !== 6) {
      end.setDate(end.getDate() + 1)
    }

    const days: { date: string; count: number; applications: (typeof applications)[number][] }[] = []
    const cursor = new Date(start)
    while (cursor <= end) {
      const dateKey = cursor.toISOString().split("T")[0]
      const activity = countsByDate.get(dateKey)
      days.push({ date: dateKey, count: activity?.count ?? 0, applications: activity?.applications ?? [] })
      cursor.setDate(cursor.getDate() + 1)
    }

    const maxDailyCount = days.reduce((max, day) => (day.count > max ? day.count : max), 0)
    const levelForCount = (count: number) => {
      if (count === 0 || maxDailyCount === 0) return 0
      const scaled = Math.ceil((count / maxDailyCount) * 4)
      return Math.min(4, Math.max(1, scaled))
    }

    const weeks: { date: string; count: number; level: number; applications: (typeof applications)[number][] }[][] = []
    days.forEach((day, index) => {
      const weekIndex = Math.floor(index / 7)
      if (!weeks[weekIndex]) {
        weeks[weekIndex] = []
      }
      weeks[weekIndex].push({ ...day, level: levelForCount(day.count) })
    })

    return { weeks, maxDailyCount }
  }, [applications])

  const monthLabels = useMemo(() => {
    return applicationActivity.weeks.map((week, index) => {
      const firstDay = week[0]
      if (!firstDay) return ""
      const date = new Date(firstDay.date)
      if (Number.isNaN(date.getTime())) return ""
      if (date.getDate() <= 7 || index === 0) {
        return date.toLocaleString(undefined, { month: "short" })
      }
      const previousWeek = applicationActivity.weeks[index - 1]
      const previousMonth = previousWeek ? new Date(previousWeek[0].date).getMonth() : null
      if (previousMonth !== date.getMonth()) {
        return date.toLocaleString(undefined, { month: "short" })
      }
      return ""
    })
  }, [applicationActivity.weeks])

  const hasActivityData = applicationActivity.weeks.some((week) => week.some((day) => day.count > 0))
  const activityGridColumns = {
    gridTemplateColumns: `repeat(${Math.max(applicationActivity.weeks.length, 1)}, minmax(0, 1fr))`,
  }

  const selectedDayLabel = useMemo(() => {
    if (!selectedDay?.date) return ""
    const date = new Date(selectedDay.date)
    if (Number.isNaN(date.getTime())) return selectedDay.date
    return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
  }, [selectedDay?.date])

  const legendItems = useMemo(
    () =>
      sankeyData.nodes
        .filter((node) => node.count > 0)
        .map((node) => ({
          name: node.name,
          color: node.name === SANKEY_BASE_NODE ? SANKEY_BASE_COLOR : getStatusChartColor(node.name) ?? node.color,
        })),
    [sankeyData.nodes],
  )

  useEffect(() => {
    const updateLegendScroll = () => {
      const container = sankeyLegendRef.current
      if (!container) return
      setCanScrollLegendLeft(container.scrollLeft > 0)
      setCanScrollLegendRight(container.scrollLeft + container.clientWidth < container.scrollWidth - 1)
    }

    const container = sankeyLegendRef.current
    if (!container) return

    updateLegendScroll()
    container.addEventListener("scroll", updateLegendScroll)
    window.addEventListener("resize", updateLegendScroll)

    return () => {
      container.removeEventListener("scroll", updateLegendScroll)
      window.removeEventListener("resize", updateLegendScroll)
    }
  }, [legendItems.length])

  const scrollLegend = (direction: "left" | "right") => {
    const container = sankeyLegendRef.current
    if (!container) return
    const offset = direction === "left" ? -container.clientWidth : container.clientWidth
    container.scrollBy({ left: offset, behavior: "smooth" })
  }


  return (
    <div className="adaptive-scroll-layout flex min-h-screen flex-col bg-background overflow-hidden">
      <Header />
      <main className="flex-1 overflow-hidden px-6 pt-24">
        <div className="adaptive-scroll-content flex h-full min-h-0 w-full flex-col gap-4 overflow-hidden">
          <section>
            <Card>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-muted-foreground">Job Hunt Journey</p>
                  <Button
                    onClick={handleExportSankey}
                    variant="outline"
                    size="sm"
                    disabled={appsLoading || sankeyData.links.length === 0}
                  >
                    Export PNG
                  </Button>
                </div>
                {appsLoading ? (
                  <div className="h-113.5 flex flex-col items-center justify-center gap-4 text-muted-foreground">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                ) : sankeyData.links.length > 0 ? (
                  <div ref={sankeyContainerRef} className="space-y-4">
                    <div style={{ height: `${sankeyHeight}px` }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <Sankey
                          data={sankeyData}
                          nodeWidth={20}
                          nodePadding={32}
                          linkCurvature={0.5}
                          iterations={64}
                          node={<CustomSankeyNode />}
                          link={{ strokeOpacity: 0.35 }}
                        >
                          <RechartsTooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null
                              const link = payload[0]?.payload
                              if (!link?.source?.name || !link?.target?.name) return null
                              return (
                                <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
                                  <p className="font-medium text-foreground">
                                    {link.source.name} → {link.target.name}
                                  </p>
                                  <p className="text-muted-foreground">{link.value} application{link.value === 1 ? "" : "s"}</p>
                                </div>
                              )
                            }}
                          />
                        </Sankey>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => scrollLegend("left")}
                        disabled={!canScrollLegendLeft}
                        aria-label="Scroll legend left"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div
                          ref={sankeyLegendRef}
                          data-sankey-legend
                          className="flex items-center gap-3 overflow-x-auto whitespace-nowrap"
                        >
                      {sankeyData.nodes
                        .filter((node) => node.count > 0)
                        .map((node) => (
                          <div
                            key={node.name}
                            className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5"
                          >
                            <span
                              className="h-3 w-3 rounded-sm"
                              style={{ backgroundColor: node.color }}
                            />
                            <span className="text-muted-foreground">{node.name}</span>
                          </div>
                        ))}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => scrollLegend("right")}
                        disabled={!canScrollLegendRight}
                        aria-label="Scroll legend right"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Not enough application data yet to chart your journey.
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <section>
            <Card>
              <CardContent>
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">Application Activity</p>
                </div>
                {appsLoading ? (
                  <div className="space-y-2 h-54">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-40 w-full" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                ) : applicationActivity.weeks.length ? (
                  <div className="space-y-4">
                    <ScrollArea orientation="horizontal">
                      <div className="space-y-2 min-w-[640px] pb-2">
                        <div className="flex items-start gap-3 pl-10">
                          <div className="w-10" aria-hidden />
                          <div className="flex-1">
                            <div
                              className="grid gap-1 text-[10px] text-muted-foreground"
                              style={activityGridColumns}
                            >
                              {monthLabels.map((label, index) => (
                                <span key={`month-${index}`} className="text-center">
                                  {label}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="flex w-10 flex-col justify-between py-2 text-[10px] text-muted-foreground">
                            <span>Mon</span>
                            <span>Wed</span>
                            <span>Fri</span>
                          </div>
                          <div className="flex-1">
                            <TooltipProvider delayDuration={100}>
                              <div className="grid gap-1" style={activityGridColumns}>
                                {applicationActivity.weeks.map((week, weekIndex) => (
                                  <div key={`week-${weekIndex}`} className="flex flex-col gap-1">
                                    {week.map((day, dayIndex) => {
                                      const formattedDate = new Date(day.date).toLocaleDateString(undefined, {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                      })
                                      const tooltipLabel = `${formattedDate}: ${day.count} application${day.count === 1 ? "" : "s"}`
                                      return (
                                        <Tooltip key={`day-${day.date}-${dayIndex}`}>
                                          <TooltipTrigger asChild>
                                            <button
                                              type="button"
                                              className={cn(
                                                "aspect-square w-full min-w-[12px] rounded-sm border border-background/30",
                                                ACTIVITY_LEVEL_CLASSES[day.level] ?? ACTIVITY_LEVEL_CLASSES[0],
                                              )}
                                              aria-label={tooltipLabel}
                                              onClick={() => setSelectedDay({ date: day.date, applications: day.applications })}
                                            ></button>
                                          </TooltipTrigger>
                                          <TooltipContent side="top" align="center" className="text-xs">
                                            <p className="font-medium">{formattedDate}</p>
                                            <p className="text-muted-foreground">
                                              {`${day.count} application${day.count === 1 ? "" : "s"}`}
                                            </p>
                                          </TooltipContent>
                                        </Tooltip>
                                      )
                                    })}
                                  </div>
                                ))}
                              </div>
                            </TooltipProvider>
                          </div>
                        </div>
                      </div>
                    </ScrollArea>
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span>Less</span>
                        <div className="flex items-center gap-1">
                          {ACTIVITY_LEVEL_CLASSES.map((levelClass, index) => (
                            <div
                              key={`legend-${index}`}
                              className={cn("h-3 w-3 rounded-sm border border-background/30", levelClass)}
                              aria-hidden
                            />
                          ))}
                        </div>
                        <span>More</span>
                      </div>
                      <p className="text-muted-foreground text-right">
                        {hasActivityData
                          ? `${applications.length} application${applications.length === 1 ? "" : "s"} added in the last 52 weeks`
                          : "No applications tracked in the past year yet."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Start logging applications to see your streak build up.</div>
                )}
              </CardContent>
            </Card>
          </section>

        </div>
      </main>
      <Dialog open={!!selectedDay} onOpenChange={(isOpen) => !isOpen && setSelectedDay(null)}>
        <DialogContent className="max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Applications on {selectedDayLabel}</DialogTitle>
          </DialogHeader>
          {selectedDay ? (
            selectedDay.applications.length ? (
              <ScrollArea className="max-h-[60vh] pr-4">
                <div className="space-y-3">
                  {selectedDay.applications.map((application) => {
                    const status = parseStatus(application.status)
                    return (
                      <div key={application.id} className="rounded-md border bg-muted/30 p-3">
                        <TruncatedText
  text={application.position_title}
  className="text-sm font-medium text-foreground"
/>
                        <TruncatedText text={application.company_name} className="text-sm text-muted-foreground"/>
                        <p className="mt-1 text-xs text-muted-foreground">Status: {status.label}</p>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-sm text-muted-foreground">No applications were logged on this day.</p>
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
