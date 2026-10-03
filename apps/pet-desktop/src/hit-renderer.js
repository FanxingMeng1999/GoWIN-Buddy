// --- Input window: pointer capture, drag, click detection ---
// This is the "controller" — all input decisions happen here.
// Render window is pure "view" — receives reaction commands via IPC relay.

const area = document.getElementById("hit-area");
if (!window.hitAPI) {
  console.error("hit-renderer: hitAPI unavailable; preload bridge failed");
}
const hitBridge = window.hitAPI || {
  isRiosDashboardMode: false,
  onThemeConfig: () => {},
  dragLock: () => {},
  moveWindowBy: () => {},
  dragEnd: () => {},
  showContextMenu: () => {},
  focusTerminal: () => {},
  openDashboard: () => {},
  hoverQuickTasks: () => {},
  exitMiniMode: () => {},
  showSessionMenu: () => {},
  startDragReaction: () => {},
  endDragReaction: () => {},
  playClickReaction: () => {},
  onStateSync: () => {},
  onCancelReaction: () => {},
};
const isRiosDashboardMode = !!hitBridge.isRiosDashboardMode;
const interactionConfig = window.hitInteractionConfig || {};
const dashboardHoverCardsEnabled = interactionConfig.dashboardHoverCards !== false;
const dashboardDoubleClickEnabled = interactionConfig.dashboardDoubleClickOpen !== false;
const dashboardClickWindowMs = Number.isFinite(Number(interactionConfig.dashboardClickWindowMs))
  ? Number(interactionConfig.dashboardClickWindowMs)
  : 260;
const defaultClickWindowMs = Number.isFinite(Number(interactionConfig.defaultClickWindowMs))
  ? Number(interactionConfig.defaultClickWindowMs)
  : 400;
const reactionDurationScaleRaw = Number(interactionConfig.reactionDurationScale);
const reactionDurationScale = Number.isFinite(reactionDurationScaleRaw) && reactionDurationScaleRaw > 0
  ? reactionDurationScaleRaw
  : 1;

// ── Theme config (injected via preload-hit.js additionalArguments) ──
let tc = window.hitThemeConfig || {};
let _reactions = (tc && tc.reactions) || {};

// Theme switch: IPC push overrides additionalArguments
hitBridge.onThemeConfig((cfg) => {
  tc = cfg || {};
  _reactions = (tc && tc.reactions) || {};
});

// --- State synced from main ---
let currentSvg = null;
let currentState = null;
let miniMode = false;
let dndEnabled = false;

hitBridge.onStateSync((data) => {
  if (data.currentSvg !== undefined) currentSvg = data.currentSvg;
  if (data.currentState !== undefined) currentState = data.currentState;
  if (data.miniMode !== undefined) {
    miniMode = data.miniMode;
    area.style.cursor = miniMode ? "default" : "";
  }
  if (data.dndEnabled !== undefined) dndEnabled = data.dndEnabled;
});

// --- Drag state ---
let isDragging = false;
let didDrag = false;
let lastScreenX, lastScreenY;
let mouseDownX, mouseDownY;
let pendingDx = 0, pendingDy = 0;
let dragRAF = null;
const DRAG_THRESHOLD = 3;

// --- Reaction state (tracked here to gate input) ---
let isReacting = false;
let isDragReacting = false;

// Cancel signal from main (e.g. state change)
hitBridge.onCancelReaction(() => {
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; clickCount = 0; firstClickDir = null; }
  isReacting = false;
  isDragReacting = false;
});

area.addEventListener("mouseenter", () => {
  if (isRiosDashboardMode && dashboardHoverCardsEnabled) hitBridge.hoverQuickTasks(true);
});

area.addEventListener("mouseleave", () => {
  if (isRiosDashboardMode && dashboardHoverCardsEnabled && !isDragging) hitBridge.hoverQuickTasks(false);
});

// --- Pointer handlers ---
area.addEventListener("pointerdown", (e) => {
  if (e.button === 0) {
    if (miniMode) { didDrag = false; return; }
    area.setPointerCapture(e.pointerId);
    isDragging = true;
    didDrag = false;
    lastScreenX = e.screenX;
    lastScreenY = e.screenY;
    mouseDownX = e.clientX;
    mouseDownY = e.clientY;
    pendingDx = 0;
    pendingDy = 0;
    hitBridge.dragLock(true);
    area.classList.add("dragging");
  }
});

document.addEventListener("pointermove", (e) => {
  if (isDragging) {
    pendingDx += e.screenX - lastScreenX;
    pendingDy += e.screenY - lastScreenY;
    lastScreenX = e.screenX;
    lastScreenY = e.screenY;

    if (!didDrag) {
      const totalDx = e.clientX - mouseDownX;
      const totalDy = e.clientY - mouseDownY;
      if (Math.abs(totalDx) > DRAG_THRESHOLD || Math.abs(totalDy) > DRAG_THRESHOLD) {
        didDrag = true;
        startDragReaction();
      }
    }

    if (!dragRAF) {
      dragRAF = setTimeout(() => {
        hitBridge.moveWindowBy(pendingDx, pendingDy);
        pendingDx = 0;
        pendingDy = 0;
        dragRAF = null;
      }, 0);
    }
  }
});

function stopDrag() {
  if (!isDragging) return;
  isDragging = false;
  hitBridge.dragLock(false);
  area.classList.remove("dragging");
  if (pendingDx !== 0 || pendingDy !== 0) {
    if (dragRAF) { clearTimeout(dragRAF); dragRAF = null; }
    hitBridge.moveWindowBy(pendingDx, pendingDy);
    pendingDx = 0; pendingDy = 0;
  }
  if (didDrag) {
    hitBridge.dragEnd();
  }
  endDragReaction();
}

document.addEventListener("pointerup", (e) => {
  if (e.button === 0) {
    const wasDrag = didDrag;
    stopDrag();
    if (!wasDrag) {
      if (e.ctrlKey || e.metaKey) {
        hitBridge.showSessionMenu();
      } else {
        handleClick(e.clientX);
      }
    }
  }
});

area.addEventListener("pointercancel", () => stopDrag());
area.addEventListener("lostpointercapture", () => { if (isDragging) stopDrag(); });
window.addEventListener("blur", stopDrag);

// --- Click reaction logic ---
const CLICK_WINDOW_MS = isRiosDashboardMode ? dashboardClickWindowMs : defaultClickWindowMs;

let clickCount = 0;
let clickTimer = null;
let firstClickDir = null;

function _getReaction(name) {
  return _reactions[name] || null;
}

function resolveReactionDuration(rawDuration, fallbackDuration) {
  const parsed = Number(rawDuration);
  const baseDuration = Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackDuration;
  const scaled = Math.round(baseDuration * reactionDurationScale);
  return Math.max(100, scaled);
}

function handleClick(clientX) {
  if (miniMode) {
    hitBridge.exitMiniMode();
    return;
  }
  if (isReacting || isDragReacting) return;

  if (isRiosDashboardMode) {
    handleRiosClick(clientX);
    return;
  }

  // Non-idle: focus terminal, no reaction
  if (currentState !== "idle") {
    hitBridge.focusTerminal();
    return;
  }

  clickCount++;
  if (clickCount === 1) {
    firstClickDir = clientX < area.offsetWidth / 2 ? "left" : "right";
    hitBridge.focusTerminal();
  }

  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }

  const doubleReact = _getReaction("double");
  const annoyedReact = _getReaction("annoyed");
  const leftReact = _getReaction("clickLeft");
  const rightReact = _getReaction("clickRight");

  if (clickCount >= 4 && doubleReact) {
    clickCount = 0;
    firstClickDir = null;
    const files = doubleReact.files || [doubleReact.file];
    const file = files[Math.floor(Math.random() * files.length)];
    playReaction(file, resolveReactionDuration(doubleReact.duration, 3500));
  } else if (clickCount >= 2) {
    clickTimer = setTimeout(() => {
      clickTimer = null;
      clickCount = 0;
      if (annoyedReact && Math.random() < 0.5) {
        firstClickDir = null;
        playReaction(annoyedReact.file, resolveReactionDuration(annoyedReact.duration, 3500));
      } else if (leftReact && rightReact) {
        const react = firstClickDir === "left" ? leftReact : rightReact;
        firstClickDir = null;
        playReaction(react.file, resolveReactionDuration(react.duration, 2500));
      } else {
        firstClickDir = null;
      }
    }, CLICK_WINDOW_MS);
  } else {
    clickTimer = setTimeout(() => {
      clickTimer = null;
      clickCount = 0;
      firstClickDir = null;
    }, CLICK_WINDOW_MS);
  }
}

function handleRiosClick(clientX) {
  clickCount++;
  if (clickCount === 1) {
    firstClickDir = clientX < area.offsetWidth / 2 ? "left" : "right";
  }

  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
  }

  const leftReact = _getReaction("clickLeft");
  const rightReact = _getReaction("clickRight");
  const doubleReact = _getReaction("double");

  if (clickCount >= 2) {
    const reaction = doubleReact && (doubleReact.files || [doubleReact.file]).filter(Boolean);
    if (reaction && reaction.length) {
      const file = reaction[Math.floor(Math.random() * reaction.length)];
      playReaction(file, resolveReactionDuration(doubleReact.duration, 1800));
    }
    clickCount = 0;
    firstClickDir = null;
    if (dashboardDoubleClickEnabled) {
      hitBridge.openDashboard();
    }
    return;
  }

  clickTimer = setTimeout(() => {
    clickTimer = null;
    clickCount = 0;
    const react = firstClickDir === "left" ? leftReact : rightReact;
    firstClickDir = null;
    if (react && react.file) {
      playReaction(react.file, resolveReactionDuration(react.duration, 1400));
    }
  }, CLICK_WINDOW_MS);
}

function playReaction(svg, duration) {
  if (!svg) return;
  isReacting = true;
  hitBridge.playClickReaction(svg, duration);
  // Local timer to ungate input after duration
  setTimeout(() => { isReacting = false; }, duration);
}

// --- Drag reaction ---
function startDragReaction() {
  if (isDragReacting) return;
  if (dndEnabled) return;

  if (isReacting) {
    isReacting = false;
  }

  isDragReacting = true;
  hitBridge.startDragReaction();
}

function endDragReaction() {
  if (!isDragReacting) return;
  isDragReacting = false;
  hitBridge.endDragReaction();
}

// --- Right-click context menu ---
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  hitBridge.showContextMenu();
});


