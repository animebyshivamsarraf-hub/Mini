/**
 * Mini 2 — Integration Architecture
 *
 * Integrations connect to external apps (Google Drive, Gmail, GitHub, etc.)
 * via OAuth 2.0. No integration is shown as "connected" until a real
 * OAuth flow completes and tokens are stored server-side.
 */

export type IntegrationId =
  | "google-drive"
  | "gmail"
  | "google-calendar"
  | "google-docs"
  | "google-sheets"
  | "github"
  | "slack"
  | "notion";

export interface IntegrationConfig {
  id: IntegrationId;
  name: string;
  icon: string;
  /** OAuth scopes required (minimum necessary) */
  scopes: string[];
  /** Env vars for OAuth client credentials (server-side only) */
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
}

export const INTEGRATIONS: Record<IntegrationId, IntegrationConfig> = {
  "google-drive": {
    id: "google-drive", name: "Google Drive", icon: "📦",
    scopes: ["https://www.googleapis.com/auth/drive.file"],
    clientIdEnvVar: "GOOGLE_CLIENT_ID", clientSecretEnvVar: "GOOGLE_CLIENT_SECRET",
  },
  "gmail": {
    id: "gmail", name: "Gmail", icon: "📧",
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
    clientIdEnvVar: "GOOGLE_CLIENT_ID", clientSecretEnvVar: "GOOGLE_CLIENT_SECRET",
  },
  "google-calendar": {
    id: "google-calendar", name: "Google Calendar", icon: "📅",
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
    clientIdEnvVar: "GOOGLE_CLIENT_ID", clientSecretEnvVar: "GOOGLE_CLIENT_SECRET",
  },
  "google-docs": {
    id: "google-docs", name: "Google Docs", icon: "📄",
    scopes: ["https://www.googleapis.com/auth/documents"],
    clientIdEnvVar: "GOOGLE_CLIENT_ID", clientSecretEnvVar: "GOOGLE_CLIENT_SECRET",
  },
  "google-sheets": {
    id: "google-sheets", name: "Google Sheets", icon: "📊",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    clientIdEnvVar: "GOOGLE_CLIENT_ID", clientSecretEnvVar: "GOOGLE_CLIENT_SECRET",
  },
  "github": {
    id: "github", name: "GitHub", icon: "🐙",
    scopes: ["repo", "read:user"],
    clientIdEnvVar: "GITHUB_CLIENT_ID", clientSecretEnvVar: "GITHUB_CLIENT_SECRET",
  },
  "slack": {
    id: "slack", name: "Slack", icon: "💬",
    scopes: ["chat:write", "channels:read"],
    clientIdEnvVar: "SLACK_CLIENT_ID", clientSecretEnvVar: "SLACK_CLIENT_SECRET",
  },
  "notion": {
    id: "notion", name: "Notion", icon: "📝",
    scopes: [],
    clientIdEnvVar: "NOTION_CLIENT_ID", clientSecretEnvVar: "NOTION_CLIENT_SECRET",
  },
};

export type IntegrationStatus =
  | { connected: true; connectedAt: string }
  | { connected: false; reason: string };

/**
 * Check integration status. Without a real OAuth token store,
 * all integrations honestly report "not connected".
 * TODO: Implement token storage in PostgreSQL when DB is available.
 */
export function getIntegrationStatus(id: IntegrationId): IntegrationStatus {
  // No token store yet — honest "not connected"
  return {
    connected: false,
    reason: `${INTEGRATIONS[id].name} not connected. Complete OAuth authorization to connect.`,
  };
}

export function listIntegrations(): Array<IntegrationConfig & IntegrationStatus> {
  return (Object.keys(INTEGRATIONS) as IntegrationId[]).map((id) => ({
    ...INTEGRATIONS[id],
    ...getIntegrationStatus(id),
  }));
}
