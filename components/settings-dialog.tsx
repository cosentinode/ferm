"use client"

import type { ReactNode } from "react"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import { useSettings } from "@/components/settings-provider"
import { AiKeyPanel } from "@/components/settings/ai-key-panel"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useSupabase } from "@/components/supabase-provider"
import { Shield, Puzzle, Heart, Key } from "lucide-react"
import { apiFetch } from "@/lib/fetcher"

interface SettingsDialogProps {
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

type SettingsTabId = "login-security" | "chrome-extension" | "donations" | "api-key"

const settingsTabs: Array<{ id: SettingsTabId; label: string; icon: ReactNode }> = [
  {
    id: "login-security",
    label: "Security",
    icon: <Shield className="size-4" />,
  },
  {
    id: "chrome-extension",
    label: "Extension",
    icon: <Puzzle className="size-4" />,
  },
  {
    id: "donations",
    label: "Support",
    icon: <Heart className="size-4" />,
  },
  {
    id: "api-key",
    label: "API Key",
    icon: <Key className="size-4" />,
  },
]

const SidebarTabButton = ({
  label,
  icon,
  isActive,
  onClick,
}: {
  label: string
  icon: ReactNode
  isActive: boolean
  onClick: () => void
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  )
}

export function SettingsDialog({ trigger, open, onOpenChange }: SettingsDialogProps) {
  const { hasHydrated } = useSettings()
  const { supabase, session } = useSupabase()
  const router = useRouter()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<SettingsTabId>("login-security")
  const [isDeleting, setIsDeleting] = useState(false)
  const [aiKeyInput, setAiKeyInput] = useState("")
  const [hasStoredAiKey, setHasStoredAiKey] = useState(false)
  const [isSavingAiKey, setIsSavingAiKey] = useState(false)
  const [aiKeyError, setAiKeyError] = useState<string | null>(null)
  const isControlled = open !== undefined
  const dialogOpen = isControlled ? open : uncontrolledOpen
  const setDialogOpen = useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(nextOpen)
      }
      onOpenChange?.(nextOpen)
    },
    [isControlled, onOpenChange],
  )

  useEffect(() => {
    if (dialogOpen) {
      setActiveTab("login-security")
    }
  }, [dialogOpen])

  const loadStoredAiKey = useCallback(async () => {
    setAiKeyError(null)

    try {
      const response = await fetch("/api/ai-keys", {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({ error: "Unable to load your AI key." }))
        throw new Error(errorPayload.error || "Unable to load your AI key.")
      }

      const data = (await response.json()) as { hasKey?: boolean }
      setHasStoredAiKey(Boolean(data.hasKey))
      setAiKeyInput("")
    } catch (error) {
      setAiKeyError(error instanceof Error ? error.message : "Unable to load your AI key.")
      setHasStoredAiKey(false)
    }
  }, [session?.access_token])

  const saveAiKey = useCallback(async () => {
    const trimmed = aiKeyInput.trim()
    if (!trimmed) return
    setIsSavingAiKey(true)
    setAiKeyError(null)

    try {
      if (trimmed.length < 20 || !/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
        const message = "Please enter a valid OpenAI API key."
        setAiKeyError(message)
        toast({ title: "Invalid key", description: message, variant: "destructive" })
        return
      }

      const response = await apiFetch("/api/ai-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ apiKey: trimmed }),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({ error: "Unable to save your AI key." }))
        const message = errorPayload.error || "Unable to save your AI key."
        setAiKeyError(message)
        toast({ title: "Failed to save key", description: message, variant: "destructive" })
        return
      }

      setHasStoredAiKey(true)
      setAiKeyInput("")
      toast({ title: "Key saved", description: "Your OpenAI key is ready to use." })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save your AI key."
      setAiKeyError(message)
      toast({ title: "Failed to save key", description: message, variant: "destructive" })
    } finally {
      setIsSavingAiKey(false)
    }
  }, [aiKeyInput, session?.access_token])

  const clearAiKey = useCallback(() => {
    setIsSavingAiKey(true)
    setAiKeyError(null)

    void (async () => {
      try {
        const response = await apiFetch("/api/ai-keys", {
          method: "DELETE",
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        })

        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({ error: "Unable to clear your AI key." }))
          throw new Error(errorPayload.error || "Unable to clear your AI key.")
        }

        setHasStoredAiKey(false)
        setAiKeyInput("")
        toast({ title: "Key removed", description: "Your OpenAI key was removed from your account." })
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to clear your AI key."
        setAiKeyError(message)
        toast({ title: "Failed to clear key", description: message, variant: "destructive" })
      } finally {
        setIsSavingAiKey(false)
      }
    })()
  }, [session?.access_token])

  useEffect(() => {
    if (dialogOpen && activeTab === "api-key") {
      void loadStoredAiKey()
    }
  }, [activeTab, dialogOpen, loadStoredAiKey])

  const handleDeleteAccount = async () => {
    setIsDeleting(true)
    try {
      const response = await apiFetch("/api/account/delete", { method: "POST" })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        const errorMessage = payload?.error || "Failed to delete account. Please try again."
        throw new Error(errorMessage)
      }

      await supabase.auth.signOut()

      toast({
        title: "Account deleted",
        description: "Your account and associated data have been removed.",
      })
      router.replace("/landing")
      router.refresh()
    } catch (error) {
      console.error("Account deletion failed", error)
      const errorMessage = error instanceof Error ? error.message : "Unable to delete account. Please try again."
      toast({ title: "Deletion failed", description: errorMessage, variant: "destructive" })
    } finally {
      setIsDeleting(false)
    }
  }

  if (!hasHydrated) {
    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      </Dialog>
    )
  }

return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="gap-0 p-0 sm:max-w-2xl">
        <div className="flex flex-col sm:flex-row">
          {/* Sidebar */}
          <aside className="border-b border-border bg-muted/30 p-4 sm:w-44 sm:border-b-0 sm:border-r">
            <DialogHeader className="mb-4">
              <DialogTitle className="text-base">Settings</DialogTitle>
            </DialogHeader>
            <nav className="flex flex-row gap-1 sm:flex-col">
              {settingsTabs.map((tab) => (
                <SidebarTabButton
                  key={tab.id}
                  label={tab.label}
                  icon={tab.icon}
                  isActive={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                />
              ))}
            </nav>
          </aside>

          {/* Content */}
          <div className="flex-1 p-6">
            {activeTab === "login-security" && (
              <div className="space-y-3">
                <div className="">
                  <h3 className="font-medium">Account</h3>
                  
                </div>
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Delete account</p>
                      <p className="text-xs text-muted-foreground">
                        Permanently purge your account
                      </p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. Your account and all associated data will be permanently deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="gap-2 flex w-full">
                          <AlertDialogCancel className="flex-1">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => void handleDeleteAccount()}
                            className="bg-destructive text-destructive-foreground hover:bg-primary/90 flex-1"
                            disabled={isDeleting}
                            aria-busy={isDeleting}
                          >
                            {isDeleting ? "Deleting..." : "Delete account"}
                          </AlertDialogAction>
                        </div>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "chrome-extension" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <h3 className="font-medium">Chrome Extension</h3>
                 
                </div>
                <div className="rounded-lg border p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Get the extension</p>
                      <p className="text-xs text-muted-foreground">
                        Available for Chrome on desktop!
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <a
                        href="https://chromewebstore.google.com/detail/fermdev-job-loader/akgppdhffcfpeipmapfbgjcmdlkhkfpp"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Go, it&apos;s free!
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "donations" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <h3 className="font-medium">Support Me</h3>
                  
                </div>
                <div className="rounded-lg border bg-gradient-to-br from-pink-500/5 to-orange-500/5 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Buy me a coffee</p>
                      <p className="text-xs text-muted-foreground">
                        I truly appreciate every fermian
                      </p>
                    </div>
                    <Button asChild size="sm">
                      <a href="https://ko-fi.com/adriancosentino" target="_blank" rel="noreferrer">
                        <Heart className="mr-1.5 size-3.5" />
                        Donate
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "api-key" && (
              <div className="space-y-6">
              
                <AiKeyPanel
                  aiKeyInput={aiKeyInput}
                  onAiKeyInputChange={setAiKeyInput}
                  aiKeyError={aiKeyError}
                  onClearError={() => setAiKeyError(null)}
                  hasStoredAiKey={hasStoredAiKey}
                  isSavingAiKey={isSavingAiKey}
                  onSave={saveAiKey}
                  onClear={clearAiKey}
                />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
