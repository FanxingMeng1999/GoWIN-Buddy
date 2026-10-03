function getNearestWorkArea(screen, cx, cy) {
  const displays = screen.getAllDisplays();
  let nearest = displays[0].workArea;
  let minDist = Infinity;
  for (const display of displays) {
    const area = display.workArea;
    const dx = Math.max(area.x - cx, 0, cx - (area.x + area.width));
    const dy = Math.max(area.y - cy, 0, cy - (area.y + area.height));
    const dist = dx * dx + dy * dy;
    if (dist < minDist) {
      minDist = dist;
      nearest = area;
    }
  }
  return nearest;
}

function looseClampToDisplays(screen, x, y, width, height) {
  const displays = screen.getAllDisplays();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const display of displays) {
    const area = display.workArea;
    if (area.x < minX) minX = area.x;
    if (area.y < minY) minY = area.y;
    if (area.x + area.width > maxX) maxX = area.x + area.width;
    if (area.y + area.height > maxY) maxY = area.y + area.height;
  }
  const margin = Math.round(width * 0.25);
  return {
    x: Math.max(minX - margin, Math.min(x, maxX - width + margin)),
    y: Math.max(minY - margin, Math.min(y, maxY - height + margin)),
  };
}

function clampToScreen(screen, x, y, width, height) {
  const nearest = getNearestWorkArea(screen, x + width / 2, y + height / 2);
  const inset = 12;
  const maxX = nearest.x + nearest.width - width - inset;
  const maxY = nearest.y + nearest.height - height - inset;
  return {
    x: maxX >= nearest.x + inset
      ? Math.max(nearest.x + inset, Math.min(x, maxX))
      : nearest.x + Math.max(0, Math.round((nearest.width - width) / 2)),
    y: maxY >= nearest.y + inset
      ? Math.max(nearest.y + inset, Math.min(y, maxY))
      : nearest.y + Math.max(0, Math.round((nearest.height - height) / 2)),
  };
}

function attachWindowLifecycle(ctx) {
  const {
    screen,
    getMainWindow,
    miniApi,
    displayApi,
    runtimeState,
    windowApi,
    rendererApi,
    lifecycleApi,
    reapplyMacVisibility,
    guardAlwaysOnTop,
    startTopmostWatchdog,
    isProportionalMode,
  } = ctx;

  const safeStart = (label, fn) => {
    try {
      fn();
    } catch (err) {
      console.error(`window-orchestrator: lifecycle step failed (${label}):`, err && err.message ? err.message : err);
    }
  };

  safeStart("initFocusHelper", () => lifecycleApi.initFocusHelper());
  safeStart("startMainTick", () => lifecycleApi.startMainTick());
  safeStart("startHttpServer", () => lifecycleApi.startHttpServer());
  safeStart("startStaleCleanup", () => lifecycleApi.startStaleCleanup());

  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;

  win.webContents.on("did-finish-load", () => {
    if (miniApi.getMiniMode()) {
      rendererApi.sendToRenderer("mini-mode-change", true, miniApi.getMiniEdge());
      rendererApi.sendToHitWin("hit-state-sync", { miniMode: true });
    }
    if (runtimeState.getDoNotDisturb()) {
      rendererApi.sendToRenderer("dnd-change", true);
      rendererApi.sendToHitWin("hit-state-sync", { dndEnabled: true });
      if (miniApi.getMiniMode()) {
        displayApi.applyState("mini-sleep");
      } else {
        displayApi.applyState("sleeping");
      }
    } else if (miniApi.getMiniMode()) {
      displayApi.applyState("mini-idle");
    } else if (displayApi.getSessionCount() > 0) {
      const resolved = displayApi.resolveDisplayState();
      displayApi.applyState(resolved, displayApi.getSvgOverride(resolved));
    } else {
      displayApi.applyState("idle", displayApi.getSvgOverride("idle"));
      setTimeout(() => {
        if (displayApi.getSessionCount() > 0 || runtimeState.getDoNotDisturb()) return;
        displayApi.detectRunningAgentProcesses((found) => {
          if (found && displayApi.getSessionCount() === 0 && !runtimeState.getDoNotDisturb()) {
            displayApi.startStartupRecovery();
            lifecycleApi.resetIdleTimer();
          }
        });
      }, 5000);
    }
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer crashed:", details.reason);
    runtimeState.setDragLocked(false);
    runtimeState.setIdlePaused(false);
    runtimeState.setMouseOverPet(false);
    win.webContents.reload();
  });

  guardAlwaysOnTop(win);
  startTopmostWatchdog();

  screen.on("display-metrics-changed", () => {
    reapplyMacVisibility();
    const targetWin = getMainWindow();
    if (!targetWin || targetWin.isDestroyed()) return;
    if (miniApi.getMiniMode()) {
      miniApi.handleDisplayChange();
      return;
    }
    const size = windowApi.getCurrentPixelSize();
    const { x, y } = targetWin.getBounds();
    const clamped = windowApi.clampToScreen(x, y, size.width, size.height);
    if (isProportionalMode() || clamped.x !== x || clamped.y !== y) {
      targetWin.setBounds({ ...clamped, width: size.width, height: size.height });
      windowApi.syncHitWindow();
    }
  });

  screen.on("display-removed", () => {
    reapplyMacVisibility();
    const targetWin = getMainWindow();
    if (!targetWin || targetWin.isDestroyed()) return;
    if (miniApi.getMiniMode()) {
      miniApi.exitMiniMode();
      return;
    }
    const size = windowApi.getCurrentPixelSize();
    const { x, y } = targetWin.getBounds();
    const clamped = windowApi.clampToScreen(x, y, size.width, size.height);
    targetWin.setBounds({ ...clamped, width: size.width, height: size.height });
    windowApi.syncHitWindow();
  });

  screen.on("display-added", () => {
    reapplyMacVisibility();
  });
}

function bootstrapWindows(ctx) {
  const {
    BrowserWindow,
    path,
    baseDir,
    screen,
    isMac,
    isLinux,
    isWin,
    linuxWindowType,
    winTopmostLevel,
    sizePresets,
    isRiosDashboardMode,
    loadPrefs,
    savePrefs,
    isProportionalMode,
    getCurrentPixelSize,
    clampToScreen,
    applyDockVisibility,
    themeLoader,
    hitInteractionConfig,
    menuApi,
    quickTaskPanel,
    petReminder,
    miniApi,
    runtimeApi,
    getHitRectScreen,
    reapplyMacVisibility,
    guardAlwaysOnTop,
    syncHitWindow,
    getCurrentSvg,
  } = ctx;

  const prefs = loadPrefs();
  if (prefs && isProportionalMode(prefs.size)) {
    runtimeApi.setCurrentSize(prefs.size);
  } else if (prefs && sizePresets[prefs.size]) {
    const workArea = screen.getPrimaryDisplay().workArea;
    const px = sizePresets[prefs.size].width;
    const ratio = Math.round(px / workArea.width * 100);
    runtimeApi.setCurrentSize(`P:${Math.max(1, Math.min(75, ratio))}`);
  }

  if (prefs && (prefs.lang === "en" || prefs.lang === "zh")) {
    runtimeApi.setLang(prefs.lang);
  }
  if (isMac && prefs) {
    if (typeof prefs.showTray === "boolean") runtimeApi.setShowTray(prefs.showTray);
    if (typeof prefs.showDock === "boolean") runtimeApi.setShowDock(prefs.showDock);
  }
  if (prefs && typeof prefs.autoStartWithClaude === "boolean") runtimeApi.setAutoStartWithClaude(prefs.autoStartWithClaude);
  if (prefs && typeof prefs.bubbleFollowPet === "boolean") runtimeApi.setBubbleFollowPet(prefs.bubbleFollowPet);
  if (prefs && typeof prefs.hideBubbles === "boolean") runtimeApi.setHideBubbles(prefs.hideBubbles);
  if (prefs && typeof prefs.showSessionId === "boolean") runtimeApi.setShowSessionId(prefs.showSessionId);
  if (prefs && typeof prefs.soundMuted === "boolean") runtimeApi.setSoundMuted(prefs.soundMuted);
  if (prefs && typeof prefs.wellnessReminderMuted === "boolean") runtimeApi.setWellnessReminderMuted(prefs.wellnessReminderMuted);

  if (isMac) {
    applyDockVisibility();
  }

  const size = getCurrentPixelSize();
  let startX;
  let startY;
  if (prefs && prefs.miniMode) {
    const miniPos = miniApi.restoreFromPrefs(prefs, size);
    startX = miniPos.x;
    startY = miniPos.y;
  } else if (prefs) {
    const clamped = clampToScreen(prefs.x, prefs.y, size.width, size.height);
    startX = clamped.x;
    startY = clamped.y;
  } else {
    const { workArea } = screen.getPrimaryDisplay();
    startX = workArea.x + workArea.width - size.width - 20;
    startY = workArea.y + workArea.height - size.height - 20;
  }

  const mainWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: startX,
    y: startY,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    enableLargerThanScreen: true,
    ...(isLinux ? { type: linuxWindowType } : {}),
    ...(isMac ? { type: "panel", roundedCorners: false } : {}),
    webPreferences: {
      preload: path.join(baseDir, "preload.js"),
      backgroundThrottling: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [
        "--theme-config=" + JSON.stringify(themeLoader.getRendererConfig()),
      ],
    },
  });

  // Main window is render-only; input is captured by hitWindow.
  // Apply click-through immediately instead of waiting for the tick loop.
  mainWindow.setIgnoreMouseEvents(true);
  mainWindow.setFocusable(false);
  if (isLinux) {
    mainWindow.on("close", (event) => {
      if (!runtimeApi.isQuitting()) {
        event.preventDefault();
        if (!mainWindow.isVisible()) mainWindow.showInactive();
      }
    });
    mainWindow.on("unresponsive", () => {
      if (runtimeApi.isQuitting()) return;
      console.warn("GoWIN!Buddy: renderer unresponsive — reloading");
      mainWindow.webContents.reload();
    });
  }

  if (isWin) {
    mainWindow.setAlwaysOnTop(true, winTopmostLevel);
  }
  mainWindow.loadFile(path.join(baseDir, "index.html"));
  mainWindow.showInactive();

  {
    const actualBounds = mainWindow.getBounds();
    const visibleBounds = clampToScreen(actualBounds.x, actualBounds.y, size.width, size.height);
    if (visibleBounds.x !== actualBounds.x || visibleBounds.y !== actualBounds.y) {
      mainWindow.setBounds({ ...visibleBounds, width: size.width, height: size.height });
      savePrefs();
    }
  }
  if (isLinux) mainWindow.setSkipTaskbar(true);
  reapplyMacVisibility();

  if (isMac) {
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      applyDockVisibility();
    }, 0);
  }

  menuApi.buildContextMenu();
  if (!isMac || runtimeApi.getShowTray()) menuApi.createTray();
  menuApi.ensureContextMenuOwner();
  if (isRiosDashboardMode) quickTaskPanel.ensureCreated();

  const initBounds = mainWindow.getBounds();
  const initHit = getHitRectScreen(initBounds);
  const hx = Math.round(initHit.left);
  const hy = Math.round(initHit.top);
  const hw = Math.round(initHit.right - initHit.left);
  const hh = Math.round(initHit.bottom - initHit.top);

  const hitWindow = new BrowserWindow({
    width: hw,
    height: hh,
    x: hx,
    y: hy,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    enableLargerThanScreen: true,
    ...(isLinux ? { type: linuxWindowType } : {}),
    ...(isMac ? { type: "panel", roundedCorners: false } : {}),
    focusable: !isLinux,
    webPreferences: {
      preload: path.join(baseDir, "preload-hit.js"),
      backgroundThrottling: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [
        "--hit-theme-config=" + JSON.stringify(themeLoader.getHitRendererConfig()),
        "--dashboard-mode=" + (isRiosDashboardMode ? "1" : "0"),
        "--hit-interaction-config=" + JSON.stringify(hitInteractionConfig || {}),
      ],
    },
  });

  hitWindow.setShape([{ x: 0, y: 0, width: hw, height: hh }]);
  hitWindow.setIgnoreMouseEvents(false);
  if (isMac) hitWindow.setFocusable(false);
  hitWindow.showInactive();
  try { hitWindow.moveTop(); } catch {}
  if (isLinux) hitWindow.setSkipTaskbar(true);
  if (isWin) hitWindow.setAlwaysOnTop(true, winTopmostLevel);
  reapplyMacVisibility();
  hitWindow.loadFile(path.join(baseDir, "hit.html"));
  if (isWin) guardAlwaysOnTop(hitWindow);

  const syncHitAndRaise = () => {
    syncHitWindow();
    if (hitWindow && !hitWindow.isDestroyed()) {
      try { hitWindow.moveTop(); } catch {}
    }
  };
  mainWindow.on("move", syncHitAndRaise);
  mainWindow.on("resize", syncHitAndRaise);
  mainWindow.on("move", () => quickTaskPanel.positionWindow());
  mainWindow.on("resize", () => quickTaskPanel.positionWindow());
  if (petReminder && typeof petReminder.positionWindow === "function") {
    mainWindow.on("move", () => petReminder.positionWindow());
    mainWindow.on("resize", () => petReminder.positionWindow());
  }

  hitWindow.webContents.on("did-finish-load", () => {
    runtimeApi.sendToHitWin("hit-state-sync", {
      currentSvg: getCurrentSvg(),
      miniMode: miniApi.getMiniMode(),
      dndEnabled: runtimeApi.getDoNotDisturb(),
    });
  });

  hitWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("hitWin renderer crashed:", details.reason);
    hitWindow.webContents.reload();
  });

  return { mainWindow, hitWindow, prefs };
}

module.exports = {
  getNearestWorkArea,
  looseClampToDisplays,
  clampToScreen,
  bootstrapWindows,
  attachWindowLifecycle,
};
