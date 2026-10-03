const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  normalizeReminderCardStyle,
  computeReminderBounds,
  buildReminderCandidates,
  pickReminderPayload,
  createPetReminderController,
} = require("../src/pet-reminder-panel");

class FakeWebContents {
  constructor() {
    this.sent = [];
  }

  send(channel, payload) {
    this.sent.push({ channel, payload });
  }

  isDestroyed() {
    return false;
  }
}

class FakeBrowserWindow {
  static instances = [];

  constructor(opts) {
    this.opts = opts;
    this.bounds = { x: 0, y: 0, width: opts.width, height: opts.height };
    this.visible = false;
    this.destroyed = false;
    this.webContents = new FakeWebContents();
    this.handlers = new Map();
    FakeBrowserWindow.instances.push(this);
  }

  static reset() {
    FakeBrowserWindow.instances.length = 0;
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  emit(event) {
    const handler = this.handlers.get(event);
    if (handler) handler();
  }

  loadFile(filePath) {
    this.filePath = filePath;
  }

  isDestroyed() {
    return this.destroyed;
  }

  destroy() {
    this.destroyed = true;
    this.visible = false;
    this.emit("closed");
  }

  showInactive() {
    this.visible = true;
  }

  hide() {
    this.visible = false;
  }

  isVisible() {
    return this.visible;
  }

  getBounds() {
    return { ...this.bounds };
  }

  setBounds(next) {
    this.bounds = { ...this.bounds, ...next };
  }

  setIgnoreMouseEvents() {}
  setSkipTaskbar() {}
  setAlwaysOnTop() {}
}

describe("pet-reminder-panel", () => {
  it("accepts the extended reminder card variants", () => {
    assert.strictEqual(normalizeReminderCardStyle({ variant: "paper" }).variant, "paper");
    assert.strictEqual(normalizeReminderCardStyle({ variant: "aurora" }).variant, "aurora");
    assert.strictEqual(normalizeReminderCardStyle({ variant: "cocoa" }).variant, "cocoa");
    assert.strictEqual(normalizeReminderCardStyle({ variant: "unknown" }).variant, "grid");
  });

  it("computes reminder bounds inside work area", () => {
    const bounds = computeReminderBounds({
      petBounds: { x: 20, y: 20, width: 180, height: 180 },
      popupBounds: { width: 264, height: 92 },
      workArea: { x: 0, y: 0, width: 400, height: 300 },
    });
    assert.ok(bounds.x >= 8);
    assert.ok(bounds.y >= 8);
    assert.ok(bounds.x + bounds.width <= 392);
    assert.ok(bounds.y + bounds.height <= 292);
  });

  it("builds dynamic reminder candidates from pending quests and todos", () => {
    // Pin the simulated clock to a Sunday afternoon so no priority candidates fire,
    // letting the rotateIndex actually walk through the generic candidate list.
    const now = new Date(2026, 4, 3, 14, 0, 0).getTime();
    const payload = {
      workStatus: { active: true, hasClockIn: true, totalMinutes: 30, activeSessionStart: now - 30 * 60 * 1000 },
      manualQuests: [{ id: "q1", title: "核心任务推进", checked: false }],
      autoQuests: [{ id: "a1", title: "在线时长 I 档", checked: false }],
      todos: [{ id: "t1", title: "整理实验记录", checked: false }],
    };
    const candidates = buildReminderCandidates(payload, { now });
    assert.ok(candidates.some((item) => item.key === "posture-break"));
    assert.ok(candidates.some((item) => item.key === "hydration"));
    assert.ok(candidates.some((item) => String(item.key || "").startsWith("manual-")));
    assert.ok(candidates.some((item) => String(item.key || "").startsWith("todo-")));
    assert.ok(candidates.some((item) => item.key === "auto-progress"));
    const first = pickReminderPayload(payload, 0, { now });
    const second = pickReminderPayload(payload, 1, { now });
    assert.notStrictEqual(first.key, second.key);
  });

  it("prioritises imminent temp-todo DDL reminders over generic ones", () => {
    const now = Date.UTC(2026, 4, 5, 7, 0, 0); // weekday daytime
    const payload = {
      workStatus: { active: true, hasClockIn: true, totalMinutes: 30, activeSessionStart: now - 30 * 60 * 1000 },
      todos: [
        { id: "tA", title: "提交 EAA 材料", cadence: "temporary", dueAt: now + 12 * 60 * 1000, checked: false },
      ],
    };
    const reminder = pickReminderPayload(payload, 0, { now });
    assert.ok(reminder);
    assert.ok(String(reminder.key).startsWith("ddl-"));
    assert.match(reminder.message, /12 分钟/);
  });

  it("nudges weekday daytime users who have not clocked in yet", () => {
    const now = new Date(2026, 4, 5, 10, 30, 0).getTime(); // Tuesday 10:30 local
    const payload = { workStatus: { active: false, hasClockIn: false, totalMinutes: 0 }, todos: [] };
    const reminder = pickReminderPayload(payload, 0, { now });
    assert.ok(reminder);
    assert.strictEqual(reminder.key, "clock-in-prompt");
  });

  it("suggests a posture break after 90+ minutes of continuous work", () => {
    const now = new Date(2026, 4, 5, 14, 0, 0).getTime();
    const payload = {
      workStatus: {
        active: true,
        hasClockIn: true,
        totalMinutes: 95,
        activeSessionStart: now - 95 * 60 * 1000,
      },
      todos: [],
    };
    const reminder = pickReminderPayload(payload, 0, { now });
    assert.ok(reminder);
    assert.strictEqual(reminder.key, "long-session-break");
  });

  it("nudges shutdown when an active session continues past 22:00", () => {
    const now = new Date(2026, 4, 5, 22, 30, 0).getTime();
    const payload = {
      workStatus: { active: true, hasClockIn: true, totalMinutes: 200, activeSessionStart: now - 60 * 60 * 1000 },
      todos: [],
    };
    const reminder = pickReminderPayload(payload, 0, { now });
    assert.ok(reminder);
    assert.strictEqual(reminder.key, "wrap-up-22");
  });

  it("falls back to generic reminders when no priority signal is active", () => {
    const now = new Date(2026, 4, 3, 14, 0, 0).getTime(); // Sunday 14:00 → no weekday nudge
    const payload = {
      workStatus: { active: false, hasClockIn: false, totalMinutes: 0 },
      manualQuests: [],
      autoQuests: [],
      todos: [],
    };
    const reminder = pickReminderPayload(payload, 0, { now });
    assert.ok(reminder);
    assert.strictEqual(reminder.key, "posture-break");
  });

  it("creates reminder window and sends payload when triggered", () => {
    FakeBrowserWindow.reset();
    const controller = createPetReminderController({
      enabled: true,
      BrowserWindow: FakeBrowserWindow,
      screen: {
        getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1280, height: 720 } }),
        getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1280, height: 720 } }),
      },
      isLinux: false,
      isMac: false,
      isWin: true,
      linuxWindowType: "toolbar",
      winTopmostLevel: "pop-up-menu",
      preloadPath: "preload-reminder.js",
      htmlPath: "reminder.html",
      isQuitting: () => false,
      isPetHidden: () => false,
      isDoNotDisturb: () => false,
      getReminderTheme: () => ({
        variant: "lab",
        cardBg: "rgba(244, 255, 247, 0.95)",
        accentStrong: "#4f8a4c",
      }),
      getPetWindow: () => ({
        isDestroyed: () => false,
        getBounds: () => ({ x: 560, y: 420, width: 180, height: 180 }),
      }),
      getQuickTaskPayload: () => ({
        manualQuests: [{ id: "q1", title: "核心任务推进", checked: false }],
        autoQuests: [],
        todos: [],
      }),
      reapplyMacVisibility: () => {},
      guardAlwaysOnTop: () => {},
      intervalMs: 60 * 60 * 1000,
      startupDelayMs: 60 * 1000,
      visibleDurationMs: 6000,
    });

    const triggered = controller.triggerNow();
    assert.strictEqual(triggered, true);
    assert.strictEqual(FakeBrowserWindow.instances.length, 1);
    const win = FakeBrowserWindow.instances[0];
    assert.strictEqual(win.filePath, "reminder.html");
    assert.strictEqual(win.isVisible(), true);
    assert.ok(win.webContents.sent.some((entry) => entry.channel === "pet-reminder:show"));
    const payload = win.webContents.sent.find((entry) => entry.channel === "pet-reminder:show").payload;
    assert.strictEqual(payload.style.variant, "lab");
    assert.strictEqual(payload.style.cardBg, "rgba(244, 255, 247, 0.95)");

    controller.hide(true);
    assert.strictEqual(win.isVisible(), false);
    controller.destroy();
    assert.strictEqual(win.isDestroyed(), true);
  });
});
