"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useMemo, useState } from "react"
import { useSWRConfig } from "swr"
import Image from "next/image"
import {
  LayoutDashboard,
  Mail,
  BarChart3,
  LogOut,
  UserRound,
  FileText,
  Settings,
  CalendarClock,
  MessageCircle,
  Laptop,
  Moon,
  SunMedium,
  Menu,
} from "lucide-react"
import { IconButton } from "@/components/ui/icon-button"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { useSupabase } from "@/components/supabase-provider"
import { SettingsDialog } from "@/components/settings-dialog"
import { ContactDialog } from "@/components/contact-dialog"
import { useSettings } from "@/components/settings-provider"
import { themeOptions, type ThemePreference } from "@/lib/settings"

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Follow-ups", href: "/follow-ups", icon: Mail },
  { label: "Interviews", href: "/interviews", icon: CalendarClock },
  { label: "Prep", href: "/prep", icon: MessageCircle },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Resume", href: "/resume", icon: FileText },
] as const

const themeIconMap: Record<ThemePreference, typeof SunMedium> = {
  system: Laptop,
  light: SunMedium,
  dark: Moon,
}

export function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const { mutate } = useSWRConfig()
  const { supabase, user, isLoading: isAuthLoading } = useSupabase()
  const { settings, updateSetting } = useSettings()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isContactOpen, setIsContactOpen] = useState(false)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const userAvatar = useMemo(() => {
    const metadata = user?.user_metadata as { picture?: string; avatar_url?: string } | undefined
    return metadata?.picture ?? metadata?.avatar_url ?? null
  }, [user])
  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    await mutate(
      (key) => typeof key === "string" && key.startsWith("/api/job-applications"),
      undefined,
      { revalidate: false },
    )
    router.replace("/landing")
    router.refresh()
  }, [mutate, router, supabase])
  return (
    <header className="fixed top-4 left-0 right-0 z-50">
      <div className="max-w-[83rem] mx-auto px-3 sm:px-6">
        <div className="border border-border bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 rounded-xl shadow-lg">
          <div className="grid h-12 sm:h-14 grid-cols-[auto_1fr_auto] items-center px-3 sm:px-6">
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <IconButton
                  asChild
                  variant="subtle"
                  size="icon"
                  className="text-primary group hover:bg-transparent"
                  aria-label="Back to dashboard"
                >
                  <Link href="/">
                    <Image
                      src="/logo_cropped.png"
                      alt="ferm.dev logo"
                      width={24}
                      height={24}
                      className="h-9 w-5 sm:h-6 sm:w-6 transition-transform duration-700 ease-out group-hover:rotate-[360deg]"
                      priority
                    />
                  </Link>
                </IconButton>
                {/* <Link
                  href="/"
                  className="text-xl font-semibold text-balance hover:text-primary transition-colors"
                >
                  ferm.dev
                </Link> */}
              </div>
            </div>
            <nav className="hidden md:flex items-center justify-center gap-6 text-sm">
              {NAV_ITEMS.map((item) => {
                const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "transition-colors",
                      isActive ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
            <div className="flex items-center justify-end gap-2 sm:gap-3">
              <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
                <SheetTrigger asChild>
                  <IconButton
                    size="icon"
                    variant="ghost"
                    className="md:hidden"
                    aria-label="Open navigation menu"
                  >
                    <Menu className="h-5 w-5" />
                  </IconButton>
                </SheetTrigger>
                <SheetContent side="right" className="w-[16rem] p-0">
                  <SheetHeader className="border-b p-4">
                    <SheetTitle>Navigation</SheetTitle>
                  </SheetHeader>
                  <nav className="flex flex-col gap-1 p-2" aria-label="Mobile navigation">
                    {NAV_ITEMS.map((item) => {
                      const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
                      return (
                        <SheetClose asChild key={item.href}>
                          <Link
                            href={item.href}
                            className={cn(
                              "rounded-md px-3 py-2 text-sm transition-colors",
                              isActive
                                ? "bg-muted text-foreground font-medium"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                            )}
                            aria-current={isActive ? "page" : undefined}
                          >
                            {item.label}
                          </Link>
                        </SheetClose>
                      )
                    })}
                  </nav>
                </SheetContent>
              </Sheet>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton
                    size="icon"
                    className="rounded-full hover:bg-muted transition-shadow "
                    disabled={isAuthLoading}
                  >
                    <Avatar className="h-7 w-7">
                      {userAvatar ? (
                        <AvatarImage src={userAvatar} alt={user?.email ?? "Account avatar"} />
                      ) : null}
                      <AvatarFallback>
                        <UserRound className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-fit min-w-[7rem]">
                  <div className="flex items-center gap-1 p-1 w-fit">
                    {themeOptions.map((option) => {
                      const Icon = themeIconMap[option.value]
                      const isActive = settings.theme === option.value
                      return (
                        <Button
                          key={option.value}
                          type="button"
                          variant={isActive ? "secondary" : "ghost"}
                          size="icon"
                          className={cn("h-8 w-8", isActive && "text-foreground")}
                          onClick={() => updateSetting("theme", option.value)}
                          aria-pressed={isActive}
                          aria-label={`Use ${option.label.toLowerCase()} theme`}
                        >
                          <Icon className="h-4 w-4" />
                        </Button>
                      )
                    })}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      setIsContactOpen(true)
                    }}
                    className="gap-2"
                  >
                    <Mail className="h-4 w-4" />
                    Contact
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      setIsSettingsOpen(true)
                    }}
                    className="gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault()
                      void handleSignOut()
                    }}
                    className="gap-2 data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive data-[highlighted]:[&_svg]:!text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <ContactDialog open={isContactOpen} onOpenChange={setIsContactOpen} userEmail={user?.email ?? null} />
              <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
