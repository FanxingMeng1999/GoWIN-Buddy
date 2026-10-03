const { registerIpcRouter } = require("./ipc-router");
const {
  bootstrapWindows,
  attachWindowLifecycle,
} = require("./window-orchestrator");
const { setupAppBootstrap } = require("./app-bootstrap");

function createWindowRuntimeEntry({
  bootstrapWindowsImpl,
  registerIpcRouterImpl,
  attachWindowLifecycleImpl,
  core,
  runtimeState,
  controllers,
  services,
  io,
  electron,
}) {
  const bootstrapWindowsFn = bootstrapWindowsImpl || bootstrapWindows;
  const registerIpcRouterFn = registerIpcRouterImpl || registerIpcRouter;
  const attachWindowLifecycleFn = attachWindowLifecycleImpl || attachWindowLifecycle;
  const {
    BrowserWindow,
    pathModule,
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
    getHitRectScreen,
    reapplyMacVisibility,
    guardAlwaysOnTop,
    startTopmostWatchdog,
    looseClampToDisplays,
  } = core;

  const {
    setCurrentSize,
    setLang,
    setShowTray,
    setShowDock,
    setAutoStartWithClaude,
    setBubbleFollowPet,
    setHideBubbles,
    setShowSessionId,
    setSoundMuted,
    setWellnessReminderMuted,
    getShowTray,
    isQuitting,
    getDoNotDisturb,
    setIdlePaused,
    setDragLocked,
    setMouseOverPet,
    bubbleShouldFollowPet,
    bubbleHasPending,
    bubbleReposition,
  } = runtimeState;

  const {
    miniController,
    stateController,
    permissionController,
  } = controllers;

  const {
    quickTaskPanel,
    petReminder,
    dashboardBridge,
    menu,
    focusTerminalWindow,
    popupMenuAt,
    lifecycle,
  } = services;

  const { sendToRenderer, sendToHitWin, syncHitWindow, pushPetStats } = io;
  const { ipcMain, Menu } = electron;

  const bootstrap = bootstrapWindowsFn({
    BrowserWindow,
    path: pathModule,
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
    menuApi: {
      buildContextMenu: menu.buildContextMenu,
      createTray: menu.createTray,
      ensureContextMenuOwner: menu.ensureContextMenuOwner,
    },
    quickTaskPanel,
    petReminder,
    miniApi: {
      restoreFromPrefs: (prefs, size) => miniController.restoreFromPrefs(prefs, size),
      getMiniMode: () => miniController.getMiniMode(),
    },
    runtimeApi: {
      setCurrentSize,
      setLang,
      setShowTray,
      setShowDock,
      setAutoStartWithClaude,
      setBubbleFollowPet,
      setHideBubbles,
      setShowSessionId,
      setSoundMuted,
      setWellnessReminderMuted,
      getShowTray,
      isQuitting,
      sendToHitWin,
      getDoNotDisturb,
    },
    getHitRectScreen,
    reapplyMacVisibility,
    guardAlwaysOnTop,
    syncHitWindow,
    getCurrentSvg: () => stateController.getCurrentSvg(),
  });

  const mainWindow = bootstrap.mainWindow;
  const hitWindow = bootstrap.hitWindow;

  registerIpcRouterFn({
    ipcMain,
    Menu,
    showPetContextMenu: menu.showPetContextMenu,
    miniApi: {
      getMiniMode: () => miniController.getMiniMode(),
      getMiniTransitioning: () => miniController.getMiniTransitioning(),
      checkMiniModeSnap: () => miniController.checkMiniModeSnap(),
      exitMiniMode: () => miniController.exitMiniMode(),
    },
    windowApi: {
      getMainWindow: () => mainWindow,
      getHitWindow: () => hitWindow,
      getCurrentPixelSize,
      looseClampToDisplays,
      clampToScreen,
      syncHitWindow: () => syncHitWindow(),
    },
    quickTaskPanel,
    dashboardBridge,
    rendererApi: {
      sendToRenderer,
      pushPetStats,
    },
    runtimeState: {
      setIdlePaused,
      setDragLocked,
      setMouseOverPet,
    },
    displayApi: {
      getCurrentState: () => stateController.getCurrentState(),
      getCurrentSvg: () => stateController.getCurrentSvg(),
    },
    sessions: stateController.sessions,
    statePriority: stateController.STATE_PRIORITY,
    focusTerminalWindow,
    popupMenuAt,
    buildSessionSubmenu: () => stateController.buildSessionSubmenu(),
    permissionApi: {
      handleBubbleHeight: (event, height) => permissionController.handleBubbleHeight(event, height),
      handleDecide: (event, behavior) => permissionController.handleDecide(event, behavior),
    },
    isRiosDashboardMode,
    isLinux,
    reapplyMacVisibility,
    bubbleApi: {
      shouldFollowPet: () => bubbleShouldFollowPet(),
      hasPending: () => bubbleHasPending(),
      reposition: () => bubbleReposition(),
    },
  });

  attachWindowLifecycleFn({
    screen,
    getMainWindow: () => mainWindow,
    miniApi: {
      getMiniMode: () => miniController.getMiniMode(),
      getMiniEdge: () => miniController.getMiniEdge(),
      handleDisplayChange: () => miniController.handleDisplayChange(),
      exitMiniMode: () => miniController.exitMiniMode(),
    },
    displayApi: {
      applyState: (...args) => stateController.applyState(...args),
      resolveDisplayState: (...args) => stateController.resolveDisplayState(...args),
      getSvgOverride: (...args) => stateController.getSvgOverride(...args),
      getSessionCount: () => stateController.sessions.size,
      detectRunningAgentProcesses: (...args) => stateController.detectRunningAgentProcesses(...args),
      startStartupRecovery: (...args) => stateController.startStartupRecovery(...args),
    },
    runtimeState: {
      getDoNotDisturb: () => getDoNotDisturb(),
      setDragLocked,
      setIdlePaused,
      setMouseOverPet,
    },
    windowApi: {
      getCurrentPixelSize,
      clampToScreen,
      syncHitWindow: () => syncHitWindow(),
    },
    rendererApi: {
      sendToRenderer,
      sendToHitWin,
    },
    lifecycleApi: {
      initFocusHelper: (...args) => lifecycle.initFocusHelper(...args),
      startMainTick: (...args) => lifecycle.startMainTick(...args),
      startHttpServer: (...args) => lifecycle.startHttpServer(...args),
      startStaleCleanup: (...args) => lifecycle.startStaleCleanup(...args),
      resetIdleTimer: (...args) => lifecycle.resetIdleTimer(...args),
    },
    reapplyMacVisibility,
    guardAlwaysOnTop,
    startTopmostWatchdog,
    isProportionalMode,
  });

  return { mainWindow, hitWindow };
}

function setupMainLifecycle({
  setupAppBootstrapImpl,
  core,
  windows,
  updater,
  runtime,
  lifecycle,
  monitors,
}) {
  const setupAppBootstrapFn = setupAppBootstrapImpl || setupAppBootstrap;
  setupAppBootstrapFn({
    app: core.app,
    path: core.pathModule,
    isMac: core.isMac,
    isLinux: core.isLinux,
    loadPrefs: core.loadPrefs,
    getMainWindow: windows.getMainWindow,
    getHitWindow: windows.getHitWindow,
    reapplyMacVisibility: core.reapplyMacVisibility,
    createWindow: () => {
      windows.createWindow();
      windows.registerToggleShortcut();
      if (typeof windows.maybeShowOnboarding === "function") {
        windows.maybeShowOnboarding();
      }
    },
    setupAutoUpdater: updater.setupAutoUpdater,
    setPermDebugLog: runtime.setPermDebugLog,
    setUpdateDebugLog: runtime.setUpdateDebugLog,
    setIsQuitting: runtime.setIsQuitting,
    isQuitting: runtime.isQuitting,
    onBeforeQuit: lifecycle.onBeforeQuit,
    startAgentMonitorsArgs: {
      isRiosDashboardMode: monitors.isRiosDashboardMode,
      dashboardBridge: monitors.dashboardBridge,
      onCodexPermission: monitors.onCodexPermission,
      onCodexState: monitors.onCodexState,
      onGeminiState: monitors.onGeminiState,
      setCodexMonitor: monitors.setCodexMonitor,
      setGeminiMonitor: monitors.setGeminiMonitor,
      installTerminalFocusExtension: monitors.installTerminalFocusExtension,
      baseDir: monitors.baseDir,
    },
  });
}

function createBeforeQuitHandler({
  dashboardBridge,
  savePrefs,
  unregisterToggleShortcut,
  globalShortcut,
  permissionController,
  serverController,
  stateController,
  tickController,
  miniController,
  getCodexMonitor,
  getGeminiMonitor,
  windowPolicy,
  focusController,
  getHitWindow,
  quickTaskPanel,
  petReminder,
}) {
  return () => {
    dashboardBridge.stopMonitor();
    savePrefs();
    unregisterToggleShortcut();
    globalShortcut.unregisterAll();
    permissionController.cleanup();
    serverController.cleanup();
    stateController.cleanup();
    tickController.cleanup();
    miniController.cleanup();
    const codexMonitor = getCodexMonitor();
    if (codexMonitor) codexMonitor.stop();
    const geminiMonitor = getGeminiMonitor();
    if (geminiMonitor) geminiMonitor.stop();
    windowPolicy.cleanup();
    focusController.cleanup();
    const hitWindow = getHitWindow();
    if (hitWindow && !hitWindow.isDestroyed()) hitWindow.destroy();
    if (quickTaskPanel) quickTaskPanel.destroy();
    if (petReminder) petReminder.destroy();
  };
}

function createAgentMonitorHooks({
  isRiosDashboardMode,
  dashboardBridge,
  updateSession,
  showCodexNotifyBubble,
  clearCodexNotifyBubbles,
  setCodexMonitor,
  setGeminiMonitor,
  installTerminalFocusExtension,
  baseDir,
}) {
  return {
    isRiosDashboardMode,
    dashboardBridge,
    onCodexPermission: (sid, event, extra = {}) => {
      updateSession(sid, "notification", event, null, extra.cwd, null, null, null, "codex");
      showCodexNotifyBubble({
        sessionId: sid,
        command: extra.permissionDetail?.command || "",
      });
    },
    onCodexState: (sid, state, event, extra = {}) => {
      clearCodexNotifyBubbles(sid);
      updateSession(sid, state, event, null, extra.cwd, null, null, null, "codex");
    },
    onGeminiState: (sid, state, event, extra = {}) => {
      updateSession(sid, state, event, null, extra.cwd, null, null, null, "gemini-cli");
    },
    setCodexMonitor,
    setGeminiMonitor,
    installTerminalFocusExtension,
    baseDir,
  };
}

module.exports = {
  createWindowRuntimeEntry,
  setupMainLifecycle,
  createBeforeQuitHandler,
  createAgentMonitorHooks,
};
