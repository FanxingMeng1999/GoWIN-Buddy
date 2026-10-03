const { describe, it } = require("node:test");
const assert = require("node:assert");
const { createOnboardingController } = require("../src/onboarding");

function makeFakeFs(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));
  return {
    files,
    existsSync: (p) => files.has(p),
    writeFileSync: (p, content) => { files.set(p, String(content)); },
  };
}

function makeFakeNotification(tracker) {
  function FakeNotification(opts) {
    this.opts = opts;
    this.show = () => { tracker.shown.push(opts); };
  }
  FakeNotification.isSupported = () => tracker.supported !== false;
  return FakeNotification;
}

function makeImmediateScheduler() {
  const scheduled = [];
  function schedule(fn) {
    const handle = { cancelled: false };
    fn();
    scheduled.push(handle);
    return handle;
  }
  function cancel(handle) {
    if (handle) handle.cancelled = true;
  }
  return { schedule, cancel, scheduled };
}

// Stable "daytime" timestamp so quiet-hour filtering doesn't depend on the
// host's wall clock when the suite runs.
const DAYTIME = () => new Date("2026-05-04T15:00:00");

describe("onboarding", () => {
  it("schedules a notification on first run and marks the flag file", () => {
    const fsImpl = makeFakeFs();
    const tracker = { shown: [], supported: true };
    const Notification = makeFakeNotification(tracker);
    const { schedule, cancel } = makeImmediateScheduler();

    const ctrl = createOnboardingController({
      Notification,
      flagPath: "C:/fake/userData/gowin-onboarded.flag",
      fsImpl,
      schedule,
      cancel,
      now: DAYTIME,
    });

    const result = ctrl.maybeShow();
    assert.strictEqual(result, true);
    assert.strictEqual(tracker.shown.length, 1);
    assert.match(tracker.shown[0].body, /Ctrl\+Alt\+Q/);
    assert.strictEqual(fsImpl.existsSync("C:/fake/userData/gowin-onboarded.flag"), true);
  });

  it("does nothing on subsequent runs once flag exists", () => {
    const fsImpl = makeFakeFs({ "C:/fake/flag": "1" });
    const tracker = { shown: [], supported: true };
    const Notification = makeFakeNotification(tracker);
    const { schedule, cancel } = makeImmediateScheduler();

    const ctrl = createOnboardingController({
      Notification,
      flagPath: "C:/fake/flag",
      fsImpl,
      schedule,
      cancel,
    });

    const result = ctrl.maybeShow();
    assert.strictEqual(result, false);
    assert.strictEqual(tracker.shown.length, 0);
  });

  it("marks flag without showing when notifications are unsupported", () => {
    const fsImpl = makeFakeFs();
    const tracker = { shown: [], supported: false };
    const Notification = makeFakeNotification(tracker);
    const { schedule, cancel } = makeImmediateScheduler();

    const ctrl = createOnboardingController({
      Notification,
      flagPath: "C:/fake/flag2",
      fsImpl,
      schedule,
      cancel,
    });

    const result = ctrl.maybeShow();
    assert.strictEqual(result, false);
    assert.strictEqual(tracker.shown.length, 0);
    assert.strictEqual(fsImpl.existsSync("C:/fake/flag2"), true);
  });

  it("only schedules once even when called repeatedly before firing", () => {
    const fsImpl = makeFakeFs();
    const tracker = { shown: [], supported: true };
    const Notification = makeFakeNotification(tracker);
    const scheduled = [];
    function schedule(fn) {
      const handle = { fn, fired: false };
      scheduled.push(handle);
      return handle;
    }
    function cancel() {}

    const ctrl = createOnboardingController({
      Notification,
      flagPath: "C:/fake/flag3",
      fsImpl,
      schedule,
      cancel,
      now: DAYTIME,
    });

    assert.strictEqual(ctrl.maybeShow(), true);
    assert.strictEqual(ctrl.maybeShow(), false);
    assert.strictEqual(scheduled.length, 1);
  });

  it("cancelPending clears a pending timer", () => {
    const fsImpl = makeFakeFs();
    const tracker = { shown: [], supported: true };
    const Notification = makeFakeNotification(tracker);
    let cancelled = null;
    function schedule(fn) {
      return { fn };
    }
    function cancel(handle) {
      cancelled = handle;
    }

    const ctrl = createOnboardingController({
      Notification,
      flagPath: "C:/fake/flag4",
      fsImpl,
      schedule,
      cancel,
      now: DAYTIME,
    });

    ctrl.maybeShow();
    ctrl.cancelPending();
    assert.ok(cancelled);
  });

  it("defers (without marking flag) when do-not-disturb is on", () => {
    const fsImpl = makeFakeFs();
    const tracker = { shown: [], supported: true };
    const Notification = makeFakeNotification(tracker);
    const { schedule, cancel } = makeImmediateScheduler();

    const ctrl = createOnboardingController({
      Notification,
      flagPath: "C:/fake/flag-dnd",
      fsImpl,
      schedule,
      cancel,
      isDoNotDisturb: () => true,
      now: () => new Date("2026-05-04T15:00:00"),
    });

    assert.strictEqual(ctrl.maybeShow(), false);
    assert.strictEqual(tracker.shown.length, 0);
    assert.strictEqual(fsImpl.existsSync("C:/fake/flag-dnd"), false);
  });

  it("defers (without marking flag) when pet is hidden", () => {
    const fsImpl = makeFakeFs();
    const tracker = { shown: [], supported: true };
    const Notification = makeFakeNotification(tracker);
    const { schedule, cancel } = makeImmediateScheduler();

    const ctrl = createOnboardingController({
      Notification,
      flagPath: "C:/fake/flag-hidden",
      fsImpl,
      schedule,
      cancel,
      isPetHidden: () => true,
      now: () => new Date("2026-05-04T15:00:00"),
    });

    assert.strictEqual(ctrl.maybeShow(), false);
    assert.strictEqual(fsImpl.existsSync("C:/fake/flag-hidden"), false);
  });

  it("defers during quiet hours (22:00 - 08:00)", () => {
    const fsImpl = makeFakeFs();
    const tracker = { shown: [], supported: true };
    const Notification = makeFakeNotification(tracker);
    const { schedule, cancel } = makeImmediateScheduler();

    const ctrl = createOnboardingController({
      Notification,
      flagPath: "C:/fake/flag-night",
      fsImpl,
      schedule,
      cancel,
      now: () => new Date("2026-05-04T23:30:00"),
    });

    assert.strictEqual(ctrl.maybeShow(), false);
    assert.strictEqual(fsImpl.existsSync("C:/fake/flag-night"), false);
  });

  it("does not show if state flips to DND between schedule and fire", () => {
    const fsImpl = makeFakeFs();
    const tracker = { shown: [], supported: true };
    const Notification = makeFakeNotification(tracker);
    let dnd = false;
    let scheduledFn = null;
    function schedule(fn) {
      scheduledFn = fn;
      return { fn };
    }
    function cancel() {}

    const ctrl = createOnboardingController({
      Notification,
      flagPath: "C:/fake/flag-flip",
      fsImpl,
      schedule,
      cancel,
      isDoNotDisturb: () => dnd,
      now: () => new Date("2026-05-04T15:00:00"),
    });

    assert.strictEqual(ctrl.maybeShow(), true);
    assert.ok(scheduledFn);
    dnd = true;
    scheduledFn();
    assert.strictEqual(tracker.shown.length, 0);
    assert.strictEqual(fsImpl.existsSync("C:/fake/flag-flip"), false);
  });
});
