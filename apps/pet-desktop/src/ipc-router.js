const fs = require("fs");
const os = require("os");
const path = require("path");
const { rotatedAppend } = require("./log-rotate");

const INTERACTION_LOG_PATH = path.join(
  process.env.GOWIN_USER_DATA_ROOT || path.join(process.env.APPDATA || os.homedir() || process.cwd(), "gowin-buddy-pet"),
  "interaction-debug.log"
);
const INTERACTION_LOG_MAX_BYTES = 512 * 1024;
const INTERACTION_DEBUG_ENABLED = (() => {
  const raw = String(process.env.GOWIN_INTERACTION_DEBUG || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
})();
const interactionLogState = {
  dirReady: false,
  lastByEvent: new Map(),
};

function appendInteractionLog(eventName, payload, options = {}) {
  if (!INTERACTION_DEBUG_ENABLED) return;
  const throttleMs = Number(options.throttleMs) || 0;
  if (throttleMs > 0) {
    const now = Date.now();
    const last = interactionLogState.lastByEvent.get(eventName) || 0;
    if (now - last < throttleMs) return;
    interactionLogState.lastByEvent.set(eventName, now);
  }
  try {
    if (!interactionLogState.dirReady) {
      fs.mkdirSync(path.dirname(INTERACTION_LOG_PATH), { recursive: true });
      interactionLogState.dirReady = true;
    }
    const line = `${new Date().toISOString()} ${eventName}${payload ? ` ${JSON.stringify(payload)}` : ""}\n`;
    rotatedAppend(INTERACTION_LOG_PATH, line, INTERACTION_LOG_MAX_BYTES);
  } catch {}
}

function chooseBestFocusSession(sessions, statePriority) {
  let best = null;
  let bestTime = 0;
  let bestPriority = -1;
  for (const [, session] of sessions) {
    if (!session || !session.sourcePid) continue;
    const priority = statePriority[session.state] || 0;
    if (priority > bestPriority || (priority === bestPriority && session.updatedAt > bestTime)) {
      best = session;
      bestTime = session.updatedAt;
      bestPriority = priority;
    }
  }
  return best;
}

function registerIpcRouter(ctx) {
  const {
    ipcMain,
    Menu,
    showPetContextMenu,
    miniApi,
    windowApi,
    quickTaskPanel,
    dashboardBridge,
    rendererApi,
    runtimeState,
    displayApi,
    sessions,
    statePriority,
    focusTerminalWindow,
    popupMenuAt,
    buildSessionSubmenu,
    permissionApi,
    isRiosDashboardMode,
    isLinux,
    reapplyMacVisibility,
    bubbleApi,
  } = ctx;

  ipcMain.on("show-context-menu", showPetContextMenu);
  appendInteractionLog("router:ready");

  ipcMain.on("move-window-by", (_event, dx, dy) => {
    appendInteractionLog("move-window-by", { dx, dy }, { throttleMs: 120 });
    if (miniApi.getMiniMode() || miniApi.getMiniTransitioning()) return;
    const win = windowApi.getMainWindow();
    if (!win || win.isDestroyed()) return;
    const { x, y } = win.getBounds();
    const size = windowApi.getCurrentPixelSize();
    const nextX = x + dx;
    const nextY = y + dy;
    const looseClamped = windowApi.looseClampToDisplays(nextX, nextY, size.width, size.height);
    win.setBounds({ ...looseClamped, width: size.width, height: size.height });
    windowApi.syncHitWindow();
    if (bubbleApi.shouldFollowPet() && bubbleApi.hasPending()) {
      bubbleApi.reposition();
    }
  });

  ipcMain.on("pause-cursor-polling", () => {
    runtimeState.setIdlePaused(true);
  });

  ipcMain.on("resume-from-reaction", () => {
    runtimeState.setIdlePaused(false);
    if (miniApi.getMiniTransitioning()) return;
    rendererApi.sendToRenderer("state-change", displayApi.getCurrentState(), displayApi.getCurrentSvg());
  });

  ipcMain.on("drag-lock", (_event, locked) => {
    appendInteractionLog("drag-lock", { locked: !!locked });
    const isLocked = !!locked;
    runtimeState.setDragLocked(isLocked);
    if (isLocked) runtimeState.setMouseOverPet(true);
  });

  ipcMain.on("start-drag-reaction", () => rendererApi.sendToRenderer("start-drag-reaction"));
  ipcMain.on("end-drag-reaction", () => rendererApi.sendToRenderer("end-drag-reaction"));
  ipcMain.on("play-click-reaction", (_event, svg, duration) => {
    rendererApi.sendToRenderer("play-click-reaction", svg, duration);
  });

  ipcMain.on("drag-end", () => {
    appendInteractionLog("drag-end");
    if (miniApi.getMiniMode() || miniApi.getMiniTransitioning()) return;
    miniApi.checkMiniModeSnap();
    const win = windowApi.getMainWindow();
    if (!win || win.isDestroyed()) return;
    const size = windowApi.getCurrentPixelSize();
    const { x, y } = win.getBounds();
    const clamped = windowApi.clampToScreen(x, y, size.width, size.height);
    win.setBounds({ ...clamped, width: size.width, height: size.height });
    windowApi.syncHitWindow();
  });

  ipcMain.on("exit-mini-mode", () => {
    if (!miniApi.getMiniMode()) return;
    miniApi.exitMiniMode();
  });

  ipcMain.on("open-dashboard", () => {
    appendInteractionLog("open-dashboard");
    dashboardBridge.openDashboard();
    const win = windowApi.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.showInactive();
      if (isLinux) win.setSkipTaskbar(true);
    }
    const hitWin = windowApi.getHitWindow();
    if (hitWin && !hitWin.isDestroyed()) {
      hitWin.showInactive();
      if (isLinux) hitWin.setSkipTaskbar(true);
    }
    reapplyMacVisibility();
  });

  ipcMain.on("quick-task:hover", (_event, inside) => {
    appendInteractionLog("quick-task:hover", { inside: !!inside });
    quickTaskPanel.setPetHover(inside);
  });

  ipcMain.on("quick-task:hover-panel", (_event, inside) => {
    quickTaskPanel.setPanelHover(inside);
  });

  ipcMain.on("quick-task:close", () => {
    quickTaskPanel.closePanel();
  });

  ipcMain.handle("quick-task:get-data", async () => dashboardBridge.getQuickTaskPayload());
  ipcMain.handle("quick-task:set-quest", async (_event, payload = {}) => dashboardBridge.setQuickTaskQuest(payload));
  ipcMain.handle("quick-task:set-todo", async (_event, payload = {}) => dashboardBridge.setQuickTaskTodo(payload));
  ipcMain.handle("quick-task:add-todo", async (_event, payload = {}) => dashboardBridge.addQuickTaskTodo(payload));
  ipcMain.handle("quick-task:claim-todo", async (_event, payload = {}) => dashboardBridge.claimQuickTaskTodo(payload));
  ipcMain.handle("quick-task:toggle-clock", async () => dashboardBridge.toggleQuickTaskWorkClock());

  ipcMain.on("pet-stats:request", () => {
    if (typeof rendererApi.pushPetStats === "function") rendererApi.pushPetStats();
  });

  ipcMain.on("focus-terminal", () => {
    if (isRiosDashboardMode) {
      dashboardBridge.openDashboard();
      return;
    }
    const best = chooseBestFocusSession(sessions, statePriority);
    if (best) focusTerminalWindow(best.sourcePid, best.cwd, best.editor, best.pidChain);
  });

  ipcMain.on("show-session-menu", () => {
    popupMenuAt(Menu.buildFromTemplate(buildSessionSubmenu()));
  });

  ipcMain.on("bubble-height", (event, height) => permissionApi.handleBubbleHeight(event, height));
  ipcMain.on("permission-decide", (event, behavior) => permissionApi.handleDecide(event, behavior));
}

module.exports = {
  chooseBestFocusSession,
  registerIpcRouter,
};
