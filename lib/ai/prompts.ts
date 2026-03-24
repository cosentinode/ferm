const NEWLINE_ESCAPE = /\\n/g

function getPromptEnv(key: string) {
  const value = process.env[key]?.trim()
  if (!value) {
    throw new Error(`${key} is not set`)
  }

  return value.replace(NEWLINE_ESCAPE, "\n")
}

function applyTemplate(template: string, values: Record<string, string>) {
  return template.replace(/{{\s*([A-Z0-9_]+)\s*}}/g, (_match, rawKey: string) => values[rawKey] ?? "")
}

export function getResumeScoringSystemPrompt() {
  return getPromptEnv("PROMPT_RESUME_SCORING_SYSTEM")
}

export function getPrepBaseContextPrompt() {
  return getPromptEnv("PROMPT_PREP_BASE_CONTEXT")
}

export function getPrepVoiceSessionRulesPrompt() {
  return getPromptEnv("PROMPT_PREP_VOICE_SESSION_RULES")
}

export function getPrepVoiceJobLinePrompt(role: string, company: string) {
  return applyTemplate(getPromptEnv("PROMPT_PREP_VOICE_JOB_LINE"), {
    ROLE: role,
    COMPANY: company,
  })
}

export function getPrepVoiceNoteLinePrompt(note: string) {
  return applyTemplate(getPromptEnv("PROMPT_PREP_VOICE_NOTE_LINE"), {
    NOTE: note,
  })
}

export function getPrepVoiceFallbackReplyPrompt() {
  return getPromptEnv("PROMPT_PREP_VOICE_FALLBACK_REPLY")
}

export function getPrepChatTitleInstructionsPrompt() {
  return getPromptEnv("PROMPT_PREP_CHAT_TITLE_INSTRUCTIONS")
}

export function getScrapeGuardrailReferencePrompt() {
  return getPromptEnv("PROMPT_SCRAPE_GUARDRAIL_REFERENCE")
}

export function getScrapeGuardrailIgnorePrompt() {
  return getPromptEnv("PROMPT_SCRAPE_GUARDRAIL_IGNORE")
}

export function getScrapeGuardrailTruncationPrompt(maxTextLength: string) {
  return applyTemplate(getPromptEnv("PROMPT_SCRAPE_GUARDRAIL_TRUNCATION"), {
    MAX_TEXT_LENGTH: maxTextLength,
  })
}

export function getParseJobPromptTemplate() {
  return getPromptEnv("PROMPT_PARSE_JOB_TEMPLATE")
}

export function getFollowUpSystemPrompt() {
  return getPromptEnv("PROMPT_FOLLOW_UP_SYSTEM")
}

export function getFollowUpUserPromptTemplate() {
  return getPromptEnv("PROMPT_FOLLOW_UP_USER_TEMPLATE")
}

export { applyTemplate }
