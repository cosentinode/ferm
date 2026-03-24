// app/api/parse-job/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { resolveOpenAIKeys, USER_OPENAI_KEY_HEADER } from "@/lib/ai/keys";
import { applyTemplate, getParseJobPromptTemplate } from "@/lib/ai/prompts";
import { requireCookieCsrf } from "@/lib/api/auth";
import { enforceRateLimit } from "@/lib/api/rate-limit";

const DAILY_LIMIT = 20;
const MAX_RAW_TEXT_LENGTH = 60_000;

const RequestBodySchema = z.object({
  raw_text: z.string().min(1, "raw_text required"),
  job_url: z.string().url(),
});

/** Normalize Employment Type coming from LLM (robust to variants) */
function normalizeEmploymentType(v: unknown) {
  if (typeof v !== "string") return null;
  const s = v.toLowerCase().replace(/\s+/g, "");
  if (s.includes("full")) return "Full-time";
  if (s.includes("part")) return "Part-time";
  if (s.includes("contract") || s.includes("temp")) return "Contract";
  if (s.includes("intern")) return "Internship";
  return null;
}

const LLMResponseSchema = z.object({
  is_valid_job_posting: z.boolean(),
  reason: z.string().nullable().optional(),

  company_name: z.string().nullable(),
  position_title: z.string().nullable(),
  location: z.string().nullable(),
  salary_range: z.string().nullable(),
  employment_type: z.preprocess(
    normalizeEmploymentType,
    z.enum(["Full-time", "Part-time", "Contract", "Internship"]).nullable()
  ),
  contact_person: z.string().nullable(),
  contact_email: z.string().email().nullable(),
  job_description: z.string().nullable(),
  qualifications: z.string().nullable(),
  job_responsibilities: z.string().nullable(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const withRequestId = (response: NextResponse) => {
    response.headers.set("X-Request-Id", requestId);
    return response;
  };

  const csrfError = requireCookieCsrf(request);
  if (csrfError) {
    return withRequestId(
      NextResponse.json({ error: csrfError.error.message }, { status: csrfError.error.status }),
    );
  }

  // --- Auth (Supabase) ---
  const hdrs = headers();
  const authHeader = hdrs.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return withRequestId(NextResponse.json({ error: "Missing token" }, { status: 401 }));
  }

  const userResp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (!userResp.ok) {
    return withRequestId(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }
  const user = (await userResp.json()) as { id: string };
  if (!user?.id) {
    return withRequestId(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  const rateLimitResponse = await enforceRateLimit({
    request,
    userId: user.id,
    keyPrefix: "parse-job",
  });
  if (rateLimitResponse) {
    rateLimitResponse.headers.set("Vary", `Authorization, ${USER_OPENAI_KEY_HEADER}`);
    return withRequestId(rateLimitResponse);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { userKey, sharedKey } = await resolveOpenAIKeys({ request, supabase, userId: user.id });
  if (!userKey && !sharedKey) {
    const response = withRequestId(
      NextResponse.json(
      { error: "The service is not configured with an OpenAI API key." },
      { status: 500 },
    ),
    );
    response.headers.set("Vary", `Authorization, ${USER_OPENAI_KEY_HEADER}`);
    return response;
  }

  const today = new Date().toISOString().split("T")[0];
  const { data: usageRow, error: usageError } = await supabase
    .from("llm_usage")
    .select("job_scrapes_count")
    .eq("user_id", user.id)
    .eq("date", today)
    .maybeSingle();

  if (usageError && usageError.code !== "PGRST116") {
    return withRequestId(NextResponse.json({ error: "Unable to check usage." }, { status: 500 }));
  }

  const usedToday = usageRow?.job_scrapes_count ?? 0;
  let apiKey = userKey ?? sharedKey ?? "";
  let isUserProvided = false;
  let isSharedKey = false;

  if (sharedKey) {
    if (usedToday < DAILY_LIMIT) {
      apiKey = sharedKey;
      isSharedKey = true;
    } else if (userKey) {
      apiKey = userKey;
      isUserProvided = true;
    } else {
      const res = withRequestId(
        NextResponse.json(
          { error: "Daily usage limit reached." },
          { status: 429 },
        ),
      );
      res.headers.set("Cache-Control", "no-store");
      res.headers.set("Vary", `Authorization, ${USER_OPENAI_KEY_HEADER}`);
      res.headers.set("X-Usage-Limit", String(DAILY_LIMIT));
      res.headers.set("X-Usage-Remaining", "0");
      return res;
    }
  } else if (userKey) {
    apiKey = userKey;
    isUserProvided = true;
  }

  // --- Parse input ---
  let bodyUnknown: unknown;
  try {
    bodyUnknown = await request.json();
  } catch {
    return withRequestId(NextResponse.json({ error: "Invalid request body" }, { status: 400 }));
  }
  const parsedBody = RequestBodySchema.safeParse(bodyUnknown);
  if (!parsedBody.success) {
    return withRequestId(
      NextResponse.json(
        { error: "Invalid input data", details: parsedBody.error.flatten() },
        { status: 400 },
      ),
    );
  }
  const { raw_text, job_url } = parsedBody.data;

  // --- Call OpenAI ---
  const safeRawText =
    raw_text.length > MAX_RAW_TEXT_LENGTH ? raw_text.slice(0, MAX_RAW_TEXT_LENGTH) : raw_text;
  const truncationNotice =
    raw_text.length > MAX_RAW_TEXT_LENGTH
      ? `Note: The supplied content was truncated to ${MAX_RAW_TEXT_LENGTH.toLocaleString()} characters for safety.`
      : "";

  const prompt = applyTemplate(getParseJobPromptTemplate(), {
    TRUNCATION_NOTICE: truncationNotice ? `\n${truncationNotice}` : "",
    SAFE_RAW_TEXT: safeRawText,
    JOB_URL: job_url,
  });


  try {
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("LLM API call failed", { requestId, status: openaiResponse.status, errorText });
      return withRequestId(
        NextResponse.json(
          { error: "LLM request failed" },
          { status: openaiResponse.status },
        ),
      );
    }

    const llmJson = await openaiResponse.json();
    const messageContent = llmJson?.choices?.[0]?.message?.content;
    const usage = llmJson?.usage ?? null;
    if (!messageContent) {
      return withRequestId(
        NextResponse.json({ error: "LLM response format is invalid" }, { status: 500 }),
      );
    }

    let raw;
    try {
      raw = JSON.parse(messageContent);
    } catch {
      return withRequestId(
        NextResponse.json({ error: "LLM did not return valid JSON" }, { status: 500 }),
      );
    }
    const validated = LLMResponseSchema.safeParse(raw);
    if (!validated.success) {
      // If LLM messed up the shape, treat as invalid posting with reason
      const resMalformed = withRequestId(
        NextResponse.json(
          { is_valid_job_posting: false, reason: "LLM returned malformed data", usage, validated },
          { status: 200 },
        ),
      );
      resMalformed.headers.set("Cache-Control", "no-store");
      resMalformed.headers.set("Vary", `Authorization, ${USER_OPENAI_KEY_HEADER}`);
      return resMalformed;
    }
    // --- Supabase client bound to user token (for RPC/RLS) ---
    // ✅ Increment usage AFTER successful parse when using the hosted key
    let remainingNow: number | null = null;
    if (isSharedKey) {
      // Recommended SQL (in your function):
      // ... DO UPDATE SET job_scrapes_count = least(llm_usage.job_scrapes_count + 1, 20) RETURNING job_scrapes_count;
      const { data: incCount, error: incErr } = await supabase.rpc("increment_job_scrapes_usage");
      if (incErr) {
        console.error("increment_job_scrapes_usage error:", { requestId, incErr });
        return withRequestId(NextResponse.json({ error: "Usage update failed" }, { status: 500 }));
      }

      // Determine new count/remaining
      let usedNow: number | null =
        typeof incCount === "number" ? incCount : null;

      if (usedNow === null) {
        // fallback: read today's count if function didn't RETURNING count
        const today = new Date().toISOString().split("T")[0];
        const { data: afterRow } = await supabase
          .from("llm_usage")
          .select("job_scrapes_count")
          .eq("user_id", user.id)
          .eq("date", today)
          .maybeSingle();
        usedNow = afterRow?.job_scrapes_count ?? null;
      }

      remainingNow =
        usedNow == null ? null : Math.max(0, DAILY_LIMIT - usedNow);
    }

    // Respond with parsed data + usage headers for instant UI update
    const res = withRequestId(
      NextResponse.json(
        { ...validated.data, usage },
        { status: 200 },
      ),
    );
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("Vary", `Authorization, ${USER_OPENAI_KEY_HEADER}`);
    if (remainingNow != null) {
      res.headers.set("X-Usage-Limit", String(DAILY_LIMIT));
      res.headers.set("X-Usage-Remaining", String(remainingNow));
    } else if (isUserProvided) {
      res.headers.set("X-Usage-Limit", "personal");
      res.headers.set("X-Usage-Remaining", "unlimited");
    }
    return res;
  } catch (error) {
    console.error("parse-job error:", { requestId, error });
    return withRequestId(
      NextResponse.json({ error: "Internal server error during parsing" }, { status: 500 }),
    );
  }
}
