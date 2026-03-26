"use client"

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { FileText, Loader2, UploadCloud, ShieldAlert } from "lucide-react"

import { Header } from "@/components/header"
import { useSupabase } from "@/components/supabase-provider"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/use-toast"
import { apiFetch } from "@/lib/fetcher"
import type { SupabaseClient } from "@supabase/supabase-js"

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx"] as const
const RESUME_BUCKET = "resumes" as const
const PDF_PREVIEW_HEIGHT = "clamp(360px, calc(100vh - 100px), 702px)" as const

type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number]

interface ResumeInfo {
  name: string
  path: string
  signedUrl: string
  updatedAt?: string
  size?: number
}

async function getLatestResume(
  client: SupabaseClient,
  userId: string,
): Promise<ResumeInfo | null> {
  const {
    data: files,
    error: listError,
  } = await client.storage.from(RESUME_BUCKET).list(userId, {
    limit: 1,
    sortBy: { column: "updated_at", order: "desc" },
  })

  if (listError) {
    throw listError
  }

  const file = files?.[0]

  if (!file) {
    return null
  }

  const path = `${userId}/${file.name}`
  const { data: signedUrlData, error: signedUrlError } = await client.storage
    .from(RESUME_BUCKET)
    .createSignedUrl(path, 60 * 60)

  if (signedUrlError) {
    throw signedUrlError
  }

  if (!signedUrlData?.signedUrl) {
    throw new Error("Unable to generate a download link for your resume.")
  }

  return {
    name: file.name,
    path,
    signedUrl: signedUrlData.signedUrl,
    updatedAt: file.updated_at ?? file.created_at,
    size: typeof file.metadata?.size === "number" ? file.metadata.size : undefined,
  }
}

function formatFileSize(bytes?: number) {
  if (!bytes || Number.isNaN(bytes)) {
    return "Unknown size"
  }

  if (bytes < 1024) {
    return `${bytes} B`
  }

  const kb = bytes / 1024
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`
  }

  const mb = kb / 1024
  return `${mb.toFixed(2)} MB`
}

export default function ResumePage() {
  const { supabase, user, isLoading: isAuthLoading } = useSupabase()
  const [resume, setResume] = useState<ResumeInfo | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputId = useId()

  const acceptedTypesDescription = useMemo(
    () => `Accepted formats: ${ALLOWED_EXTENSIONS.map((ext) => ext.toUpperCase()).join(", ")} • Max size ${Math.round(MAX_FILE_SIZE / (1024 * 1024))} MB`,
    [],
  )

  const fetchResume = useCallback(async () => {
    if (!user) {
      setResume(null)
      return
    }

    setIsFetching(true)
    setErrorMessage(null)

    try {
      const latestResume = await getLatestResume(supabase, user.id)

      if (!latestResume) {
        setResume(null)
        return
      }

      setResume(latestResume)
    } catch (error) {
      console.error("Failed to fetch resume:", error)
      setResume(null)
      setErrorMessage("We couldn't load your resume. Please try again or upload a new file.")
    } finally {
      setIsFetching(false)
    }
  }, [supabase, user])

  useEffect(() => {
    if (!user) {
      if (!isAuthLoading) {
        setResume(null)
      }
      return
    }

    void fetchResume()
  }, [fetchResume, isAuthLoading, user])

  const promptForFile = useCallback(() => {
    const input = fileInputRef.current

    if (!input) {
      const message = "The file picker isn't ready yet. Please refresh and try again."
      setErrorMessage(message)
      toast({ title: "Upload unavailable", description: message, variant: "destructive" })
      return
    }

    if (!user) {
      toast({
        title: "Sign in required",
        description: "Log in to upload or replace your resume.",
        variant: "destructive",
      })
      return
    }

    if (isUploading) {
      toast({
        title: "Upload in progress",
        description: "Please wait for the current upload to finish.",
      })
      return
    }

    try {
      if (typeof input.showPicker === "function") {
        input.showPicker()
        return
      }
    } catch (error) {
      console.warn("Falling back to click() for file picker:", error)
    }

    input.click()
  }, [isUploading, user])

  const handleUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.target
      const file = input.files?.[0]

      input.value = ""

      if (!file) {
        return
      }

      if (!user) {
        const message = "You need to be signed in to upload a resume."
        setErrorMessage(message)
        toast({ title: "Upload unavailable", description: message, variant: "destructive" })
        return
      }

      const extension = file.name.split(".").pop()?.toLowerCase() ?? ""
      const isAllowedExtension = ALLOWED_EXTENSIONS.includes(extension as AllowedExtension)

      if (!isAllowedExtension) {
        const message = "Please upload a PDF, DOC, or DOCX file."
        setErrorMessage(message)
        toast({ title: "Invalid file type", description: message, variant: "destructive" })
        return
      }

      if (file.size > MAX_FILE_SIZE) {
        const message = "Your resume must be 5 MB or smaller."
        setErrorMessage(message)
        toast({ title: "File too large", description: message, variant: "destructive" })
        return
      }

      setIsUploading(true)
      setErrorMessage(null)

      try {
        const { data: existingFiles, error: listError } = await supabase.storage.from(RESUME_BUCKET).list(user.id)

        if (listError) {
          throw listError
        }

        if (existingFiles && existingFiles.length > 0) {
          const { error: removeError } = await supabase.storage
            .from(RESUME_BUCKET)
            .remove(existingFiles.map((item) => `${user.id}/${item.name}`))

          if (removeError) {
            throw removeError
          }
        }

        const sanitizedExtension = isAllowedExtension ? (extension as AllowedExtension) : "pdf"
        const path = `${user.id}/resume.${sanitizedExtension}`

        const { error: uploadError } = await supabase.storage
          .from(RESUME_BUCKET)
          .upload(path, file, {
            cacheControl: "3600",
            upsert: true,
            contentType: file.type || undefined,
          })

        if (uploadError) {
          throw uploadError
        }

        let syncErrorMessage: string | null = null

        try {
          const response = await apiFetch("/api/resume/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path }),
          })

          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as { error?: string } | null
            syncErrorMessage = payload?.error ?? `Unexpected error (status ${response.status})`
          }
        } catch (error) {
          syncErrorMessage =
            error instanceof Error ? error.message : "We couldn't store the parsed resume text. Please try again later."
        }

        await fetchResume()

        if (syncErrorMessage) {
          toast({
            title: "Resume text unavailable",
            description: syncErrorMessage,
            variant: "destructive",
          })
        } else {
          toast({ title: "Resume updated", description: "Your resume has been uploaded successfully." })
        }
      } catch (error) {
        console.error("Failed to upload resume:", error)
        const rawMessage =
          error instanceof Error && error.message
            ? error.message
            : "Something went wrong while uploading your resume. Please try again."
        const message = rawMessage.includes("row level security")
          ? "Upload blocked by storage security policies. Double-check the bucket policies in Supabase."
          : rawMessage
        setErrorMessage(message)
        toast({ title: "Upload failed", description: message, variant: "destructive" })
      } finally {
        setIsUploading(false)
      }
    },
    [fetchResume, supabase, user],
  )

  const handleRemove = useCallback(async () => {
    if (isRemoving) {
      return
    }

    if (!resume) {
      toast({ title: "Nothing to remove", description: "You don't have a resume uploaded yet." })
      setIsRemoveDialogOpen(false)
      return
    }

    if (!user) {
      const message = "You need to be signed in to remove your resume."
      setErrorMessage(message)
      toast({ title: "Removal unavailable", description: message, variant: "destructive" })
      setIsRemoveDialogOpen(false)
      return
    }

    setIsRemoving(true)
    setErrorMessage(null)

    try {
      const { error } = await supabase.storage.from(RESUME_BUCKET).remove([resume.path])

      if (error) {
        throw error
      }

      setResume(null)
      await fetchResume()

      let syncErrorMessage: string | null = null

      try {
        const response = await apiFetch("/api/resume/refresh", { method: "DELETE" })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          syncErrorMessage = payload?.error ?? `Unexpected error (status ${response.status})`
        }
      } catch (error) {
        syncErrorMessage =
          error instanceof Error ? error.message : "We couldn't remove the stored resume text. Please try again later."
      }

      toast({ title: "Resume removed", description: "Your resume has been deleted." })
      if (syncErrorMessage) {
        toast({
          title: "Resume text cleanup failed",
          description: syncErrorMessage,
          variant: "destructive",
        })
      }
      setIsRemoveDialogOpen(false)
    } catch (error) {
      console.error("Failed to remove resume:", error)
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Something went wrong while removing your resume. Please try again."
      setErrorMessage(message)
      toast({ title: "Removal failed", description: message, variant: "destructive" })
      throw error instanceof Error ? error : new Error(String(error))
    } finally {
      setIsRemoving(false)
    }
  }, [fetchResume, isRemoving, resume, supabase, user])

  return (
    <div className="adaptive-scroll-layout flex h-screen flex-col bg-background overflow-hidden">
      <Header />
      <main className="flex-1 overflow-hidden px-4 pt-24 sm:px-6">
        <div className="adaptive-scroll-content mx-auto flex h-full w-full flex-col">
          <div className="flex-1 space-y-8 pb-8">
            <Card>
              {!resume && (
                <CardHeader>
                  <CardTitle>Current resume</CardTitle>
                  <CardDescription>Upload a PDF, DOC, or DOCX file up to 5&nbsp;MB.</CardDescription>
                </CardHeader>
              )}
              <CardContent className="space-y-6">
                {errorMessage && (
                  <Alert variant="destructive">
                    <ShieldAlert className="h-4 w-4" />
                    <AlertTitle>Something isn&apos;t right</AlertTitle>
                    <AlertDescription>{errorMessage}</AlertDescription>
                  </Alert>
                )}

                {isAuthLoading || isFetching ? (
                  <div className="h-174.5 space-y-3">
                    <Skeleton className="h-90 w-full" />
                    <Skeleton className="h-45 w-full" />
                    <Skeleton className="h-35 w-full" />
                  </div>
                ) : !user ? (
                  <Alert>
                    <FileText className="h-4 w-4" />
                    <AlertTitle>Sign in to manage your resume</AlertTitle>
                    <AlertDescription>
                      <span className="block">Resume uploads require an authenticated account.</span>
                      <Link href="/landing" className="font-medium text-primary underline underline-offset-4">
                        Go to the sign-in page
                      </Link>
                    </AlertDescription>
                  </Alert>
                ) : resume ? (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium text-base">{resume.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {resume.updatedAt
                            ? `Last updated ${formatDistanceToNow(new Date(resume.updatedAt), { addSuffix: true })}`
                            : "Last updated information unavailable"}
                          {resume.size ? ` • ${formatFileSize(resume.size)}` : null}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button asChild variant="outline">
                          <a href={resume.signedUrl} target="_blank" rel="noopener noreferrer">
                            Download resume
                          </a>
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          className="gap-2"
                          onClick={() => setIsRemoveDialogOpen(true)}
                          disabled={isUploading || isRemoving}
                        >
                          {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          Remove resume
                        </Button>
                      </div>
                    </div>
                    
                    {resume.name.toLowerCase().endsWith(".pdf") ? (
                      <div className="overflow-hidden rounded-md border bg-muted/20">
                        <iframe
                          key={resume.signedUrl}
                          src={`${resume.signedUrl}#toolbar=0&navpanes=0`}
                          title="Resume preview"
                          className="w-full"
                          style={{ height: PDF_PREVIEW_HEIGHT }}
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground">Preview unavailable</p>
                        <p>
                          Resume previews are currently limited to PDF files. Download the file above to view or upload a PDF to
                          see it inline.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="font-medium">No resume uploaded yet</p>
                    <p className="text-sm text-muted-foreground">
                      Upload your resume to keep it handy for applications and interviews.
                    </p>
                  </div>
                )}
              </CardContent>
            <CardFooter className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground text-pretty">{acceptedTypesDescription}</p>
              <div className="flex items-center gap-3">
                <Input
                  ref={fileInputRef}
                  id={fileInputId}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="sr-only"
                  onChange={handleUpload}
                  disabled={isUploading || isRemoving}
                />
                <Button
                  type="button"
                  variant="default"
                  onClick={promptForFile}
                  disabled={isUploading || isRemoving}
                  className="gap-2"
                >
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                  {resume ? "Replace resume" : "Upload resume"}
                </Button>
              </div>
            </CardFooter>
            </Card>
          </div>
        </div>
      </main>
      <DeleteConfirmationDialog
        open={isRemoveDialogOpen}
        onOpenChange={setIsRemoveDialogOpen}
        title="Remove resume"
        description="Are you sure you want to delete your saved resume? You can upload a new file at any time."
        confirmLabel="Delete"
        onConfirm={handleRemove}
      />
    </div>
  )
}
