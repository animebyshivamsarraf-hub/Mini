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

/**
 * Chat-transfer message validation ("poora chat idhar se udhar").
 * A transcript is an array of { role, content } objects sent VERBATIM
 * to the target provider — no rewrite, same honesty contract as forward.
 */

export const TRANSFER_MAX_MESSAGES = 100;
export const TRANSFER_MAX_MESSAGE_CHARS = 8000;

export type TransferMessageRole = "system" | "user" | "assistant";

export interface TransferMessage {
  role: TransferMessageRole;
  content: string;
}

export type TransferValidationResult =
  | { ok: true; messages: TransferMessage[] }
  | { ok: false; error: string };

const VALID_TRANSFER_ROLES: ReadonlySet<string> = new Set([
  "system",
  "user",
  "assistant",
]);

export function validateTransferMessages(
  input: unknown
): TransferValidationResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: "messages must be an array" };
  }
  if (input.length === 0) {
    return { ok: false, error: "messages must not be empty" };
  }
  if (input.length > TRANSFER_MAX_MESSAGES) {
    return {
      ok: false,
      error: `messages must not exceed ${TRANSFER_MAX_MESSAGES} messages`,
    };
  }
  const messages: TransferMessage[] = [];
  for (let i = 0; i < input.length; i++) {
    const m = input[i] as Record<string, unknown> | null;
    if (typeof m !== "object" || m === null) {
      return { ok: false, error: `messages[${i}] must be an object` };
    }
    const role = m.role;
    if (typeof role !== "string" || !VALID_TRANSFER_ROLES.has(role)) {
      return {
        ok: false,
        error: `messages[${i}].role must be one of: system, user, assistant`,
      };
    }
    const content = m.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      return {
        ok: false,
        error: `messages[${i}].content must be a non-empty string`,
      };
    }
    if (content.length > TRANSFER_MAX_MESSAGE_CHARS) {
      return {
        ok: false,
        error: `messages[${i}].content must not exceed ${TRANSFER_MAX_MESSAGE_CHARS} characters`,
      };
    }
    messages.push({ role: role as TransferMessageRole, content });
  }
  return { ok: true, messages };
}
