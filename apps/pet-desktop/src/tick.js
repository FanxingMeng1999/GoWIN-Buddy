// src/tick.js — Main tick loop (cursor polling, eye tracking, idle/sleep detection, mini peek)
// Extracted from main.js L527-689

const { screen } = require("electron");

module.exports = function initTick(ctx) {

// ── Mouse idle tracking ──
let lastCursorX = null, lastCursorY = null;
let mouseStillSince = Date.now();
let isMouseIdle = false;       // showing idle-look
let hasTriggeredYawn = false;  // 60s threshold already fired
let idleLookPlayed = false;    // idle-look already played once since last movement
let idleLookReturnTimer = null;
let yawnDelayTimer = null;     // tracked setTimeout for yawn/idle-look transitions
let idleWasActive = false;
let lastEyeDx = 0, lastEyeDy = 0;
let mainTickTimer = null;
let mainTickHighFreq = true;
let clickThroughApplied = false;
const TICK_HIGH_INTERVAL_MS = 50;
const TICK_LOW_INTERVAL_MS = 250;

// ── Theme-driven helpers ──
function getTheme() {
  return ctx.theme || {};
}

function getMouseIdleTimeout() {
  return (getTheme().timings && getTheme().timings.mouseIdleTimeout) || 20000;
}

function getMouseSleepTimeout() {
  return (getTheme().timings && getTheme().timings.mouseSleepTimeout) || 60000;
}

function getIdleFollowSvg() {
  return ((getTheme().states || {}).idle || ["clawd-idle-follow.svg"])[0];
}

function getIdleAnimations() {
  return (getTheme().idleAnimations || []).map((anim) => ({ svg: anim.file, duration: anim.duration }));
}

// ── Unified main tick (cursor polling for eye tracking + sleep + mini peek) ──
// Input routing is handled by hitWin — no setIgnoreMouseEvents toggling here.
//
// Adaptive interval: 50ms when actively tracking (idle/mini), 250ms otherwise.
// Saves ~16 event-loop wakeups/sec when the pet is busy/sleeping and not polling.
function setTickInterval(highFreq) {
  if (mainTickTimer && mainTickHighFreq === highFreq) return;
  if (mainTickTimer) clearInterval(mainTickTimer);
  mainTickHighFreq = highFreq;
  mainTickTimer = setInterval(tickStep, highFreq ? TICK_HIGH_INTERVAL_MS : TICK_LOW_INTERVAL_MS);
}

function startMainTick() {
  if (mainTickTimer) return;
  ctx.mouseOverPet = false;
  mainTickHighFreq = true;
  mainTickTimer = setInterval(tickStep, TICK_HIGH_INTERVAL_MS);
}

function tickStep() {
  // Default: keep current interval. Only flip after we know what state we're in.
  let needsHighFreqNext = mainTickHighFreq;
  try {
    const mainWindow = ctx.win;
    if (!mainWindow || mainWindow.isDestroyed()) {
      // Window not ready yet — keep high frequency so click-through applies promptly when it appears.
      needsHighFreqNext = true;
      clickThroughApplied = false;
      return;
    }

    // Render window: permanently click-through after window is available.
    if (!clickThroughApplied) {
      mainWindow.setIgnoreMouseEvents(true);
      clickThroughApplied = true;
    }

    // Hidden pets do not need native cursor polling or idle animations.
    if (typeof mainWindow.isVisible === "function" && !mainWindow.isVisible()) {
      needsHighFreqNext = false;
      ctx.mouseOverPet = false;
      idleWasActive = false;
      if (idleLookReturnTimer) { clearTimeout(idleLookReturnTimer); idleLookReturnTimer = null; }
      if (yawnDelayTimer) { clearTimeout(yawnDelayTimer); yawnDelayTimer = null; }
      return;
    }

    // ── Idle state edge detection (must run every tick for timer cleanup) ──
    const idleNow = ctx.currentState === "idle" && !ctx.idlePaused;
    const miniIdleNow = ctx.currentState === "mini-idle" && !ctx.idlePaused && !ctx.miniTransitioning;
    needsHighFreqNext = idleNow || miniIdleNow || ctx.miniMode;

    if (idleNow && !idleWasActive) {
      isMouseIdle = false;
      hasTriggeredYawn = false;
      idleLookPlayed = false;
      lastCursorX = null;
      lastCursorY = null;
      mouseStillSince = Date.now();
      lastEyeDx = 0;
      lastEyeDy = 0;
      if (idleLookReturnTimer) { clearTimeout(idleLookReturnTimer); idleLookReturnTimer = null; }
      if (yawnDelayTimer) { clearTimeout(yawnDelayTimer); yawnDelayTimer = null; }
    }

    if (!idleNow && idleWasActive) {
      if (idleLookReturnTimer) { clearTimeout(idleLookReturnTimer); idleLookReturnTimer = null; }
      if (yawnDelayTimer) { clearTimeout(yawnDelayTimer); yawnDelayTimer = null; }
    }
    idleWasActive = idleNow;

    // Skip expensive native IPC calls (getCursorScreenPoint, getBounds) when
    // cursor tracking is not needed — saves ~20 calls/sec to the OS layer.
    const needsCursorPoll = idleNow || miniIdleNow || ctx.miniMode;
    if (!needsCursorPoll) return;

    const cursor = screen.getCursorScreenPoint();

    // ── Cursor-over-pet tracking (for mini peek + eye tracking, NOT for input routing) ──
    const bounds = ctx.win.getBounds();
    if (!ctx.dragLocked) {
      const hit = ctx.getHitRectScreen(bounds);
      const over = cursor.x >= hit.left && cursor.x <= hit.right
                && cursor.y >= hit.top  && cursor.y <= hit.bottom;
      ctx.mouseOverPet = over;
    }

    // ── Mini mode peek hover ──
    if (ctx.miniMode && !ctx.miniTransitioning && !ctx.dragLocked && !ctx.menuOpen) {
      const canPeek = ctx.currentState === "mini-idle" || ctx.currentState === "mini-peek"
        || ctx.currentState === "mini-sleep";
      if (!ctx.isAnimating && canPeek) {
        if (ctx.mouseOverPet && ctx.currentState === "mini-sleep" && !ctx.miniSleepPeeked) {
          ctx.miniPeekIn();
          ctx.miniSleepPeeked = true;
        } else if (!ctx.mouseOverPet && ctx.currentState === "mini-sleep" && ctx.miniSleepPeeked) {
          ctx.miniPeekOut();
          ctx.miniSleepPeeked = false;
        } else if (ctx.mouseOverPet && ctx.currentState !== "mini-peek" && ctx.currentState !== "mini-sleep") {
          ctx.miniPeekIn();
          ctx.applyState("mini-peek");
        } else if (!ctx.mouseOverPet && ctx.currentState === "mini-peek") {
          ctx.miniPeekOut();
          ctx.applyState("mini-idle");
        }
      }
    }

    if (!idleNow && !miniIdleNow) return;

    // ── Below: idle or mini-idle logic ──
    const moved = lastCursorX !== null && (cursor.x !== lastCursorX || cursor.y !== lastCursorY);
    lastCursorX = cursor.x;
    lastCursorY = cursor.y;

    // Normal idle: mouse idle detection + sleep sequence
    if (idleNow) {
      if (moved) {
        mouseStillSince = Date.now();
        hasTriggeredYawn = false;
        idleLookPlayed = false;
        if (idleLookReturnTimer) { clearTimeout(idleLookReturnTimer); idleLookReturnTimer = null; }
        if (yawnDelayTimer) { clearTimeout(yawnDelayTimer); yawnDelayTimer = null; }
        if (isMouseIdle) {
          isMouseIdle = false;
          ctx.sendToRenderer("state-change", "idle", getIdleFollowSvg());
        }
      }

      const elapsed = Date.now() - mouseStillSince;

      // Startup recovery: Claude Code is running but no hook yet — stay awake
      // Only suppress sleep sequence, don't skip eye tracking below
      if (ctx.startupRecoveryActive) {
        mouseStillSince = Date.now();
      }

      // 60s no mouse movement → yawning → dozing
      if (!hasTriggeredYawn && elapsed >= getMouseSleepTimeout()) {
        hasTriggeredYawn = true;
        if (!isMouseIdle) ctx.sendToRenderer("eye-move", 0, 0);
        yawnDelayTimer = setTimeout(() => {
          yawnDelayTimer = null;
          if (ctx.currentState === "idle") ctx.setState("yawning");
        }, isMouseIdle ? 50 : 250);
        return;
      }

      // 20s no mouse movement → random idle animation (play once, then return to idle-follow)
      if (!isMouseIdle && !hasTriggeredYawn && !idleLookPlayed && elapsed >= getMouseIdleTimeout()) {
        isMouseIdle = true;
        idleLookPlayed = true;
        const idleAnimations = getIdleAnimations();
        const pick = idleAnimations[Math.floor(Math.random() * idleAnimations.length)];
        if (!pick) return;
        ctx.sendToRenderer("eye-move", 0, 0);
        setTimeout(() => {
          if (isMouseIdle && ctx.currentState === "idle") {
            ctx.sendToRenderer("state-change", "idle", pick.svg);
            ctx.sendToHitWin("hit-state-sync", { currentSvg: pick.svg });
          }
        }, 250);
        idleLookReturnTimer = setTimeout(() => {
          idleLookReturnTimer = null;
          if (isMouseIdle && ctx.currentState === "idle") {
            isMouseIdle = false;
            const idleFollowSvg = getIdleFollowSvg();
            ctx.sendToRenderer("state-change", "idle", idleFollowSvg);
            ctx.sendToHitWin("hit-state-sync", { currentSvg: idleFollowSvg });
            setTimeout(() => { ctx.forceEyeResend = true; }, 200);
          }
        }, 250 + pick.duration);
        return;
      }
    }

    const trackEyesNow = (idleNow && ctx.currentSvg === getIdleFollowSvg() && !isMouseIdle) || miniIdleNow;
    if (!trackEyesNow) return;
    if (ctx.eyePauseUntil) {
      if (Date.now() < ctx.eyePauseUntil) return;
      ctx.eyePauseUntil = null;
    }
    if (!moved && !ctx.forceEyeResend) return;

    // ── Eye position calculation (shared by idle and mini-idle) ──
    const skipDedup = ctx.forceEyeResend;
    ctx.forceEyeResend = false;

    const obj = ctx.getObjRect(bounds);
    const theme = getTheme();
    const eyeTracking = theme.eyeTracking || { eyeRatioX: 0.5, eyeRatioY: 0.5, maxOffset: 3 };
    const eyeScreenX = obj.x + obj.w * eyeTracking.eyeRatioX;
    const eyeScreenY = obj.y + obj.h * eyeTracking.eyeRatioY;

    const relX = cursor.x - eyeScreenX;
    const relY = cursor.y - eyeScreenY;

    const MAX_OFFSET = eyeTracking.maxOffset;
    const dist = Math.sqrt(relX * relX + relY * relY);
    let eyeDx = 0, eyeDy = 0;
    if (dist > 1) {
      const scale = Math.min(1, dist / 300);
      eyeDx = (relX / dist) * MAX_OFFSET * scale;
      eyeDy = (relY / dist) * MAX_OFFSET * scale;
    }

    eyeDx = Math.round(eyeDx * 2) / 2;
    eyeDy = Math.round(eyeDy * 2) / 2;
    eyeDy = Math.max(-1.5, Math.min(1.5, eyeDy));

    if (skipDedup || eyeDx !== lastEyeDx || eyeDy !== lastEyeDy) {
      lastEyeDx = eyeDx;
      lastEyeDy = eyeDy;
      ctx.sendToRenderer("eye-move", eyeDx, eyeDy);
    }
  } finally {
    setTickInterval(needsHighFreqNext);
  }
}

function resetIdleTimer() {
  mouseStillSince = Date.now();
}

function cleanup() {
  if (mainTickTimer) { clearInterval(mainTickTimer); mainTickTimer = null; }
  if (idleLookReturnTimer) { clearTimeout(idleLookReturnTimer); idleLookReturnTimer = null; }
  if (yawnDelayTimer) { clearTimeout(yawnDelayTimer); yawnDelayTimer = null; }
  clickThroughApplied = false;
}

// Expose mouseStillSince for wake poll (state.js deep sleep timeout)
Object.defineProperty(startMainTick, '_mouseStillSince', {
  get() { return mouseStillSince; },
});

return { startMainTick, resetIdleTimer, cleanup, get _mouseStillSince() { return mouseStillSince; } };

};
