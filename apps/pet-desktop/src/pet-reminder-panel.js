const DEFAULT_REMINDER_INTERVAL_MS = 28 * 60 * 1000;
const DEFAULT_REMINDER_STARTUP_DELAY_MS = 3 * 60 * 1000;
const DEFAULT_REMINDER_DURATION_MS = 5600;

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function normalizeText(value, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function truncateLabel(text, max = 14) {
  const input = normalizeText(text);
  if (!input) return "";
  if (input.length <= max) return input;
  return `${input.slice(0, Math.max(1, max - 1))}…`;
}

function normalizeReminderCardStyle(style = {}) {
  const raw = style && typeof style === "object" ? style : {};
  const variant = normalizeText(raw.variant, "grid").toLowerCase();
  const allowedVariants = new Set(["grid", "night", "milk", "lab", "soda", "paper", "aurora", "cocoa"]);
  return {
    variant: allowedVariants.has(variant) ? variant : "grid",
    cardBg: normalizeText(raw.cardBg, "rgba(255, 253, 248, 0.96)"),
    cardBorder: normalizeText(raw.cardBorder, "rgba(253, 186, 116, 0.38)"),
    cardShadow: normalizeText(raw.cardShadow, "0 12px 28px rgba(249, 115, 22, 0.2)"),
    titleColor: normalizeText(raw.titleColor, "#25324a"),
    bodyColor: normalizeText(raw.bodyColor, "#55637f"),
    accentStrong: normalizeText(raw.accentStrong, "#f97316"),
    accentSoft: normalizeText(raw.accentSoft, "rgba(251, 191, 36, 0.2)"),
    ornamentColor: normalizeText(raw.ornamentColor, "rgba(255, 255, 255, 0.55)"),
  };
}

function computeReminderBounds({ petBounds, popupBounds, workArea }) {
  const width = popupBounds.width || 264;
  const height = popupBounds.height || 92;
  const gap = 12;
  const padding = 8;

  const minX = workArea.x + padding;
  const maxX = workArea.x + workArea.width - width - padding;
  const minY = workArea.y + padding;
  const maxY = workArea.y + workArea.height - height - padding;

  const petCenterX = petBounds.x + Math.round(petBounds.width / 2);
  let x = petCenterX - Math.round(width / 2);
  x = Math.max(minX, Math.min(Math.max(minX, maxX), x));

  const preferredTop = petBounds.y - height - gap;
  const preferredBottom = petBounds.y + petBounds.height + gap;
  let y = preferredTop >= minY ? preferredTop : preferredBottom;
  if (y > maxY) y = maxY;
  if (y < minY) y = minY;

  return { x, y, width, height };
}

function getActiveSessionMinutes(quickPayload, now) {
  const start = Number(quickPayload?.workStatus?.activeSessionStart);
  if (!Number.isFinite(start) || start <= 0) return null;
  return Math.max(0, Math.floor((now - start) / 60000));
}

function buildPriorityCandidates(quickPayload = {}, options = {}) {
  const now = Number(options.now) || Date.now();
  const candidates = [];
  const workStatus = quickPayload && typeof quickPayload.workStatus === "object" ? quickPayload.workStatus : {};
  const todoList = Array.isArray(quickPayload.todos) ? quickPayload.todos : [];

  // 1) Imminent DDL on a temporary todo (within ~30 min) — highest priority.
  const ddlSoonWindowMs = 30 * 60 * 1000;
  const dueSoon = todoList
    .filter((item) => item && !item.checked && item.cadence === "temporary" && Number.isFinite(item.dueAt))
    .map((item) => ({ item, delta: item.dueAt - now }))
    .filter((entry) => entry.delta > 0 && entry.delta <= ddlSoonWindowMs)
    .sort((a, b) => a.delta - b.delta)[0];
  if (dueSoon) {
    const minutes = Math.max(1, Math.round(dueSoon.delta / 60000));
    candidates.push({
      key: `ddl-${dueSoon.item.id || truncateLabel(dueSoon.item.title, 8)}`,
      emoji: "⏰",
      tone: "orange",
      title: "DDL 临近",
      message: `约 ${minutes} 分钟内到点：「${truncateLabel(dueSoon.item.title, 18)}」，先把它推到完成。`,
    });
  }

  // 2) Already past 22:00 and still clocked in → wrap up.
  const hour = new Date(now).getHours();
  if (workStatus.active && hour >= 22) {
    candidates.push({
      key: "wrap-up-22",
      emoji: "🌙",
      tone: "purple",
      title: "该收工了",
      message: "22 点前下班可解锁奖励，现在打卡下班还来得及，给大脑留点恢复时间。",
    });
  }

  // 3) Continuous active session > 90 min → posture break.
  const activeMinutes = getActiveSessionMinutes(quickPayload, now);
  if (activeMinutes != null && activeMinutes >= 90) {
    candidates.push({
      key: "long-session-break",
      emoji: "🧍",
      tone: "mint",
      title: "起身放空 2 分钟",
      message: `已经连续在线 ${activeMinutes} 分钟，起来走两步，肩颈会松很多。`,
    });
  }

  // 4) Total time > 4h still clocked in → considering shutdown.
  if (workStatus.active && Number(workStatus.totalMinutes) >= 240) {
    candidates.push({
      key: "long-day",
      emoji: "🌤️",
      tone: "sky",
      title: "今天已经够卷了",
      message: `累计在线 ${Math.round(workStatus.totalMinutes / 30) / 2} 小时，可以考虑收个工，明天再战。`,
    });
  }

  // 5) Weekday daytime not yet clocked in → nudge to start the loop.
  const day = new Date(now).getDay();
  const isWeekday = day >= 1 && day <= 5;
  if (!workStatus.hasClockIn && isWeekday && hour >= 9 && hour < 18) {
    candidates.push({
      key: "clock-in-prompt",
      emoji: "🚪",
      tone: "orange",
      title: "今天还没开工",
      message: "速勾面板里点一下「上班打卡」就能开始计时，不卷只为给自己一个起点。",
    });
  }

  return candidates;
}

function buildReminderCandidates(quickPayload = {}, options = {}) {
  const priority = buildPriorityCandidates(quickPayload, options);
  const manualPending = Array.isArray(quickPayload.manualQuests)
    ? quickPayload.manualQuests.filter((item) => item && !item.checked)
    : [];
  const autoPending = Array.isArray(quickPayload.autoQuests)
    ? quickPayload.autoQuests.filter((item) => item && !item.checked)
    : [];
  const todoPending = Array.isArray(quickPayload.todos)
    ? quickPayload.todos.filter((item) => item && !item.checked)
    : [];

  const firstManual = manualPending[0];
  const firstTodo = todoPending[0];

  const generic = [
    {
      key: "posture-break",
      emoji: "🧍",
      tone: "mint",
      title: "起身活动一下",
      message: "已经坐了一段时间，起来走 2 分钟，肩颈会轻很多。",
    },
    {
      key: "hydration",
      emoji: "💧",
      tone: "sky",
      title: "补水提醒",
      message: "喝几口水，给大脑续航，注意力会更稳。",
    },
  ];

  if (firstManual && normalizeText(firstManual.title)) {
    generic.push({
      key: `manual-${firstManual.id || truncateLabel(firstManual.title, 8)}`,
      emoji: "🎯",
      tone: "orange",
      title: "顺手推进一条",
      message: `先做「${truncateLabel(firstManual.title, 18)}」，只推进 1 条也算赢。`,
    });
  }

  if (firstTodo && normalizeText(firstTodo.title)) {
    generic.push({
      key: `todo-${firstTodo.id || truncateLabel(firstTodo.title, 8)}`,
      emoji: "🗂️",
      tone: "purple",
      title: "清个小待办",
      message: `先清「${truncateLabel(firstTodo.title, 18)}」，给自己一个即时反馈。`,
    });
  }

  if (autoPending.length > 0) {
    generic.push({
      key: "auto-progress",
      emoji: "⚡",
      tone: "mint",
      title: "节奏保持中",
      message: "保持在线状态，系统会自动帮你推进联动任务。",
    });
  }

  if (manualPending.length === 0 && todoPending.length === 0 && autoPending.length === 0) {
    generic.push({
      key: "all-clear",
      emoji: "✨",
      tone: "sky",
      title: "今天节奏不错",
      message: "日常基本清空了，记得补水和活动，继续稳步推进。",
    });
  }

  return [...priority, ...generic];
}

function pickReminderPayload(quickPayload = {}, rotateIndex = 0, options = {}) {
  const priority = buildPriorityCandidates(quickPayload, options);
  if (priority.length > 0) {
    return priority[0];
  }
  const generic = buildReminderCandidates(quickPayload, options);
  if (!generic.length) return null;
  const index = Math.max(0, rotateIndex || 0) % generic.length;
  return generic[index];
}

function createPetReminderController({
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
  isDoNotDisturb = () => false,
  isReminderMuted = () => false,
  getReminderTheme = () => null,
  getPetWindow,
  getQuickTaskPayload,
  reapplyMacVisibility,
  guardAlwaysOnTop,
  intervalMs = DEFAULT_REMINDER_INTERVAL_MS,
  startupDelayMs = DEFAULT_REMINDER_STARTUP_DELAY_MS,
  visibleDurationMs = DEFAULT_REMINDER_DURATION_MS,
}) {
  const REMINDER_WIDTH = 264;
  const REMINDER_HEIGHT = 92;
  const interval = clampInt(intervalMs, DEFAULT_REMINDER_INTERVAL_MS, 5 * 60 * 1000, 120 * 60 * 1000);
  const startupDelay = clampInt(startupDelayMs, DEFAULT_REMINDER_STARTUP_DELAY_MS, 20 * 1000, 30 * 60 * 1000);
  const visibleDuration = clampInt(visibleDurationMs, DEFAULT_REMINDER_DURATION_MS, 1800, 20000);

  let reminderWin = null;
  let hideTimer = null;
  let scheduleTimer = null;
  let rotateIndex = 0;
  let lastReminderKey = "";
  let lastReminderAt = 0;
  let cachedAnchorBounds = null;

  function clearHideTimer() {
    if (!hideTimer) return;
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  function clearScheduleTimer() {
    if (!scheduleTimer) return;
    clearTimeout(scheduleTimer);
    scheduleTimer = null;
  }

  function getWindow() {
    return reminderWin;
  }

  function shouldSkipReminder() {
    if (!enabled) return true;
    if (typeof isQuitting === "function" && isQuitting()) return true;
    if (typeof isPetHidden === "function" && isPetHidden()) return true;
    if (typeof isDoNotDisturb === "function" && isDoNotDisturb()) return true;
    if (typeof isReminderMuted === "function" && isReminderMuted()) return true;
    return false;
  }

  function ensureCreated() {
    if (!enabled) return null;
    if (reminderWin && !reminderWin.isDestroyed()) return reminderWin;
    reminderWin = new BrowserWindow({
      width: REMINDER_WIDTH,
      height: REMINDER_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      fullscreenable: false,
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
    reminderWin.loadFile(htmlPath);
    reminderWin.on("closed", () => {
      reminderWin = null;
    });
    if (typeof reminderWin.setIgnoreMouseEvents === "function") {
      try {
        reminderWin.setIgnoreMouseEvents(true, { forward: true });
      } catch {
        reminderWin.setIgnoreMouseEvents(true);
      }
    }
    if (isLinux) reminderWin.setSkipTaskbar(true);
    if (isWin) reminderWin.setAlwaysOnTop(true, winTopmostLevel);
    if (typeof guardAlwaysOnTop === "function") guardAlwaysOnTop(reminderWin);
    if (typeof reapplyMacVisibility === "function") reapplyMacVisibility();
    return reminderWin;
  }

  function resolveAnchorBounds() {
    const anchor = typeof getPetWindow === "function" ? getPetWindow() : null;
    if (anchor && !anchor.isDestroyed()) {
      const bounds = anchor.getBounds();
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        cachedAnchorBounds = bounds;
        return bounds;
      }
    }
    return cachedAnchorBounds;
  }

  function positionWindow() {
    if (!reminderWin || reminderWin.isDestroyed()) return false;
    const petBounds = resolveAnchorBounds();
    if (!petBounds) return false;
    const anchorPoint = {
      x: petBounds.x + Math.round(petBounds.width / 2),
      y: petBounds.y + Math.round(petBounds.height / 2),
    };
    const display = screen.getDisplayNearestPoint(anchorPoint);
    const workArea = display && display.workArea ? display.workArea : screen.getPrimaryDisplay().workArea;
    const targetBounds = computeReminderBounds({
      petBounds,
      popupBounds: { width: REMINDER_WIDTH, height: REMINDER_HEIGHT },
      workArea,
    });
    reminderWin.setBounds(targetBounds);
    return true;
  }

  function hide(force = false) {
    if (!reminderWin || reminderWin.isDestroyed()) return;
    clearHideTimer();
    if (!force && shouldSkipReminder()) return;
    reminderWin.hide();
    if (!reminderWin.webContents.isDestroyed()) {
      reminderWin.webContents.send("pet-reminder:hide");
    }
  }

  function show(payload = {}) {
    if (shouldSkipReminder()) return false;
    const target = ensureCreated();
    if (!target || target.isDestroyed()) return false;
    if (!positionWindow()) return false;
    clearHideTimer();
    const normalizedPayload = {
      key: normalizeText(payload.key, "reminder"),
      emoji: normalizeText(payload.emoji, "💡"),
      tone: normalizeText(payload.tone, "mint"),
      title: normalizeText(payload.title, "小提醒"),
      message: normalizeText(payload.message, "休息一下再继续。"),
      style: normalizeReminderCardStyle({
        ...((typeof getReminderTheme === "function" && getReminderTheme()) || {}),
        ...(((payload && payload.style) && typeof payload.style === "object") ? payload.style : {}),
      }),
    };
    target.webContents.send("pet-reminder:show", normalizedPayload);
    target.showInactive();
    if (isLinux) target.setSkipTaskbar(true);
    if (isWin) target.setAlwaysOnTop(true, winTopmostLevel);
    if (typeof guardAlwaysOnTop === "function") guardAlwaysOnTop(target);
    if (typeof reapplyMacVisibility === "function") reapplyMacVisibility();
    hideTimer = setTimeout(() => {
      hideTimer = null;
      hide(true);
    }, visibleDuration);
    return true;
  }

  function safeGetQuickTaskPayload() {
    if (typeof getQuickTaskPayload !== "function") return {};
    try {
      return getQuickTaskPayload() || {};
    } catch {
      return {};
    }
  }

  function triggerNow() {
    if (shouldSkipReminder()) return false;
    const payload = safeGetQuickTaskPayload();
    const now = Date.now();
    const reminder = pickReminderPayload(payload, rotateIndex, { now });
    rotateIndex += 1;
    if (!reminder) return false;
    if (reminder.key === lastReminderKey && (now - lastReminderAt) < Math.round(interval * 0.75)) {
      return false;
    }
    lastReminderKey = reminder.key;
    lastReminderAt = now;
    return show(reminder);
  }

  function computeJitterMs() {
    const jitterRange = Math.min(5 * 60 * 1000, Math.round(interval * 0.14));
    return Math.round((Math.random() * 2 - 1) * jitterRange);
  }

  function scheduleNext(delayMs = interval) {
    clearScheduleTimer();
    const nextDelay = Math.max(30 * 1000, Number(delayMs) || interval);
    scheduleTimer = setTimeout(() => {
      scheduleTimer = null;
      triggerNow();
      scheduleNext(interval + computeJitterMs());
    }, nextDelay);
  }

  function start() {
    if (!enabled) return;
    scheduleNext(startupDelay);
  }

  function stop() {
    clearScheduleTimer();
    hide(true);
  }

  function destroy() {
    clearScheduleTimer();
    clearHideTimer();
    if (reminderWin && !reminderWin.isDestroyed()) {
      reminderWin.destroy();
    }
    reminderWin = null;
  }

  return {
    getWindow,
    ensureCreated,
    positionWindow,
    show,
    hide,
    triggerNow,
    start,
    stop,
    destroy,
  };
}

module.exports = {
  normalizeReminderCardStyle,
  computeReminderBounds,
  buildReminderCandidates,
  pickReminderPayload,
  createPetReminderController,
};
