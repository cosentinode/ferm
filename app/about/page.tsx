import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "About – Ferm",
  description:
    "Learn more about Ferm, our mission, and what we are building for job seekers.",
}

export const dynamic = "force-static"
export const revalidate = 60 * 60 * 24

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-3xl px-6 py-24">
        <header className="mb-12 space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight">About Ferm</h1>
          <p className="text-base text-zinc-400">
            Ferm is built to help job seekers stay focused, organized, and confident throughout their search.
          </p>
        </header>

        <section className="space-y-6">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-xl font-semibold text-white">Our mission</h2>
            <p className="mt-3 text-zinc-300">
              We&apos;re creating a clean, thoughtful workspace that makes it easier to track applications, prepare for
              interviews, and move forward with clarity.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-xl font-semibold text-white">Who it&apos;s for</h2>
            <p className="mt-3 text-zinc-300">
              Ferm is designed for modern job seekers who want a premium experience without noise, distractions, or
              unnecessary complexity.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-xl font-semibold text-white">What we value</h2>
            <p className="mt-3 text-zinc-300">
              We focus on simplicity, privacy, and practical tools that genuinely save time. Every feature is designed
              to help you stay in control of your search.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-xl font-semibold text-white">Contact</h2>
            <p className="mt-3 text-zinc-300">
              If you&apos;d like to learn more or share feedback, email us at{" "}
              <a href="mailto:adrian@ferm.dev" className="text-zinc-100 underline decoration-zinc-500 hover:text-white">
                adrian@ferm.dev
              </a>
              .
            </p>
            <p className="mt-4 text-sm text-zinc-500">
              For policy details, review our{" "}
              <Link href="/privacy" className="text-zinc-300 underline decoration-zinc-600 hover:text-white">
                privacy policy
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
