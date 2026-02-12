import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "About – ferm",
  description:
    "Learn more about ferm, the mission, and what is being building for job seekers.",
}

export const dynamic = "force-static"
export const revalidate = 60 * 60 * 24

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-3xl px-6 py-24">
        <header className="mb-12 space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight">About</h1>
          <p className="text-base text-zinc-400">
            ferm is built to help job seekers stay simple and consistent, through and through.
          </p>
        </header>

        <section className="space-y-6">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-xl font-semibold text-white">The mission</h2>
            <p className="mt-3 text-zinc-300">
              I am creating a clean, thoughtful workspace that makes it easier to track applications, prepare for
              interviews, and move forward with clarity. I also want to gain experience building real things, and it might as well be for something that can help so many people in the process! 
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-xl font-semibold text-white">Who it&apos;s for</h2>
            <p className="mt-3 text-zinc-300">
              ferm is designed for modern job seekers want a premium job tracking experience without any noise that they don't need. This platform is not made to shove AI slop features down your throat, I wanted to make sure that if I used a non-deterministic tool and resource, that it will perform consistently well and provide usage beyond capable of any other determnistic solution. 
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-xl font-semibold text-white">Values</h2>
            <p className="mt-3 text-zinc-300">
              If you know me at all, (or don't), you could probably guess my favorite motto just by looking at my personal LinkedIn / dev practices or even reading the text contents on the landing page / here.  Every feature is designed
              to help you stay in control of your search, with privacy and simplicity being the 2 most important values for anything dev related.
            </p>
          </div>

    <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-xl font-semibold text-white">Thank you</h2>
            <p className="mt-3 text-zinc-300">
              For even reading this far, or taking part in using my platform and contributing to help me become a better developer or even just using my platform in general, you ALL are appreciated. To know that my work can help at least 1 person achieve something life-changing makes this entire thing well worth it for both of us.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-xl font-semibold text-white">Contact</h2>
            <p className="mt-3 text-zinc-300">
              If you&apos;d like to learn more or share feedback, email me at{" "}
              <a href="mailto:adrian@ferm.dev" className="text-zinc-100 underline decoration-zinc-500 hover:text-white">
                adrian@ferm.dev
              </a>
              .
            </p>
            <p className="mt-4 text-sm text-zinc-500">
              For tos details, review our{" "}
              <Link href="/terms" className="text-zinc-300 underline decoration-zinc-600 hover:text-white">
                terms of service
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
