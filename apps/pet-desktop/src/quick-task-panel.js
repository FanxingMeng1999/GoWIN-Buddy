function computeQuickTaskBounds({ petBounds, popupBounds, workArea }) {
  const width = popupBounds.width || 372;
  const height = popupBounds.height || 486;
  const gap = 12;
  const padding = 8;
  const canPlaceRight = petBounds.x + petBounds.width + gap + width <= workArea.x + workArea.width;
  const canPlaceLeft = petBounds.x - gap - width >= workArea.x;

  let x;
  if (canPlaceRight || !canPlaceLeft) {
    x = petBounds.x + petBounds.width + gap;
  } else {
    x = petBounds.x - width - gap;
  }
  const minX = workArea.x + padding;
  const maxX = workArea.x + workArea.width - width - padding;
  x = Math.max(minX, Math.min(Math.max(minX, maxX), x));

  const minY = workArea.y + padding;
  const maxY = workArea.y + workArea.height - height - padding;
  const preferredY = petBounds.y + Math.round(petBounds.height * 0.08);
  const y = Math.max(minY, Math.min(Math.max(minY, maxY), preferredY));

  return { x, y, width, height };
}

function buildRoundedRectShape(width, height, radius = 22) {
  const w = Math.max(1, Math.round(width || 0));
  const h = Math.max(1, Math.round(height || 0));
  const maxRadius = Math.max(0, Math.floor(Math.min(w, h) / 2) - 1);
  const r = Math.max(0, Math.min(Math.round(radius || 0), maxRadius));
  if (r <= 1) return [{ x: 0, y: 0, width: w, height: h }];

  const rows = [];
  let currentInset = null;
  let runStart = 0;

  for (let y = 0; y < h; y += 1) {
    let inset = 0;
    if (y < r) {
      const dy = r - y - 0.5;
      inset = Math.ceil(r - Math.sqrt(Math.max(0, r * r - dy * dy)));
    } else if (y >= h - r) {
      const dy = y - (h - r) + 0.5;
      inset = Math.ceil(r - Math.sqrt(Math.max(0, r * r - dy * dy)));
    }
    inset = Math.max(0, Math.min(inset, Math.floor((w - 1) / 2)));

    if (currentInset === null) {
      currentInset = inset;
      runStart = y;
      continue;
    }

    if (inset !== currentInset) {
      rows.push({ inset: currentInset, start: runStart, end: y - 1 });
      currentInset = inset;
      runStart = y;
    }
  }

  if (currentInset !== null) {
    rows.push({ inset: currentInset, start: runStart, end: h - 1 });
  }

  return rows
    .map((row) => {
      const rectWidth = Math.max(1, w - row.inset * 2);
      return {
        x: row.inset,
        y: row.start,
        width: rectWidth,
        height: row.end - row.start + 1,
      };
    })
    .filter((rect) => rect.width > 0 && rect.height > 0);
}

function createQuickTaskPanelController({
  enabled,
  BrowserWindow,
  screen,
  isLinux,
  isMac,
  isWin,
  linuxWindowType,
  winTopmostLevel,
  preloadPath,
  htmlPath,
  isQuitting,
  isPetHidden,
  getPetWindow,
  getQuickTaskPayload,
  getQuickTaskTheme = () => null,
  reapplyMacVisibility,
  guardAlwaysOnTop,
}) {
  const PANEL_RADIUS = 22;
  let panelWin = null;
  let pinned = false;
  let hoveringPet = false;
  let hoveringPanel = false;
  let hideTimer = null;
  let showTimer = null;
  let repositionRetryTimer = null;
  let cachedAnchorBounds = null;

  function clearShowTimer() {
    if (!showTimer) return;
    clearTimeout(showTimer);
    showTimer = null;
  }

  function clearHideTimer() {
    if (!hideTimer) return;
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  function clearRepositionRetryTimer() {
    if (!repositionRetryTimer) return;
    clearTimeout(repositionRetryTimer);
    repositionRetryTimer = null;
  }

  function isCursorInsidePanel(padding = 0) {
    if (!panelWin || panelWin.isDestroyed() || !panelWin.isVisible()) return false;
    if (!screen || typeof screen.getCursorScreenPoint !== "function") return false;
    const point = screen.getCursorScreenPoint();
    if (!point || typeof point.x !== "number" || typeof point.y !== "number") return false;
    const bounds = panelWin.getBounds();
    const pad = Math.max(0, Number(padding) || 0);
    return (
      point.x >= bounds.x - pad
      && point.x < (bounds.x + bounds.width + pad)
      && point.y >= bounds.y - pad
      && point.y < (bounds.y + bounds.height + pad)
    );
  }

  function getWindow() {
    return panelWin;
  }

  function applyRoundedShape(boundsOverride) {
    if (!panelWin || panelWin.isDestroyed()) return;
    if (typeof panelWin.setShape !== "function") return;
    const bounds = boundsOverride || panelWin.getBounds();
    const shape = buildRoundedRectShape(bounds.width, bounds.height, PANEL_RADIUS);
    try {
      panelWin.setShape(shape);
    } catch {}
  }

  function pushData() {
    if (!panelWin || panelWin.isDestroyed()) return;
    const payload = getQuickTaskPayload() || {};
    panelWin.webContents.send("quick-task:data", {
      ...payload,
      theme: typeof getQuickTaskTheme === "function" ? getQuickTaskTheme() : null,
    });
  }

  function positionWindow() {
    if (!panelWin || panelWin.isDestroyed()) return false;
    const petWin = getPetWindow();
    if (petWin && !petWin.isDestroyed()) {
      cachedAnchorBounds = petWin.getBounds();
    }
    const petBounds = cachedAnchorBounds;
    if (!petBounds) return false;
    const popupBounds = panelWin.getBounds();
    const display = screen.getDisplayNearestPoint({
      x: Math.round(petBounds.x + petBounds.width / 2),
      y: Math.round(petBounds.y + petBounds.height / 2),
    });
    const bounds = computeQuickTaskBounds({
      petBounds,
      popupBounds,
      workArea: display.workArea,
    });
    panelWin.setBounds(bounds, false);
    applyRoundedShape(bounds);
    return true;
  }

  function ensureCreated() {
    if (!enabled) return null;
    if (panelWin && !panelWin.isDestroyed()) return panelWin;
    panelWin = new BrowserWindow({
      width: 372,
      height: 486,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      focusable: true,
      fullscreenable: false,
      alwaysOnTop: true,
      ...(isLinux ? { type: linuxWindowType } : {}),
      ...(isMac ? { type: "panel", roundedCorners: false } : {}),
      webPreferences: {
        preload: preloadPath,
        backgroundThrottling: false,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    applyRoundedShape({ width: 372, height: 486 });
    if (isWin) panelWin.setAlwaysOnTop(true, winTopmostLevel);
    panelWin.loadFile(htmlPath);
    panelWin.on("close", (event) => {
      if (!isQuitting()) {
        event.preventDefault();
        pinned = false;
        hoveringPanel = false;
        panelWin.hide();
      }
    });
    panelWin.on("blur", () => {
      if (!pinned) {
        hoveringPanel = false;
        scheduleHide();
      }
    });
    panelWin.webContents.on("did-finish-load", () => {
      pushData();
    });
    if (isWin && typeof guardAlwaysOnTop === "function") {
      guardAlwaysOnTop(panelWin);
    }
    if (typeof reapplyMacVisibility === "function") {
      reapplyMacVisibility();
    }
    return panelWin;
  }

  function renderNow() {
    const target = ensureCreated();
    if (!target || target.isDestroyed()) return;
    if (!positionWindow()) {
      clearRepositionRetryTimer();
      repositionRetryTimer = setTimeout(() => {
        repositionRetryTimer = null;
        if (hoveringPet || pinned) {
          renderNow();
        }
      }, 90);
      return;
    }
    clearRepositionRetryTimer();
    pushData();
    target.showInactive();
    if (isLinux) target.setSkipTaskbar(true);
    if (isWin) target.setAlwaysOnTop(true, winTopmostLevel);
    if (typeof reapplyMacVisibility === "function") {
      reapplyMacVisibility();
    }
  }

  function show({ pinned: nextPinned = false, immediate = false } = {}) {
    if (!enabled || isPetHidden()) return;
    if (nextPinned) pinned = true;
    clearHideTimer();
    clearShowTimer();
    if (immediate) {
      renderNow();
      return;
    }
    showTimer = setTimeout(() => {
      showTimer = null;
      if (hoveringPet || pinned) {
        renderNow();
      }
    }, 220);
  }

  function hide(force = false) {
    if (!panelWin || panelWin.isDestroyed()) return;
    clearHideTimer();
    clearShowTimer();
    clearRepositionRetryTimer();
    if (!force) {
      const cursorInsidePanel = isCursorInsidePanel(1);
      if (cursorInsidePanel) {
        hoveringPanel = true;
      } else if (hoveringPanel) {
        // Guard against missing renderer mouseleave events.
        hoveringPanel = false;
      }
      if (pinned || hoveringPet || hoveringPanel) return;
    }
    panelWin.hide();
  }

  function scheduleHide() {
    if (!panelWin || panelWin.isDestroyed()) return;
    clearShowTimer();
    clearHideTimer();
    hideTimer = setTimeout(() => {
      hideTimer = null;
      hide(false);
    }, 240);
  }

  function setPetHover(inside) {
    hoveringPet = !!inside;
    if (hoveringPet) {
      show({ pinned: false, immediate: false });
    } else if (!pinned) {
      scheduleHide();
    }
  }

  function setPanelHover(inside) {
    hoveringPanel = !!inside;
    if (hoveringPanel) {
      clearHideTimer();
    } else if (!pinned) {
      scheduleHide();
    }
  }

  function closePanel() {
    pinned = false;
    hoveringPanel = false;
    hide(true);
  }

  function refreshDataIfVisible() {
    if (!panelWin || panelWin.isDestroyed()) return;
    if (!panelWin.isVisible()) return;
    pushData();
  }

  function destroy() {
    clearHideTimer();
    clearShowTimer();
    clearRepositionRetryTimer();
    pinned = false;
    hoveringPet = false;
    hoveringPanel = false;
    if (panelWin && !panelWin.isDestroyed()) {
      panelWin.destroy();
    }
    panelWin = null;
  }

  return {
    getWindow,
    ensureCreated,
    positionWindow,
    show,
    hide,
    scheduleHide,
    setPetHover,
    setPanelHover,
    closePanel,
    refreshDataIfVisible,
    destroy,
  };
}

module.exports = {
  computeQuickTaskBounds,
  buildRoundedRectShape,
  createQuickTaskPanelController,
};
