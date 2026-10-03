const fs = require("fs");

const DEFAULT_DELAY_MS = 5000;
const DEFAULT_TITLE = "GoWIN!Buddy 上手提示";
const DEFAULT_BODY = "右键宠物呼出菜单 · Ctrl+Alt+Q 一键唤起今日速勾";

// Hour range during which we suppress the first-run nudge so we don't startle
// users on a quiet desktop. Keeps the same flag-not-set state so the next
// launch (likely outside this window) gets to surface it.
const QUIET_HOURS_START = 22; // 22:00 inclusive
const QUIET_HOURS_END = 8;    // 08:00 exclusive

function isQuietHour(date) {
  const hour = date.getHours();
  return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
}

function createOnboardingController({
  Notification,
  flagPath,
  fsImpl = fs,
  delayMs = DEFAULT_DELAY_MS,
  schedule = setTimeout,
  cancel = clearTimeout,
  title = DEFAULT_TITLE,
  body = DEFAULT_BODY,
  logger = console,
  isDoNotDisturb = () => false,
  isPetHidden = () => false,
  now = () => new Date(),
}) {
  let pendingTimer = null;

  function isOnboarded() {
    if (!flagPath) return true;
    try {
      return fsImpl.existsSync(flagPath);
    } catch {
      return false;
    }
  }

  function markOnboarded() {
    if (!flagPath) return;
    try {
      fsImpl.writeFileSync(flagPath, String(Date.now()));
    } catch {}
  }

  function notificationsSupported() {
    if (!Notification) return false;
    if (typeof Notification.isSupported !== "function") return true;
    try {
      return !!Notification.isSupported();
    } catch {
      return false;
    }
  }

  function showNow() {
    try {
      const notif = new Notification({ title, body, silent: false });
      notif.show();
      return true;
    } catch (err) {
      try {
        logger.warn("GoWIN!Buddy onboarding notification failed:", err && err.message);
      } catch {}
      return false;
    }
  }

  function shouldDeferShow() {
    try {
      if (isDoNotDisturb && isDoNotDisturb()) return "dnd";
    } catch {}
    try {
      if (isPetHidden && isPetHidden()) return "pet-hidden";
    } catch {}
    try {
      if (isQuietHour(now())) return "quiet-hours";
    } catch {}
    return null;
  }

  function maybeShow() {
    if (isOnboarded()) return false;
    if (!notificationsSupported()) {
      markOnboarded();
      return false;
    }
    if (pendingTimer) return false;
    // Defer (without writing the flag) so a later launch outside DND / quiet
    // hours / hidden state still gets the nudge.
    if (shouldDeferShow()) return false;
    pendingTimer = schedule(() => {
      pendingTimer = null;
      // Re-check at fire time: state may have flipped during the delay.
      if (shouldDeferShow()) return;
      showNow();
      markOnboarded();
    }, delayMs);
    return true;
  }

  function cancelPending() {
    if (pendingTimer) {
      try { cancel(pendingTimer); } catch {}
      pendingTimer = null;
    }
  }

  return {
    isOnboarded,
    markOnboarded,
    maybeShow,
    cancelPending,
  };
}

module.exports = {
  createOnboardingController,
  DEFAULT_DELAY_MS,
  DEFAULT_TITLE,
  DEFAULT_BODY,
};
