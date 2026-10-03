function startAgentMonitors({
  isRiosDashboardMode,
  dashboardBridge,
  requireImpl = require,
  onCodexPermission,
  onCodexState,
  onGeminiState,
  setCodexMonitor,
  setGeminiMonitor,
  installTerminalFocusExtension,
  baseDir,
  logger = console,
}) {
  if (isRiosDashboardMode) {
    dashboardBridge.startMonitor();
    return;
  }

  try {
    const CodexLogMonitor = requireImpl("../agents/codex-log-monitor");
    const codexAgent = requireImpl("../agents/codex");
    const codexMonitor = new CodexLogMonitor(codexAgent, (sid, state, event, extra) => {
      if (state === "codex-permission") {
        onCodexPermission(sid, event, extra);
        return;
      }
      onCodexState(sid, state, event, extra);
    });
    codexMonitor.start();
    if (typeof setCodexMonitor === "function") setCodexMonitor(codexMonitor);
  } catch (err) {
    logger.warn("GoWIN!Buddy: Codex log monitor not started:", err.message);
  }

  try {
    const GeminiLogMonitor = requireImpl("../agents/gemini-log-monitor");
    const geminiAgent = requireImpl("../agents/gemini-cli");
    const geminiMonitor = new GeminiLogMonitor(geminiAgent, (sid, state, event, extra) => {
      onGeminiState(sid, state, event, extra);
    });
    geminiMonitor.start();
    if (typeof setGeminiMonitor === "function") setGeminiMonitor(geminiMonitor);
  } catch (err) {
    logger.warn("GoWIN!Buddy: Gemini log monitor not started:", err.message);
  }

  try {
    installTerminalFocusExtension({ baseDir });
  } catch (err) {
    logger.warn("GoWIN!Buddy: failed to auto-install terminal-focus extension:", err.message);
  }
}

function setupAppBootstrap({
  app,
  path,
  isMac,
  isLinux,
  loadPrefs,
  getMainWindow,
  getHitWindow,
  reapplyMacVisibility,
  createWindow,
  setupAutoUpdater,
  setPermDebugLog,
  setUpdateDebugLog,
  setIsQuitting,
  isQuitting,
  onBeforeQuit,
  startAgentMonitorsArgs,
  startAgentMonitorsImpl = startAgentMonitors,
}) {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
    return false;
  }

  app.on("second-instance", () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.showInactive();
      if (isLinux) win.setSkipTaskbar(true);
    }
    const hitWin = getHitWindow();
    if (hitWin && !hitWin.isDestroyed()) {
      hitWin.showInactive();
      if (isLinux) hitWin.setSkipTaskbar(true);
    }
    reapplyMacVisibility();
  });

  if (isMac && app.dock) {
    const prefs = loadPrefs();
    if (prefs && prefs.showDock === false) {
      app.dock.hide();
    }
  }

  app.whenReady().then(() => {
    const userData = app.getPath("userData");
    setPermDebugLog(path.join(userData, "permission-debug.log"));
    setUpdateDebugLog(path.join(userData, "update-debug.log"));
    createWindow();
    startAgentMonitorsImpl(startAgentMonitorsArgs);
    setupAutoUpdater();
  });

  app.on("before-quit", () => {
    setIsQuitting(true);
    onBeforeQuit();
  });

  app.on("window-all-closed", () => {
    if (!isQuitting()) return;
    app.quit();
  });

  return true;
}

module.exports = {
  startAgentMonitors,
  setupAppBootstrap,
};
