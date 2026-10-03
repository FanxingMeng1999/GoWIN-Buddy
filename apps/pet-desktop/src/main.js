const { app, BrowserWindow, screen, Menu, ipcMain, globalShortcut, shell, Notification } = require("electron");
const path = require("path");
const { applyStationaryCollectionBehavior } = require("./mac-window");
const { createDashboardBridge } = require("./dashboard-bridge");
const { resolveDashboardRuntimeConfig } = require("./dashboard-env");
const { resolveRiosLegacyProfile } = require("./rios-legacy-profile");
const { createQuickTaskPanelController } = require("./quick-task-panel");
const { createPetReminderController } = require("./pet-reminder-panel");
const { createRuntimeStateStore } = require("./runtime-state");
const { createWindowPolicyManager } = require("./window-policy");
const { createPetVisibilityController } = require("./pet-visibility");
const { createQuickTaskShortcutController } = require("./quick-task-shortcut");
const { createOnboardingController } = require("./onboarding");
const {
  createWindowRuntimeEntry,
  setupMainLifecycle,
  createBeforeQuitHandler,
  createAgentMonitorHooks,
} = require("./composition-root");
const {
  getNearestWorkArea: getNearestWorkAreaByScreen,
  looseClampToDisplays: looseClampToDisplaysByScreen,
  clampToScreen: clampToScreenByScreen,
} = require("./window-orchestrator");
const { installTerminalFocusExtension } = require("./terminal-focus-extension");

// ── Autoplay policy: allow sound playback without user gesture ──
// MUST be set before any BrowserWindow is created (before app.whenReady)
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const isMac = process.platform === "darwin";
const isLinux = process.platform === "linux";
const isWin = process.platform === "win32";
const LINUX_WINDOW_TYPE = "toolbar";
const userDataRoot = process.env.GOWIN_USER_DATA_ROOT
  ? path.resolve(process.env.GOWIN_USER_DATA_ROOT)
  : path.join(app.getPath("appData"), "gowin-buddy-pet");
require("fs").mkdirSync(userDataRoot, { recursive: true });
app.setPath("userData", userDataRoot);
const dashboardRuntimeConfig = resolveDashboardRuntimeConfig({
  env: process.env, baseDir: __dirname, isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath, userDataRoot,
});
const isRiosDashboardMode = dashboardRuntimeConfig.dashboardMode;
const riosLegacyProfile = resolveRiosLegacyProfile(process.env);


// ── Windows: AllowSetForegroundWindow via FFI ──
let _allowSetForeground = null;
if (isWin) {
  try {
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");
    _allowSetForeground = user32.func("bool __stdcall AllowSetForegroundWindow(int dwProcessId)");
  } catch (err) {
    console.warn("GoWIN!Buddy: koffi/AllowSetForegroundWindow not available:", err.message);
  }
}


// ── Window size presets ──
const SIZES = {
  S: { width: 200, height: 200 },
  M: { width: 280, height: 280 },
  L: { width: 360, height: 360 },
};

function detectDefaultLang() {
  try {
    const sysLocale = String(app.getSystemLocale() || "").toLowerCase();
    if (sysLocale.startsWith("zh")) return "zh";
  } catch {}
  return "en";
}
let lang = detectDefaultLang();

let _codexMonitor = null;          // Codex CLI JSONL log polling instance
let _geminiMonitor = null;         // Gemini CLI session JSON polling instance

// ── Theme loader ──
const themeLoader = require("./theme-loader");
const runtimeStateStore = createRuntimeStateStore({
  app,
  baseDir: __dirname,
  themeLoader,
});

function loadPrefs() {
  return runtimeStateStore.loadPrefs();
}

function buildPrefsSnapshot() {
  if (!win || win.isDestroyed()) return null;
  const { x, y } = win.getBounds();
  return {
    x,
    y,
    size: currentSize,
    miniMode: _mini.getMiniMode(),
    miniEdge: _mini.getMiniEdge(),
    preMiniX: _mini.getPreMiniX(),
    preMiniY: _mini.getPreMiniY(),
    lang,
    showTray,
    showDock,
    autoStartWithClaude,
    bubbleFollowPet,
    hideBubbles,
    showSessionId,
    soundMuted,
    wellnessReminderMuted,
    theme: activeTheme ? activeTheme._id : "clawd",
  };
}

function savePrefs() {
  const snapshot = buildPrefsSnapshot();
  if (!snapshot) return;
  runtimeStateStore.savePrefs(snapshot);
}

let activeTheme = runtimeStateStore.loadThemeFromPrefs(loadPrefs());

function buildDashboardThemePayload(theme = activeTheme) {
  if (!theme || typeof theme !== "object") return null;
  return {
    id: theme._id || "clawd",
    name: theme.name || theme._id || "Sprout Buddy",
    ...(theme.dashboardTheme || {}),
    preview: theme.preview || null,
  };
}

// ── CSS <object> sizing (from theme) ──
function getObjRect(bounds) {
  const os = activeTheme.objectScale;
  return {
    x: bounds.x + bounds.width * os.offsetX,
    y: bounds.y + bounds.height * os.offsetY,
    w: bounds.width * os.widthRatio,
    h: bounds.height * os.heightRatio,
  };
}

let win;
let hitWin;  // input window — small opaque rect over hitbox, receives all pointer events
let tray = null;
let contextMenuOwner = null;
let currentSize = "P:10"; // "P:<ratio>" — pet occupies <ratio>% of work area width
let quickTaskPanel = null;
let petReminder = null;

// ── Proportional size mode ──
// currentSize = "P:<ratio>" means the pet occupies <ratio>% of the work area width.
const PROPORTIONAL_RATIOS = [8, 10, 12, 15];

function isProportionalMode(size) {
  return typeof (size || currentSize) === "string" && (size || currentSize).startsWith("P:");
}

function getProportionalRatio(size) {
  return parseFloat((size || currentSize).slice(2)) || 10;
}

function getCurrentPixelSize(overrideWa) {
  if (!isProportionalMode()) return SIZES[currentSize] || SIZES.S;
  const ratio = getProportionalRatio();
  let wa = overrideWa;
  if (!wa && win && !win.isDestroyed()) {
    const { x, y, width, height } = win.getBounds();
    wa = getNearestWorkArea(x + width / 2, y + height / 2);
  }
  if (!wa) wa = screen.getPrimaryDisplay().workArea;
  const px = Math.round(wa.width * ratio / 100);
  return { width: px, height: px };
}

function getNearestWorkArea(cx, cy) {
  return getNearestWorkAreaByScreen(screen, cx, cy);
}

function looseClampToDisplays(x, y, width, height) {
  return looseClampToDisplaysByScreen(screen, x, y, width, height);
}

function clampToScreen(x, y, width, height) {
  return clampToScreenByScreen(screen, x, y, width, height);
}

let contextMenu;
let doNotDisturb = false;
let isQuitting = false;
let showTray = true;
let showDock = true;
let autoStartWithClaude = false;
let bubbleFollowPet = false;
let hideBubbles = false;
let showSessionId = false;
let soundMuted = false;
let wellnessReminderMuted = false;
let petHidden = false;
let mouseOverPet = false;
let dragLocked = false;
let menuOpen = false;
let idlePaused = false;
let forceEyeResend = false;
let pendingPermissions = [];
let miniAnimatingGetter = () => false;

const windowPolicy = createWindowPolicyManager({
  isMac,
  isWin,
  applyStationaryCollectionBehavior,
  showDock: () => showDock,
  getMainWindow: () => win,
  getHitWindow: () => hitWin,
  getQuickTaskWindow: () => (quickTaskPanel ? quickTaskPanel.getWindow() : null),
  getContextMenuOwner: () => contextMenuOwner,
  getPermissionBubbles: () => pendingPermissions.map((entry) => entry && entry.bubble).filter(Boolean),
  getDragLocked: () => dragLocked,
  getMiniAnimating: () => miniAnimatingGetter(),
  onForceEyeResend: () => { forceEyeResend = true; },
  syncHitWindow: () => syncHitWin(),
});

const reapplyMacVisibility = () => windowPolicy.reapplyMacVisibility();
const guardAlwaysOnTop = (targetWindow) => windowPolicy.guardAlwaysOnTop(targetWindow);
const startTopmostWatchdog = () => windowPolicy.startTopmostWatchdog();
let petVisibility = null;
function togglePetVisibility() {
  if (!petVisibility) return;
  petVisibility.togglePetVisibility();
}

function registerToggleShortcut() {
  if (petVisibility) petVisibility.registerToggleShortcut();
  quickTaskShortcut.register();
}

function unregisterToggleShortcut() {
  if (petVisibility) petVisibility.unregisterToggleShortcut();
  quickTaskShortcut.unregister();
}

function sendToRenderer(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}
function sendToHitWin(channel, ...args) {
  if (hitWin && !hitWin.isDestroyed()) hitWin.webContents.send(channel, ...args);
}

function buildPetStatsPayload() {
  if (!isRiosDashboardMode || !dashboardBridge) return null;
  try {
    const snapshot = dashboardBridge.getQuickTaskPayload() || {};
    const level = snapshot.levelStats || null;
    if (!level) return null;
    return {
      level: level.level,
      title: level.title,
      currentXp: level.currentXp,
      nextXp: level.nextXp,
      totalXp: level.totalXp,
      percent: level.percent,
    };
  } catch {
    return null;
  }
}

function pushPetStatsToRenderer() {
  const payload = buildPetStatsPayload();
  if (!payload) return;
  sendToRenderer("pet-stats", payload);
}

// ── Sound playback ──
let lastSoundTime = 0;
const SOUND_COOLDOWN_MS = 10000;

function playSound(name) {
  if (soundMuted || doNotDisturb) return;
  const now = Date.now();
  if (now - lastSoundTime < SOUND_COOLDOWN_MS) return;
  const url = themeLoader.getSoundUrl(name);
  if (!url) return;
  lastSoundTime = now;
  sendToRenderer("play-sound", url);
}

// Sync input window position to match render window's hitbox.
// Called manually after every win position/size change + event-level safety net.
let _lastHitW = 0, _lastHitH = 0;
function syncHitWin() {
  if (!hitWin || hitWin.isDestroyed() || !win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  const hit = getHitRectScreen(bounds);
  const x = Math.round(hit.left);
  const y = Math.round(hit.top);
  const w = Math.round(hit.right - hit.left);
  const h = Math.round(hit.bottom - hit.top);
  if (w <= 0 || h <= 0) return;
  hitWin.setBounds({ x, y, width: w, height: h });
  // Update shape if hitbox dimensions changed (e.g. after resize)
  if (w !== _lastHitW || h !== _lastHitH) {
    _lastHitW = w; _lastHitH = h;
    hitWin.setShape([{ x: 0, y: 0, width: w, height: h }]);
  }
}

// ── Mini Mode — delegated to src/mini.js ──
// Initialized after state module (needs applyState, resolveDisplayState, etc.)
// See _mini initialization below


// ── Permission bubble — delegated to src/permission.js ──
const _permCtx = {
  get win() { return win; },
  get lang() { return lang; },
  get bubbleFollowPet() { return bubbleFollowPet; },
  get permDebugLog() { return permDebugLog; },
  get doNotDisturb() { return doNotDisturb; },
  get hideBubbles() { return hideBubbles; },
  get petHidden() { return petHidden; },
  getNearestWorkArea,
  getHitRectScreen,
  guardAlwaysOnTop,
  reapplyMacVisibility,
  focusTerminalForSession: (sessionId) => {
    const s = sessions.get(sessionId);
    if (s && s.sourcePid) focusTerminalWindow(s.sourcePid, s.cwd, s.editor, s.pidChain);
  },
};
const _perm = require("./permission")(_permCtx);
const { showPermissionBubble, resolvePermissionEntry, sendPermissionResponse, repositionBubbles, permLog, PASSTHROUGH_TOOLS, showCodexNotifyBubble, clearCodexNotifyBubbles, syncPermissionShortcuts, replyOpencodePermission } = _perm;
pendingPermissions = _perm.pendingPermissions;
let permDebugLog = null; // set after app.whenReady()
let updateDebugLog = null; // set after app.whenReady()

// ── State machine — delegated to src/state.js ──
const _stateCtx = {
  get theme() { return activeTheme; },
  get legacyProfile() { return riosLegacyProfile; },
  get win() { return win; },
  get hitWin() { return hitWin; },
  get doNotDisturb() { return doNotDisturb; },
  set doNotDisturb(v) { doNotDisturb = v; },
  get miniMode() { return _mini.getMiniMode(); },
  get miniTransitioning() { return _mini.getMiniTransitioning(); },
  get mouseOverPet() { return mouseOverPet; },
  get miniSleepPeeked() { return _mini.getMiniSleepPeeked(); },
  set miniSleepPeeked(v) { _mini.setMiniSleepPeeked(v); },
  get idlePaused() { return idlePaused; },
  set idlePaused(v) { idlePaused = v; },
  get forceEyeResend() { return forceEyeResend; },
  set forceEyeResend(v) { forceEyeResend = v; },
  get mouseStillSince() { return _tick ? _tick._mouseStillSince : Date.now(); },
  get pendingPermissions() { return pendingPermissions; },
  get showSessionId() { return showSessionId; },
  sendToRenderer,
  sendToHitWin,
  syncHitWin,
  playSound,
  t: (key) => t(key),
  focusTerminalWindow: (...args) => focusTerminalWindow(...args),
  resolvePermissionEntry: (...args) => resolvePermissionEntry(...args),
  miniPeekIn: () => miniPeekIn(),
  miniPeekOut: () => miniPeekOut(),
  buildContextMenu: () => buildContextMenu(),
  buildTrayMenu: () => buildTrayMenu(),
};
const _state = require("./state")(_stateCtx);
const { setState, applyState, updateSession, resolveDisplayState, getSvgOverride,
        enableDoNotDisturb, disableDoNotDisturb, startStaleCleanup, stopStaleCleanup,
        startWakePoll, stopWakePoll, detectRunningAgentProcesses, buildSessionSubmenu,
        startStartupRecovery: _startStartupRecovery } = _state;
const sessions = _state.sessions;
const STATE_SVGS = _state.STATE_SVGS;
const STATE_PRIORITY = _state.STATE_PRIORITY;

// ── Hit-test: SVG bounding box → screen coordinates ──
function getHitRectScreen(bounds) {
  const clampRectToBounds = (rect, minW = 24, minH = 24) => {
    const boundLeft = bounds.x;
    const boundTop = bounds.y;
    const boundRight = bounds.x + bounds.width;
    const boundBottom = bounds.y + bounds.height;
    const safeMinW = Math.max(8, Math.min(minW, Math.max(8, bounds.width - 2)));
    const safeMinH = Math.max(8, Math.min(minH, Math.max(8, bounds.height - 2)));

    let left = Number.isFinite(rect.left) ? rect.left : boundLeft;
    let top = Number.isFinite(rect.top) ? rect.top : boundTop;
    let right = Number.isFinite(rect.right) ? rect.right : boundRight;
    let bottom = Number.isFinite(rect.bottom) ? rect.bottom : boundBottom;

    left = Math.max(boundLeft, Math.min(left, boundRight - safeMinW));
    top = Math.max(boundTop, Math.min(top, boundBottom - safeMinH));
    right = Math.max(left + safeMinW, Math.min(right, boundRight));
    bottom = Math.max(top + safeMinH, Math.min(bottom, boundBottom));

    if (right - left < safeMinW || bottom - top < safeMinH) {
      const cx = bounds.x + (bounds.width / 2);
      const cy = bounds.y + (bounds.height / 2);
      left = Math.max(boundLeft, Math.min(cx - safeMinW / 2, boundRight - safeMinW));
      top = Math.max(boundTop, Math.min(cy - safeMinH / 2, boundBottom - safeMinH));
      right = left + safeMinW;
      bottom = top + safeMinH;
    }

    return { left, top, right, bottom };
  };

  const expandRect = (rect, padX, padY) => ({
    left: rect.left - padX,
    top: rect.top - padY,
    right: rect.right + padX,
    bottom: rect.bottom + padY,
  });

  const conservativeFallbackRect = () => {
    const insetX = Math.max(18, Math.round((bounds.width || 0) * 0.26));
    const insetTop = Math.max(16, Math.round((bounds.height || 0) * 0.22));
    const insetBottom = Math.max(16, Math.round((bounds.height || 0) * 0.16));
    return clampRectToBounds({
      left: bounds.x + insetX,
      top: bounds.y + insetTop,
      right: bounds.x + bounds.width - insetX,
      bottom: bounds.y + bounds.height - insetBottom,
    }, 44, 38);
  };

  try {
    const obj = getObjRect(bounds);
    const vb = activeTheme.viewBox;
    const scale = Math.min(obj.w, obj.h) / vb.width;
    const offsetX = obj.x + (obj.w - vb.width * scale) / 2;
    const offsetY = obj.y + (obj.h - vb.height * scale) / 2;
    const hb = _state.getCurrentHitBox();
    const preciseRect = {
      left: offsetX + (hb.x + -vb.x) * scale,
      top: offsetY + (hb.y + -vb.y) * scale,
      right: offsetX + (hb.x + -vb.x + hb.w) * scale,
      bottom: offsetY + (hb.y + -vb.y + hb.h) * scale,
    };
    if ((preciseRect.right - preciseRect.left) > 12 && (preciseRect.bottom - preciseRect.top) > 12) {
      // Dashboard mode keeps a small safety padding for easier hover/drag,
      // while avoiding the oversized fallback rectangle that blocks desktop clicks.
      if (isRiosDashboardMode) {
        const padX = Math.max(6, Math.round((bounds.width || 0) * 0.03));
        const padY = Math.max(6, Math.round((bounds.height || 0) * 0.03));
        return clampRectToBounds(expandRect(preciseRect, padX, padY), 40, 34);
      }
      return clampRectToBounds(preciseRect, 24, 24);
    }
  } catch {}

  return conservativeFallbackRect();
}

// ── Main tick — delegated to src/tick.js ──
const _tickCtx = {
  get theme() { return activeTheme; },
  get win() { return win; },
  get currentState() { return _state.getCurrentState(); },
  get currentSvg() { return _state.getCurrentSvg(); },
  get miniMode() { return _mini.getMiniMode(); },
  get miniTransitioning() { return _mini.getMiniTransitioning(); },
  get dragLocked() { return dragLocked; },
  get menuOpen() { return menuOpen; },
  get idlePaused() { return idlePaused; },
  get isAnimating() { return _mini.getIsAnimating(); },
  get miniSleepPeeked() { return _mini.getMiniSleepPeeked(); },
  set miniSleepPeeked(v) { _mini.setMiniSleepPeeked(v); },
  get mouseOverPet() { return mouseOverPet; },
  set mouseOverPet(v) { mouseOverPet = v; },
  get forceEyeResend() { return forceEyeResend; },
  set forceEyeResend(v) { forceEyeResend = v; },
  get startupRecoveryActive() { return _state.getStartupRecoveryActive(); },
  sendToRenderer,
  sendToHitWin,
  setState,
  applyState,
  miniPeekIn: () => miniPeekIn(),
  miniPeekOut: () => miniPeekOut(),
  getObjRect,
  getHitRectScreen,
};
const _tick = require("./tick")(_tickCtx);
const { startMainTick, resetIdleTimer } = _tick;

// ── Terminal focus — delegated to src/focus.js ──
const _focus = require("./focus")({ _allowSetForeground });
const { initFocusHelper, killFocusHelper, focusTerminalWindow, clearMacFocusCooldownTimer } = _focus;

// ── HTTP server — delegated to src/server.js ──
const _serverCtx = {
  get autoStartWithClaude() { return autoStartWithClaude; },
  get doNotDisturb() { return doNotDisturb; },
  get hideBubbles() { return hideBubbles; },
  get pendingPermissions() { return pendingPermissions; },
  get PASSTHROUGH_TOOLS() { return PASSTHROUGH_TOOLS; },
  get STATE_SVGS() { return STATE_SVGS; },
  get sessions() { return sessions; },
  setState,
  updateSession,
  resolvePermissionEntry,
  sendPermissionResponse,
  showPermissionBubble,
  replyOpencodePermission,
  permLog,
};
const _server = require("./server")(_serverCtx);
const { startHttpServer, getHookServerPort } = _server;

function updateLog(msg) {
  if (!updateDebugLog) return;
  const { rotatedAppend } = require("./log-rotate");
  rotatedAppend(updateDebugLog, `[${new Date().toISOString()}] ${msg}\n`);
}

const dashboardBridge = createDashboardBridge({
  config: {
    ...dashboardRuntimeConfig,
    legacyProfile: riosLegacyProfile,
  },
  env: process.env,
  isWin,
  openExternal: (url) => shell.openExternal(url),
  updateSession,
  onQuickTaskDataChanged: () => {
    if (quickTaskPanel) quickTaskPanel.refreshDataIfVisible();
    pushPetStatsToRenderer();
  },
  logger: console,
});

if (dashboardBridge && typeof dashboardBridge.setDashboardTheme === "function") {
  dashboardBridge.setDashboardTheme(buildDashboardThemePayload(activeTheme));
}

quickTaskPanel = createQuickTaskPanelController({
  enabled: isRiosDashboardMode,
  BrowserWindow,
  screen,
  isLinux,
  isMac,
  isWin,
  linuxWindowType: LINUX_WINDOW_TYPE,
  winTopmostLevel: windowPolicy.winTopmostLevel,
  preloadPath: path.join(__dirname, "preload-quick-tasks.js"),
  htmlPath: path.join(__dirname, "quick-tasks.html"),
  isQuitting: () => isQuitting,
  isPetHidden: () => petHidden,
  getPetWindow: () => (hitWin && !hitWin.isDestroyed() ? hitWin : win),
  getQuickTaskPayload: () => dashboardBridge.getQuickTaskPayload(),
  getQuickTaskTheme: () => (activeTheme && activeTheme.quickTaskCard) ? activeTheme.quickTaskCard : null,
  reapplyMacVisibility,
  guardAlwaysOnTop,
});

petReminder = createPetReminderController({
  enabled: isRiosDashboardMode && riosLegacyProfile.wellnessReminderEnabled !== false,
  BrowserWindow,
  screen,
  isLinux,
  isMac,
  isWin,
  linuxWindowType: LINUX_WINDOW_TYPE,
  winTopmostLevel: windowPolicy.winTopmostLevel,
  preloadPath: path.join(__dirname, "preload-reminder.js"),
  htmlPath: path.join(__dirname, "reminder.html"),
  isQuitting: () => isQuitting,
  isPetHidden: () => petHidden,
  isDoNotDisturb: () => doNotDisturb,
  isReminderMuted: () => wellnessReminderMuted,
  getReminderTheme: () => (activeTheme && activeTheme.reminderCard) ? activeTheme.reminderCard : null,
  getPetWindow: () => (hitWin && !hitWin.isDestroyed() ? hitWin : win),
  getQuickTaskPayload: () => dashboardBridge.getQuickTaskPayload(),
  reapplyMacVisibility,
  guardAlwaysOnTop,
  intervalMs: riosLegacyProfile.wellnessReminderIntervalMs,
  startupDelayMs: riosLegacyProfile.wellnessReminderStartupDelayMs,
  visibleDurationMs: riosLegacyProfile.wellnessReminderDurationMs,
});

// ── Menu — delegated to src/menu.js ──
const _menuCtx = {
  get win() { return win; },
  get sessions() { return sessions; },
  get currentSize() { return currentSize; },
  set currentSize(v) { currentSize = v; },
  get doNotDisturb() { return doNotDisturb; },
  get lang() { return lang; },
  set lang(v) { lang = v; },
  get showTray() { return showTray; },
  set showTray(v) { showTray = v; },
  get showDock() { return showDock; },
  set showDock(v) { showDock = v; },
  get autoStartWithClaude() { return autoStartWithClaude; },
  set autoStartWithClaude(v) { autoStartWithClaude = v; },
  get bubbleFollowPet() { return bubbleFollowPet; },
  set bubbleFollowPet(v) { bubbleFollowPet = v; },
  get hideBubbles() { return hideBubbles; },
  set hideBubbles(v) { hideBubbles = v; syncPermissionShortcuts(); },
  get showSessionId() { return showSessionId; },
  set showSessionId(v) { showSessionId = v; },
  get soundMuted() { return soundMuted; },
  set soundMuted(v) { soundMuted = v; },
  hasQuickTaskPanel: () => !!quickTaskPanel,
  openQuickTaskPanel: () => {
    if (!quickTaskPanel) return;
    quickTaskPanel.show({ pinned: true, immediate: true });
  },
  closeQuickTaskPanel: () => {
    if (!quickTaskPanel) return;
    quickTaskPanel.closePanel();
  },
  canToggleWellnessReminder: () => !!petReminder,
  get wellnessReminderEnabled() { return !!petReminder && !wellnessReminderMuted; },
  setWellnessReminderEnabled: (enabled) => {
    wellnessReminderMuted = !enabled;
    if (!petReminder) return;
    if (wellnessReminderMuted) {
      petReminder.hide(true);
    } else {
      petReminder.triggerNow();
    }
  },
  triggerWellnessReminderNow: () => {
    if (petReminder) petReminder.triggerNow();
  },
  get pendingPermissions() { return pendingPermissions; },
  repositionBubbles: () => repositionBubbles(),
  get petHidden() { return petHidden; },
  togglePetVisibility: () => togglePetVisibility(),
  get isQuitting() { return isQuitting; },
  set isQuitting(v) { isQuitting = v; },
  get menuOpen() { return menuOpen; },
  set menuOpen(v) { menuOpen = v; },
  get tray() { return tray; },
  set tray(v) { tray = v; },
  get contextMenuOwner() { return contextMenuOwner; },
  set contextMenuOwner(v) { contextMenuOwner = v; },
  get contextMenu() { return contextMenu; },
  set contextMenu(v) { contextMenu = v; },
  enableDoNotDisturb: () => enableDoNotDisturb(),
  disableDoNotDisturb: () => disableDoNotDisturb(),
  enterMiniViaMenu: () => enterMiniViaMenu(),
  exitMiniMode: () => exitMiniMode(),
  getMiniMode: () => _mini.getMiniMode(),
  getMiniTransitioning: () => _mini.getMiniTransitioning(),
  miniHandleResize: (sizeKey) => _mini.handleResize(sizeKey),
  focusTerminalWindow: (...args) => focusTerminalWindow(...args),
  checkForUpdates: (...args) => checkForUpdates(...args),
  getUpdateMenuItem: () => getUpdateMenuItem(),
  buildSessionSubmenu: () => buildSessionSubmenu(),
  savePrefs,
  syncHitWin,
  getCurrentPixelSize,
  isProportionalMode,
  PROPORTIONAL_RATIOS,
  getHookServerPort: () => getHookServerPort(),
  clampToScreen,
  getNearestWorkArea,
  reapplyMacVisibility,
  openDashboard: () => dashboardBridge.openDashboard(),
  get isRiosDashboardMode() { return isRiosDashboardMode; },
  switchTheme: (id) => switchTheme(id),
  discoverThemes: () => themeLoader.discoverThemes(),
  getActiveThemeId: () => activeTheme ? activeTheme._id : "clawd",
  ensureUserThemesDir: () => themeLoader.ensureUserThemesDir(),
};
const _menu = require("./menu")(_menuCtx);
const { t, buildContextMenu, buildTrayMenu, rebuildAllMenus, createTray,
        showPetContextMenu, popupMenuAt, ensureContextMenuOwner,
        requestAppQuit, resizeWindow, applyDockVisibility } = _menu;

const quickTaskShortcut = createQuickTaskShortcutController({
  globalShortcut,
  getQuickTaskPanel: () => quickTaskPanel,
  enabled: isRiosDashboardMode,
});

const onboarding = createOnboardingController({
  Notification,
  flagPath: path.join(app.getPath("userData"), "gowin-onboarded.flag"),
  isDoNotDisturb: () => doNotDisturb,
  isPetHidden: () => petHidden,
});

petVisibility = createPetVisibilityController({
  isLinux,
  globalShortcut,
  getMainWindow: () => win,
  getHitWindow: () => hitWin,
  getQuickTaskWindow: () => (quickTaskPanel ? quickTaskPanel.getWindow() : null),
  getReminderWindow: () => (petReminder ? petReminder.getWindow() : null),
  getPendingPermissions: () => pendingPermissions,
  isMiniTransitioning: () => _mini.getMiniTransitioning(),
  reapplyMacVisibility,
  syncPermissionShortcuts: () => syncPermissionShortcuts(),
  rebuildMenus: () => {
    buildTrayMenu();
    buildContextMenu();
  },
  getPetHidden: () => petHidden,
  setPetHidden: (next) => {
    petHidden = next;
  },
});

// ── Auto-updater — delegated to src/updater.js ──
const _updaterCtx = {
  get doNotDisturb() { return doNotDisturb; },
  get miniMode() { return _mini.getMiniMode(); },
  t, rebuildAllMenus, updateLog,
};
const _updater = require("./updater")(_updaterCtx);
const { setupAutoUpdater, checkForUpdates, getUpdateMenuItem, getUpdateMenuLabel } = _updater;

function createWindow() {
  const runtimeWindows = createWindowRuntimeEntry({
    core: {
      BrowserWindow,
      pathModule: path,
      baseDir: __dirname,
      screen,
      isMac,
      isLinux,
      isWin,
      linuxWindowType: LINUX_WINDOW_TYPE,
      winTopmostLevel: windowPolicy.winTopmostLevel,
      sizePresets: SIZES,
      isRiosDashboardMode,
      loadPrefs,
      savePrefs,
      isProportionalMode,
      getCurrentPixelSize,
      clampToScreen,
      applyDockVisibility,
      themeLoader,
      hitInteractionConfig: riosLegacyProfile,
      getHitRectScreen,
      reapplyMacVisibility,
      guardAlwaysOnTop,
      startTopmostWatchdog,
      looseClampToDisplays,
    },
    runtimeState: {
      setCurrentSize: (next) => { currentSize = next; },
      setLang: (next) => { lang = next; },
      setShowTray: (next) => { showTray = next; },
      setShowDock: (next) => { showDock = next; },
      setAutoStartWithClaude: (next) => { autoStartWithClaude = next; },
      setBubbleFollowPet: (next) => { bubbleFollowPet = next; },
      setHideBubbles: (next) => { hideBubbles = next; },
      setShowSessionId: (next) => { showSessionId = next; },
      setSoundMuted: (next) => { soundMuted = next; },
      setWellnessReminderMuted: (next) => { wellnessReminderMuted = !!next; },
      getShowTray: () => showTray,
      isQuitting: () => isQuitting,
      getDoNotDisturb: () => doNotDisturb,
      setIdlePaused: (next) => { idlePaused = next; },
      setDragLocked: (next) => { dragLocked = next; },
      setMouseOverPet: (next) => { mouseOverPet = next; },
      bubbleShouldFollowPet: () => bubbleFollowPet,
      bubbleHasPending: () => pendingPermissions.length > 0,
      bubbleReposition: () => repositionBubbles(),
    },
    controllers: {
      miniController: {
        restoreFromPrefs: (prefs, size) => _mini.restoreFromPrefs(prefs, size),
        getMiniMode: () => _mini.getMiniMode(),
        getMiniTransitioning: () => _mini.getMiniTransitioning(),
        checkMiniModeSnap: () => checkMiniModeSnap(),
        exitMiniMode: () => exitMiniMode(),
        getMiniEdge: () => _mini.getMiniEdge(),
        handleDisplayChange: () => _mini.handleDisplayChange(),
      },
      stateController: {
        getCurrentState: () => _state.getCurrentState(),
        getCurrentSvg: () => _state.getCurrentSvg(),
        getSvgOverride: (...args) => getSvgOverride(...args),
        applyState: (...args) => applyState(...args),
        resolveDisplayState: (...args) => resolveDisplayState(...args),
        detectRunningAgentProcesses: (...args) => detectRunningAgentProcesses(...args),
        startStartupRecovery: (...args) => _startStartupRecovery(...args),
        buildSessionSubmenu: (...args) => buildSessionSubmenu(...args),
        sessions,
        STATE_PRIORITY,
      },
      permissionController: {
        handleBubbleHeight: (event, height) => _perm.handleBubbleHeight(event, height),
        handleDecide: (event, behavior) => _perm.handleDecide(event, behavior),
      },
    },
    services: {
      quickTaskPanel,
      petReminder,
      dashboardBridge,
      menu: {
        buildContextMenu,
        createTray,
        ensureContextMenuOwner,
        showPetContextMenu,
      },
      focusTerminalWindow,
      popupMenuAt,
      lifecycle: {
        initFocusHelper,
        startMainTick,
        startHttpServer,
        startStaleCleanup,
        resetIdleTimer,
      },
    },
    io: {
      sendToRenderer,
      sendToHitWin,
      syncHitWindow: syncHitWin,
      pushPetStats: pushPetStatsToRenderer,
    },
    electron: {
      ipcMain,
      Menu,
    },
  });
  win = runtimeWindows.mainWindow;
  hitWin = runtimeWindows.hitWindow;
  if (petReminder) petReminder.start();
}

// ── Mini Mode — initialized here after state module ──
const _miniCtx = {
  get theme() { return activeTheme; },
  screen,
  get win() { return win; },
  get currentSize() { return currentSize; },
  get doNotDisturb() { return doNotDisturb; },
  set doNotDisturb(v) { doNotDisturb = v; },
  SIZES,
  getCurrentPixelSize,
  isProportionalMode,
  sendToRenderer,
  sendToHitWin,
  syncHitWin,
  applyState,
  resolveDisplayState,
  getSvgOverride,
  stopWakePoll,
  clampToScreen,
  getNearestWorkArea,
  get bubbleFollowPet() { return bubbleFollowPet; },
  get pendingPermissions() { return pendingPermissions; },
  repositionBubbles: () => repositionBubbles(),
  buildContextMenu: () => buildContextMenu(),
  buildTrayMenu: () => buildTrayMenu(),
};
const _mini = require("./mini")(_miniCtx);
const { enterMiniMode, exitMiniMode, enterMiniViaMenu, miniPeekIn, miniPeekOut,
        checkMiniModeSnap, cancelMiniTransition, animateWindowX, animateWindowParabola } = _mini;
miniAnimatingGetter = () => _mini.getIsAnimating();

// ── Theme switching ──
function switchTheme(themeId) {
  const changed = runtimeStateStore.switchTheme({
    themeId,
    getActiveTheme: () => activeTheme,
    setActiveTheme: (next) => { activeTheme = next; },
    getMainWindow: () => win,
    getHitWindow: () => hitWin,
    modulesApi: {
      stateCleanup: () => _state.cleanup(),
      tickCleanup: () => _tick.cleanup(),
      miniCleanup: () => _mini.cleanup(),
      startMainTick,
    },
    miniApi: {
      getMiniMode: () => _mini.getMiniMode(),
      exitMiniMode: () => _mini.exitMiniMode(),
    },
    displayApi: {
      resolveDisplayState,
      getSvgOverride,
    },
    rendererApi: {
      sendToRenderer,
      syncHitWindow: () => syncHitWin(),
    },
    persistPrefs: () => savePrefs(),
    rebuildMenus: () => rebuildAllMenus(),
  });
  if (!changed) return;
  if (dashboardBridge && typeof dashboardBridge.setDashboardTheme === "function") {
    dashboardBridge.setDashboardTheme(buildDashboardThemePayload(activeTheme));
  }
  if (quickTaskPanel && typeof quickTaskPanel.refreshDataIfVisible === "function") {
    quickTaskPanel.refreshDataIfVisible();
  }
}

// ── Single instance lock / app lifecycle bootstrap ──
setupMainLifecycle({
  core: {
    app,
    pathModule: path,
    isMac,
    isLinux,
    loadPrefs,
    reapplyMacVisibility,
  },
  windows: {
    getMainWindow: () => win,
    getHitWindow: () => hitWin,
    createWindow,
    registerToggleShortcut,
    maybeShowOnboarding: () => onboarding.maybeShow(),
  },
  updater: {
    setupAutoUpdater,
  },
  runtime: {
    setPermDebugLog: (next) => { permDebugLog = next; },
    setUpdateDebugLog: (next) => { updateDebugLog = next; },
    setIsQuitting: (next) => { isQuitting = next; },
    isQuitting: () => isQuitting,
  },
  lifecycle: {
    onBeforeQuit: createBeforeQuitHandler({
      dashboardBridge,
      savePrefs,
      unregisterToggleShortcut,
      globalShortcut,
      permissionController: _perm,
      serverController: _server,
      stateController: _state,
      tickController: _tick,
      miniController: _mini,
      getCodexMonitor: () => _codexMonitor,
      getGeminiMonitor: () => _geminiMonitor,
      windowPolicy,
      focusController: _focus,
      getHitWindow: () => hitWin,
      quickTaskPanel,
      petReminder,
    }),
  },
  monitors: createAgentMonitorHooks({
    isRiosDashboardMode,
    dashboardBridge,
    updateSession,
    showCodexNotifyBubble,
    clearCodexNotifyBubbles,
    setCodexMonitor: (monitor) => { _codexMonitor = monitor; },
    setGeminiMonitor: (monitor) => { _geminiMonitor = monitor; },
    installTerminalFocusExtension,
    baseDir: __dirname,
  }),
});
