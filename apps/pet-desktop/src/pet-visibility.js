const DEFAULT_TOGGLE_SHORTCUT = "CommandOrControl+Shift+Alt+C";

function isAliveWindow(targetWindow) {
  return !!targetWindow && !targetWindow.isDestroyed();
}

function createPetVisibilityController({
  isLinux,
  globalShortcut,
  getMainWindow,
  getHitWindow,
  getQuickTaskWindow,
  getReminderWindow = () => null,
  getPendingPermissions,
  isMiniTransitioning,
  reapplyMacVisibility,
  syncPermissionShortcuts,
  rebuildMenus,
  getPetHidden,
  setPetHidden,
}) {
  function togglePetVisibility() {
    const mainWindow = getMainWindow();
    if (!isAliveWindow(mainWindow)) return;
    if (isMiniTransitioning()) return;

    const hidden = !!getPetHidden();
    const hitWindow = getHitWindow();

    if (hidden) {
      mainWindow.showInactive();
      if (isLinux) mainWindow.setSkipTaskbar(true);

      if (isAliveWindow(hitWindow)) {
        hitWindow.showInactive();
        if (isLinux) hitWindow.setSkipTaskbar(true);
      }

      for (const permission of getPendingPermissions()) {
        const bubble = permission && permission.bubble;
        if (!isAliveWindow(bubble)) continue;
        bubble.showInactive();
        if (isLinux) bubble.setSkipTaskbar(true);
      }

      reapplyMacVisibility();
      setPetHidden(false);
    } else {
      mainWindow.hide();
      if (isAliveWindow(hitWindow)) hitWindow.hide();

      const panelWindow = getQuickTaskWindow();
      if (isAliveWindow(panelWindow)) panelWindow.hide();
      const reminderWindow = getReminderWindow();
      if (isAliveWindow(reminderWindow)) reminderWindow.hide();

      for (const permission of getPendingPermissions()) {
        const bubble = permission && permission.bubble;
        if (!isAliveWindow(bubble)) continue;
        bubble.hide();
      }

      setPetHidden(true);
    }

    syncPermissionShortcuts();
    rebuildMenus();
  }

  function registerToggleShortcut() {
    let result = false;
    try {
      result = globalShortcut.register(DEFAULT_TOGGLE_SHORTCUT, togglePetVisibility);
    } catch (err) {
      console.warn("GoWIN!Buddy: failed to register global shortcut:", err.message);
      return;
    }
    if (result === false) {
      console.warn(
        `GoWIN!Buddy: toggle shortcut "${DEFAULT_TOGGLE_SHORTCUT}" appears to be taken by another application; ` +
        "you can still hide/show the pet from the tray menu."
      );
    }
  }

  function unregisterToggleShortcut() {
    try {
      globalShortcut.unregister(DEFAULT_TOGGLE_SHORTCUT);
    } catch {}
  }

  return {
    defaultShortcut: DEFAULT_TOGGLE_SHORTCUT,
    togglePetVisibility,
    registerToggleShortcut,
    unregisterToggleShortcut,
  };
}

module.exports = {
  createPetVisibilityController,
  DEFAULT_TOGGLE_SHORTCUT,
};
