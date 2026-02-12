// middleware.ts
import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

const PUBLIC_ROUTES = ["/landing", "/auth/callback", "/privacy", "/about", "/terms"]
const CSRF_COOKIE_NAME = "csrf-token"
const CSRF_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (/\.[a-z0-9]+$/i.test(pathname)) {
    return NextResponse.next()
  }
  // allow public routes straight through
  if (PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    return NextResponse.next()
  }

  // Create ONE response to mutate
  let res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return req.cookies.get(name)?.value
        },
        set(name, value, options) {
          res.cookies.set({ name, value, ...options })
        },
        remove(name, options) {
          res.cookies.set({ name, value: "", expires: new Date(0), ...options })
        },
      },
    }
  )

  // Touch session (may set/refresh cookies on `res`)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    if (req.cookies.get(CSRF_COOKIE_NAME)) {
      res.cookies.delete(CSRF_COOKIE_NAME)
    }
    // Build redirect and carry over cookies set on `res`
    const url = req.nextUrl.clone()
    url.pathname = "/landing"
    if (pathname !== "/") url.searchParams.set("redirectedFrom", pathname)

    const redirect = NextResponse.redirect(url)
    for (const c of res.cookies.getAll()) {
      redirect.cookies.set(c)
    }
    return redirect
  }

  if (!req.cookies.get(CSRF_COOKIE_NAME)) {
    res.cookies.set({
      name: CSRF_COOKIE_NAME,
      value: crypto.randomUUID(),
      httpOnly: false,
      sameSite: "lax",
      maxAge: CSRF_COOKIE_MAX_AGE_SECONDS,
      secure: process.env.NODE_ENV === "production",
    })
  }

  return res
}

// Keep API and static assets out of middleware
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
}
