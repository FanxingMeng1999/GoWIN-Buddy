"use strict";

const DEFAULT_RIOS_LEGACY_PROFILE = Object.freeze({
  profileId: "rios-legacy-v1",
  sourceProject: "clawd-on-desk-main",
  sourceWorkspaceRoot: "",
  sourcePathHint: "",
  dashboardClickWindowMs: 260,
  defaultClickWindowMs: 400,
  dashboardHoverCards: true,
  dashboardDoubleClickOpen: true,
  reactionDurationScale: 1,
  statePriorityOverrides: Object.freeze({}),
  rewardSignalCooldownMs: 0,
  wellnessReminderEnabled: true,
  wellnessReminderIntervalMs: 28 * 60 * 1000,
  wellnessReminderDurationMs: 5600,
  wellnessReminderStartupDelayMs: 3 * 60 * 1000,
});

const STATE_PRIORITY_KEYS = new Set([
  "error",
  "notification",
  "sweeping",
  "attention",
  "carrying",
  "juggling",
  "working",
  "thinking",
  "idle",
  "sleeping",
]);

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number.parseFloat(String(value || ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function parseStatePriorityOverrides(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
  const normalized = {};
  for (const [key, raw] of Object.entries(parsed)) {
    if (!STATE_PRIORITY_KEYS.has(key)) continue;
    const priority = Number(raw);
    if (!Number.isFinite(priority) || priority < 0) continue;
    normalized[key] = priority;
  }
  return normalized;
}

function resolveRiosLegacyProfile(env = process.env) {
  const statePriorityOverrides = parseStatePriorityOverrides(
    env.GOWIN_STATE_PRIORITY_OVERRIDES,
    DEFAULT_RIOS_LEGACY_PROFILE.statePriorityOverrides
  );
  return {
    ...DEFAULT_RIOS_LEGACY_PROFILE,
    dashboardClickWindowMs: parsePositiveInt(
      env.GOWIN_DASHBOARD_CLICK_WINDOW_MS,
      DEFAULT_RIOS_LEGACY_PROFILE.dashboardClickWindowMs
    ),
    defaultClickWindowMs: parsePositiveInt(
      env.GOWIN_DEFAULT_CLICK_WINDOW_MS,
      DEFAULT_RIOS_LEGACY_PROFILE.defaultClickWindowMs
    ),
    dashboardHoverCards: parseBoolean(
      env.GOWIN_DASHBOARD_HOVER_CARDS,
      DEFAULT_RIOS_LEGACY_PROFILE.dashboardHoverCards
    ),
    dashboardDoubleClickOpen: parseBoolean(
      env.GOWIN_DASHBOARD_DOUBLE_CLICK_OPEN,
      DEFAULT_RIOS_LEGACY_PROFILE.dashboardDoubleClickOpen
    ),
    reactionDurationScale: parsePositiveNumber(
      env.GOWIN_REACTION_DURATION_SCALE,
      DEFAULT_RIOS_LEGACY_PROFILE.reactionDurationScale
    ),
    statePriorityOverrides,
    rewardSignalCooldownMs: parseNonNegativeInt(
      env.GOWIN_REWARD_SIGNAL_COOLDOWN_MS,
      DEFAULT_RIOS_LEGACY_PROFILE.rewardSignalCooldownMs
    ),
    wellnessReminderEnabled: parseBoolean(
      env.GOWIN_WELLNESS_REMINDER_ENABLED,
      DEFAULT_RIOS_LEGACY_PROFILE.wellnessReminderEnabled
    ),
    wellnessReminderIntervalMs: parsePositiveInt(
      env.GOWIN_WELLNESS_REMINDER_INTERVAL_MS,
      DEFAULT_RIOS_LEGACY_PROFILE.wellnessReminderIntervalMs
    ),
    wellnessReminderDurationMs: parsePositiveInt(
      env.GOWIN_WELLNESS_REMINDER_DURATION_MS,
      DEFAULT_RIOS_LEGACY_PROFILE.wellnessReminderDurationMs
    ),
    wellnessReminderStartupDelayMs: parsePositiveInt(
      env.GOWIN_WELLNESS_REMINDER_STARTUP_DELAY_MS,
      DEFAULT_RIOS_LEGACY_PROFILE.wellnessReminderStartupDelayMs
    ),
  };
}

module.exports = {
  DEFAULT_RIOS_LEGACY_PROFILE,
  resolveRiosLegacyProfile,
};
