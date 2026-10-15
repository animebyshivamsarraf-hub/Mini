export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export function validatePrompt(prompt: unknown): ValidationResult {
  if (typeof prompt !== "string") {
    return { ok: false, error: "prompt must be a string" };
  }
  if (prompt.trim().length === 0) {
    return { ok: false, error: "prompt must not be empty" };
  }
  if (prompt.trim().length < 3) {
    return { ok: false, error: "prompt must be at least 3 characters" };
  }
  if (prompt.length > 8000) {
    return { ok: false, error: "prompt must not exceed 8000 characters" };
  }
  return { ok: true };
}
