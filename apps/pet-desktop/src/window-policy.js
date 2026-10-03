function createWindowPolicyManager({
  isMac,
  isWin,
  applyStationaryCollectionBehavior,
  showDock,
  getMainWindow,
  getHitWindow,
  getQuickTaskWindow,
  getContextMenuOwner,
  getPermissionBubbles,
  getDragLocked,
  getMiniAnimating,
  onForceEyeResend,
  syncHitWindow,
  winTopmostLevel = "pop-up-menu",
  macTopmostLevel = "screen-saver",
  topmostWatchdogMs = 10000,
}) {
  let topmostWatchdog = null;
  let hwndRecoveryTimer = null;

  function reapplyMacVisibility() {
    if (!isMac) return;
    const apply = (targetWindow) => {
      if (!targetWindow || targetWindow.isDestroyed()) return;
      targetWindow.setAlwaysOnTop(true, macTopmostLevel);
      if (!applyStationaryCollectionBehavior(targetWindow)) {
        const opts = { visibleOnFullScreen: true };
        if (!showDock()) opts.skipTransformProcessType = true;
        targetWindow.setVisibleOnAllWorkspaces(true, opts);
        applyStationaryCollectionBehavior(targetWindow);
      }
    };

    apply(getMainWindow());
    apply(getHitWindow());
    apply(getQuickTaskWindow());
    for (const bubble of getPermissionBubbles()) {
      apply(bubble);
    }
    apply(getContextMenuOwner());
  }

  function scheduleHwndRecovery() {
    if (!isWin) return;
    if (hwndRecoveryTimer) clearTimeout(hwndRecoveryTimer);
    hwndRecoveryTimer = setTimeout(() => {
      hwndRecoveryTimer = null;
      const mainWindow = getMainWindow();
      const hitWindow = getHitWindow();
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.setAlwaysOnTop(true, winTopmostLevel);
      if (hitWindow && !hitWindow.isDestroyed()) {
        hitWindow.setAlwaysOnTop(true, winTopmostLevel);
      }
      onForceEyeResend();
    }, 1000);
  }

  function guardAlwaysOnTop(targetWindow) {
    if (!isWin || !targetWindow) return;
    targetWindow.on("always-on-top-changed", (_event, isOnTop) => {
      if (isOnTop || targetWindow.isDestroyed()) return;
      targetWindow.setAlwaysOnTop(true, winTopmostLevel);
      const mainWindow = getMainWindow();
      if (targetWindow !== mainWindow || getDragLocked() || getMiniAnimating()) return;
      onForceEyeResend();
      const { x, y } = mainWindow.getBounds();
      mainWindow.setPosition(x + 1, y);
      mainWindow.setPosition(x, y);
      syncHitWindow();
      scheduleHwndRecovery();
    });
  }

  function startTopmostWatchdog() {
    if (!isWin || topmostWatchdog) return;
    topmostWatchdog = setInterval(() => {
      const mainWindow = getMainWindow();
      const hitWindow = getHitWindow();
      const quickTaskWindow = getQuickTaskWindow();

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(true, winTopmostLevel);
      }
      if (hitWindow && !hitWindow.isDestroyed()) {
        hitWindow.setAlwaysOnTop(true, winTopmostLevel);
        try { hitWindow.moveTop(); } catch {}
      }
      if (quickTaskWindow && !quickTaskWindow.isDestroyed() && quickTaskWindow.isVisible()) {
        quickTaskWindow.setAlwaysOnTop(true, winTopmostLevel);
      }
      for (const bubble of getPermissionBubbles()) {
        if (bubble && !bubble.isDestroyed() && bubble.isVisible()) {
          bubble.setAlwaysOnTop(true, winTopmostLevel);
        }
      }
    }, topmostWatchdogMs);
  }

  function stopTopmostWatchdog() {
    if (!topmostWatchdog) return;
    clearInterval(topmostWatchdog);
    topmostWatchdog = null;
  }

  function cleanup() {
    stopTopmostWatchdog();
    if (hwndRecoveryTimer) {
      clearTimeout(hwndRecoveryTimer);
      hwndRecoveryTimer = null;
    }
  }

  return {
    winTopmostLevel,
    macTopmostLevel,
    reapplyMacVisibility,
    guardAlwaysOnTop,
    startTopmostWatchdog,
    stopTopmostWatchdog,
    cleanup,
  };
}

module.exports = {
  createWindowPolicyManager,
};
