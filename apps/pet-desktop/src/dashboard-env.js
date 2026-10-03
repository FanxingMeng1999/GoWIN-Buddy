"use strict";

const fs = require("fs");
const path = require("path");

function isDashboardMode(env = process.env) {
  const rawMode = String(env.GOWIN_BUDDY_MODE || "")
    .trim()
    .toLowerCase();
  if (!rawMode) return true;
  if (["1", "true", "on", "dashboard", "gowin"].includes(rawMode)) return true;
  if (["0", "false", "off", "classic", "pet"].includes(rawMode)) return false;
  return rawMode === "dashboard";
}

function resolveWorkspaceRoot(baseDir, env = process.env, options = {}) {
  if (env.GOWIN_BUDDY_ROOT) return path.resolve(env.GOWIN_BUDDY_ROOT);
  if (options.isPackaged && options.resourcesPath) {
    return path.resolve(options.resourcesPath, "..", "..", "..");
  }
  return path.resolve(baseDir, "..", "..", "..");
}

function resolveDashboardRuntimeConfig(options = {}) {
  const env = options.env || process.env;
  const baseDir = options.baseDir || __dirname;
  const fsImpl = options.fsImpl || fs;
  const workspaceRoot = resolveWorkspaceRoot(baseDir, env, options);
  const userDataRoot = env.GOWIN_USER_DATA_ROOT
    ? path.resolve(env.GOWIN_USER_DATA_ROOT)
    : (options.isPackaged && options.userDataRoot ? path.resolve(options.userDataRoot) : "");

  const dashboardHostScript = env.GOWIN_DASHBOARD_HOST_SCRIPT
    ? path.resolve(env.GOWIN_DASHBOARD_HOST_SCRIPT)
    : path.join(workspaceRoot, "apps", "rpg-hub", "host", "personal_dashboard_host.py");

  const dashboardStatePath = env.GOWIN_DASHBOARD_STATE_PATH
    ? path.resolve(env.GOWIN_DASHBOARD_STATE_PATH)
    : path.join(userDataRoot || path.join(workspaceRoot, "data"), "state", "game_state.json");

  const dashboardRuntimePath = env.GOWIN_DASHBOARD_RUNTIME_PATH
    ? path.resolve(env.GOWIN_DASHBOARD_RUNTIME_PATH)
    : path.join(userDataRoot || workspaceRoot, "runtime", "rpg_hub", "runtime.json");

  const dashboardThemePath = env.GOWIN_DASHBOARD_THEME_PATH
    ? path.resolve(env.GOWIN_DASHBOARD_THEME_PATH)
    : path.join(userDataRoot || workspaceRoot, "runtime", "rpg_hub", "theme.json");

  const bundledPythonCandidates = [
    env.GOWIN_DASHBOARD_PYTHON,
    env.GOWIN_BUNDLED_PYTHON,
    path.join(workspaceRoot, "tools", "runtime", "python", "windows-x64", "3.11.9", "python.exe"),
    path.join(workspaceRoot, "runtime", "python", "windows-x64", "3.11.9", "python.exe"),
  ].filter(Boolean);
  const bundledPython = bundledPythonCandidates.find((candidate) => {
    try {
      return fsImpl.existsSync(candidate);
    } catch {
      return false;
    }
  }) || bundledPythonCandidates[0] || "";

  return {
    dashboardMode: isDashboardMode(env),
    workspaceRoot,
    dashboardHostScript,
    dashboardStatePath,
    dashboardRuntimePath,
    dashboardThemePath,
    bundledPython,
    sessionId: "__gowin_dashboard__",
  };
}

module.exports = {
  isDashboardMode,
  resolveDashboardRuntimeConfig,
};
