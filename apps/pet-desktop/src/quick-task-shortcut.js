const DEFAULT_QUICK_TASK_SHORTCUT = "CommandOrControl+Alt+Q";

function createQuickTaskShortcutController({
  globalShortcut,
  getQuickTaskPanel,
  shortcut = DEFAULT_QUICK_TASK_SHORTCUT,
  enabled = true,
  logger = console,
}) {
  let lastRegisterFailed = false;

  function openQuickTaskPanel() {
    const panel = typeof getQuickTaskPanel === "function" ? getQuickTaskPanel() : null;
    if (!panel || typeof panel.show !== "function") return;
    panel.show({ pinned: true, immediate: true });
  }

  function register() {
    lastRegisterFailed = false;
    if (!enabled) return;
    let result = false;
    try {
      result = globalShortcut.register(shortcut, openQuickTaskPanel);
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      try {
        logger.warn("GoWIN!Buddy: failed to register quick-task shortcut:", message);
      } catch {}
      lastRegisterFailed = true;
      return;
    }
    // Electron returns false when the accelerator is already taken by another app.
    if (result === false) {
      lastRegisterFailed = true;
      try {
        logger.warn(
          `GoWIN!Buddy: quick-task shortcut "${shortcut}" appears to be taken by another application; ` +
          "you can still open the panel from the tray menu."
        );
      } catch {}
    }
  }

  function unregister() {
    if (!enabled) return;
    try {
      globalShortcut.unregister(shortcut);
    } catch {}
  }

  return {
    defaultShortcut: shortcut,
    enabled,
    openQuickTaskPanel,
    register,
    unregister,
    didLastRegisterFail: () => lastRegisterFailed,
  };
}

module.exports = {
  createQuickTaskShortcutController,
  DEFAULT_QUICK_TASK_SHORTCUT,
};
