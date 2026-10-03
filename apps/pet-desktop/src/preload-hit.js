const { contextBridge, ipcRenderer } = require("electron");

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

function safeParseJson(raw, fallback) {
  if (!raw || typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// Parse hit-renderer theme config from additionalArguments (synchronous, available on first load)
const hitThemeArg = process.argv.find(a => a.startsWith("--hit-theme-config="));
const hitThemeConfig = hitThemeArg
  ? safeParseJson(hitThemeArg.slice("--hit-theme-config=".length), null)
  : null;
const hitMode = resolveHitMode(process.argv, process.env);
const hitInteractionConfig = resolveHitInteractionConfig(process.argv);

contextBridge.exposeInMainWorld("hitThemeConfig", hitThemeConfig);
contextBridge.exposeInMainWorld("hitInteractionConfig", hitInteractionConfig);

contextBridge.exposeInMainWorld("hitAPI", {
  isRiosDashboardMode: hitMode.isDashboardMode,
  // Theme config push (for hot-switch; additionalArguments won't update on reload)
  onThemeConfig: (cb) => ipcRenderer.on("theme-config", (_, cfg) => cb(cfg)),
  // Sends → main
  dragLock: (locked) => ipcRenderer.send("drag-lock", locked),
  moveWindowBy: (dx, dy) => ipcRenderer.send("move-window-by", dx, dy),
  dragEnd: () => ipcRenderer.send("drag-end"),
  showContextMenu: () => ipcRenderer.send("show-context-menu"),
  focusTerminal: () => ipcRenderer.send("focus-terminal"),
  openDashboard: () => ipcRenderer.send("open-dashboard"),
  hoverQuickTasks: (inside) => ipcRenderer.send("quick-task:hover", !!inside),
  exitMiniMode: () => ipcRenderer.send("exit-mini-mode"),
  showSessionMenu: () => ipcRenderer.send("show-session-menu"),
  // Reaction triggers → main → renderWin
  startDragReaction: () => ipcRenderer.send("start-drag-reaction"),
  endDragReaction: () => ipcRenderer.send("end-drag-reaction"),
  playClickReaction: (svg, duration) => ipcRenderer.send("play-click-reaction", svg, duration),
  // State sync ← main
  onStateSync: (cb) => ipcRenderer.on("hit-state-sync", (_, data) => cb(data)),
  onCancelReaction: (cb) => ipcRenderer.on("hit-cancel-reaction", () => cb()),
});
