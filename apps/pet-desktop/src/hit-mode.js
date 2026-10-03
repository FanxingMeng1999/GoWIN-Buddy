"use strict";

function parseArgValue(argv, prefix) {
  if (!Array.isArray(argv)) return "";
  const hit = argv.find((item) => typeof item === "string" && item.startsWith(prefix));
  if (!hit) return "";
  return hit.slice(prefix.length).trim();
}

function parseBoolean(value, fallback = false) {
  if (!value) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on", "dashboard", "gowin"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "classic", "pet"].includes(normalized)) return false;
  return fallback;
}

function resolveHitMode(argv = process.argv, env = process.env) {
  const modeArg = parseArgValue(argv, "--dashboard-mode=");
  if (modeArg) {
    return {
      isDashboardMode: parseBoolean(modeArg, false),
      source: "argv",
    };
  }
  const modeEnv = String(env.GOWIN_BUDDY_MODE || env.RIOS_DESKTOP_PET_MODE || "").trim().toLowerCase();
  return {
    isDashboardMode: modeEnv === "dashboard",
    source: "env",
  };
}

function resolveHitInteractionConfig(argv = process.argv) {
  const raw = parseArgValue(argv, "--hit-interaction-config=");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

module.exports = {
  parseArgValue,
  resolveHitMode,
  resolveHitInteractionConfig,
};

