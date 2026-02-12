import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privacy Policy – Ferm",
  description:
    "Learn how Ferm handles authentication data, stores user information securely, and responds to privacy requests.",
}

export const dynamic = "force-static"
export const revalidate = 60 * 60 * 24

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-3xl px-6 py-24">
        <header className="mb-12 space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="text-base text-zinc-400">
            At ferm, we take your privacy seriously. This policy explains how we collect, use, and protect your
            information when you use our platform.
          </p>
        </header>

        <section className="space-y-6">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-xl font-semibold text-white">Authentication</h2>
            <p className="mt-3 text-zinc-300">
              ferm uses Google OAuth solely to authenticate users and obtain their basic profile information, including
              name and email address. We do not request access to your calendar, contacts, or any other Google data.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-xl font-semibold text-white">Data usage</h2>
            <p className="mt-3 text-zinc-300">
              We never share or sell your personal information to third parties. Your data is used exclusively to power
              features within the ferm application, such as syncing your job applications and saving workspace
              preferences.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-xl font-semibold text-white">Storage and security</h2>
            <p className="mt-3 text-zinc-300">
              User data is stored securely using Supabase. We apply access controls and monitoring to protect your
              workspace information against unauthorized access or disclosure.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-xl font-semibold text-white">Data retention and deletion</h2>
            <p className="mt-3 text-zinc-300">
              You can delete your account and associated data at any time.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-xl font-semibold text-white">Contact</h2>
            <p className="mt-3 text-zinc-300">
              If you have questions about this policy or how ferm handles your data, please contact us at
              {" "}
              <a href="mailto:adrian@ferm.dev" className="text-zinc-100 underline decoration-zinc-500 hover:text-white">
                adrian@ferm.dev
              </a>
              .
            </p>
            <p className="mt-4 text-sm text-zinc-500">
              For general product information, visit our {" "}
              <Link href="/landing" className="text-zinc-300 underline decoration-zinc-600 hover:text-white">
                landing page
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
