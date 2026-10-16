/**
 * Prompt validation for Mini's create_task MCP tool.
 * Rules: must be a string, 3-8000 chars after trim, non-empty.
 */

export type ValidationResult =
  | { ok: true; prompt: string }
  | { ok: false; error: string };

export const PROMPT_MIN_LENGTH = 3;
export const PROMPT_MAX_LENGTH = 8000;

export function validatePrompt(input: unknown): ValidationResult {
  if (typeof input !== "string") {
    return { ok: false, error: "prompt must be a string" };
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "prompt must not be empty" };
  }
  if (trimmed.length < PROMPT_MIN_LENGTH) {
    return {
      ok: false,
      error: `prompt must be at least ${PROMPT_MIN_LENGTH} characters`,
    };
  }
  if (input.length > PROMPT_MAX_LENGTH) {
    return {
      ok: false,
      error: `prompt must not exceed ${PROMPT_MAX_LENGTH} characters`,
    };
  }
  return { ok: true, prompt: trimmed };
}
