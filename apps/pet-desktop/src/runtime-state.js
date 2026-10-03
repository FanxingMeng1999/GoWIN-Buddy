const path = require("path");
const fs = require("fs");
const { writeJsonAtomic } = require("../hooks/json-utils");

function normalizePrefs(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const prefs = { ...raw };
  if (prefs.miniEdge !== "left" && prefs.miniEdge !== "right") {
    prefs.miniEdge = "right";
  }
  for (const key of ["x", "y", "preMiniX", "preMiniY"]) {
    if (key in prefs && (typeof prefs[key] !== "number" || !isFinite(prefs[key]))) {
      prefs[key] = 0;
    }
  }
  return prefs;
}

function createRuntimeStateStore({
  app,
  baseDir,
  themeLoader,
  fsImpl = fs,
  pathImpl = path,
}) {
  const userData = app.getPath("userData");
  const prefsPath = pathImpl.join(userData, "gowin-prefs.json");
  const legacyPrefsPath = pathImpl.join(userData, "clawd-prefs.json");

  themeLoader.init(baseDir, userData);

  function readPrefs(filePath) {
    const raw = JSON.parse(fsImpl.readFileSync(filePath, "utf8"));
    return normalizePrefs(raw);
  }

  function loadPrefs() {
    try {
      if (fsImpl.existsSync(prefsPath)) {
        return readPrefs(prefsPath);
      }
      if (fsImpl.existsSync(legacyPrefsPath)) {
        const legacy = readPrefs(legacyPrefsPath);
        if (legacy) {
          try {
            writeJsonAtomic(prefsPath, legacy, fsImpl);
          } catch {}
        }
        return legacy;
      }
      return null;
    } catch {
      return null;
    }
  }

  function savePrefs(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return false;
    try {
      writeJsonAtomic(prefsPath, snapshot, fsImpl);
      return true;
    } catch {
      return false;
    }
  }

  function loadThemeFromPrefs(prefs) {
    return themeLoader.loadTheme((prefs && prefs.theme) || "clawd");
  }

  function switchTheme({
    themeId,
    getActiveTheme,
    setActiveTheme,
    getMainWindow,
    getHitWindow,
    modulesApi,
    miniApi,
    displayApi,
    rendererApi,
    persistPrefs,
    rebuildMenus,
  }) {
    const win = getMainWindow();
    const hitWin = getHitWindow();
    if (!win || win.isDestroyed() || !hitWin || hitWin.isDestroyed()) return false;

    const currentTheme = getActiveTheme();
    if (currentTheme && currentTheme._id === themeId) return false;

    modulesApi.stateCleanup();
    modulesApi.tickCleanup();
    modulesApi.miniCleanup();

    const nextTheme = themeLoader.loadTheme(themeId);
    if (miniApi.getMiniMode() && !nextTheme.miniMode.supported) {
      miniApi.exitMiniMode();
    }
    setActiveTheme(nextTheme);

    const rendererConfig = themeLoader.getRendererConfig();
    const hitConfig = themeLoader.getHitRendererConfig();

    win.webContents.reload();
    hitWin.webContents.reload();

    let ready = 0;
    const onReady = () => {
      ready += 1;
      if (ready < 2) return;
      const resolved = displayApi.resolveDisplayState();
      rendererApi.sendToRenderer("state-change", resolved, displayApi.getSvgOverride(resolved));
      rendererApi.syncHitWindow();
      modulesApi.startMainTick();
    };

    win.webContents.once("did-finish-load", () => {
      win.webContents.send("theme-config", rendererConfig);
      onReady();
    });
    hitWin.webContents.once("did-finish-load", () => {
      hitWin.webContents.send("theme-config", hitConfig);
      onReady();
    });

    persistPrefs();
    rebuildMenus();
    return true;
  }

  return {
    loadPrefs,
    savePrefs,
    loadThemeFromPrefs,
    switchTheme,
  };
}

module.exports = {
  normalizePrefs,
  createRuntimeStateStore,
};
