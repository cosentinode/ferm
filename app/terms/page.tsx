import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Terms of Service – Ferm",
  description:
    "Read the terms that govern your use of Ferm.",
}

export const dynamic = "force-static"
export const revalidate = 60 * 60 * 24

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-3xl px-6 py-24">
        <header className="mb-12 space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight">Terms of Service</h1>
          <p className="text-base text-zinc-400">
            These terms outline the rules and expectations for using Ferm.
          </p>
        </header>

        <section className="space-y-6">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-xl font-semibold text-white">Use of the service</h2>
            <p className="mt-3 text-zinc-300">
              By using Ferm, you agree to use the platform responsibly and in compliance with applicable laws. You are
              responsible for the accuracy of the information you provide in your account.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-xl font-semibold text-white">Accounts</h2>
            <p className="mt-3 text-zinc-300">
              You are responsible for maintaining the security of your account and for all activity that occurs under
              your login credentials.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-xl font-semibold text-white">Availability and updates</h2>
            <p className="mt-3 text-zinc-300">
              We may modify, improve, or discontinue features over time to improve reliability and user experience.
              We aim to provide a stable service but cannot guarantee uninterrupted availability.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-xl font-semibold text-white">Limitation of liability</h2>
            <p className="mt-3 text-zinc-300">
              Ferm is provided on an &quot;as is&quot; basis. To the fullest extent permitted by law, Ferm is not liable for
              indirect, incidental, or consequential damages resulting from your use of the platform.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-xl font-semibold text-white">Contact</h2>
            <p className="mt-3 text-zinc-300">
              If you have questions about these terms, contact us at{" "}
              <a href="mailto:adrian@ferm.dev" className="text-zinc-100 underline decoration-zinc-500 hover:text-white">
                adrian@ferm.dev
              </a>
              .
            </p>
            <p className="mt-4 text-sm text-zinc-500">
              To understand how we handle data, review our{" "}
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
