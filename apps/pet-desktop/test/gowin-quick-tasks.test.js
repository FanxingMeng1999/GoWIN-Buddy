const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  addCustomTodo,
  buildQuickTaskSnapshot,
  claimTempTodo,
  getTodayKey,
  setTodoChecked,
  toggleWorkClock,
} = require("../src/gowin-quick-tasks");

describe("gowin-quick-tasks ddl support", () => {
  it("stores temporary todo deadline and returns deadline metadata in snapshot", () => {
    const now = Date.now();
    const deadlineAt = now + (2 * 60 * 60 * 1000);

    const state = addCustomTodo({}, {
      name: "准备 EAA 材料",
      cadence: "temporary",
      deadlineAt,
    });

    assert.ok(Array.isArray(state.tasks));
    assert.strictEqual(state.tasks[0].dueAt, deadlineAt);

    const snapshot = buildQuickTaskSnapshot(state, getTodayKey(new Date(now)));
    const todo = snapshot.todos.find((item) => item.title === "准备 EAA 材料");
    assert.ok(todo);
    assert.strictEqual(todo.dueAt, deadlineAt);
    assert.strictEqual(todo.isOverdue, false);
    assert.match(todo.dueLabel, /^DDL /);
  });

  it("ignores deadline input for non-temporary todos", () => {
    const deadlineAt = Date.now() + (60 * 60 * 1000);
    const state = addCustomTodo({}, {
      name: "写周报",
      cadence: "daily",
      deadlineAt,
    });

    assert.strictEqual(state.tasks[0].dueAt, null);

    const snapshot = buildQuickTaskSnapshot(state);
    const todo = snapshot.todos.find((item) => item.title === "写周报");
    assert.ok(todo);
    assert.strictEqual(todo.dueAt, null);
    assert.strictEqual(todo.dueLabel, "");
  });

  it("marks temporary todo as overdue when deadline is in the past", () => {
    const now = Date.now();
    const originalNow = Date.now;
    Date.now = () => now;
    try {
      const deadlineAt = now - (5 * 60 * 1000);
      const state = addCustomTodo({}, {
        name: "过期提醒测试",
        cadence: "temporary",
        deadlineAt,
      });
      const snapshot = buildQuickTaskSnapshot(state, getTodayKey(new Date(now)));
      const todo = snapshot.todos.find((item) => item.title === "过期提醒测试");
      assert.ok(todo);
      assert.strictEqual(todo.isOverdue, true);
    } finally {
      Date.now = originalNow;
    }
  });
});

describe("gowin-quick-tasks snapshot levelStats", () => {
  it("includes a default Lv.1 levelStats when state has no xp", () => {
    const snapshot = buildQuickTaskSnapshot({}, getTodayKey());
    assert.ok(snapshot.levelStats);
    assert.strictEqual(snapshot.levelStats.level, 1);
    assert.strictEqual(snapshot.levelStats.totalXp, 0);
    assert.strictEqual(snapshot.levelStats.percent, 0);
    assert.strictEqual(typeof snapshot.levelStats.title, "string");
  });

  it("propagates gameState.xp through to levelStats", () => {
    const snapshot = buildQuickTaskSnapshot({
      gameState: { xp: 80 + 60 + 25 },
    }, getTodayKey());
    assert.strictEqual(snapshot.levelStats.totalXp, 165);
    assert.ok(snapshot.levelStats.level >= 2);
  });
});

describe("gowin-quick-tasks claimTempTodo", () => {
  it("removes a checked temporary todo from snapshot after panel claim", () => {
    const todayKey = getTodayKey();
    let state = addCustomTodo({}, { name: "倒杯水", cadence: "temporary" }, todayKey);
    const id = state.tasks[0].id;
    state = setTodoChecked(state, id, true, todayKey);

    const beforeClaim = buildQuickTaskSnapshot(state, todayKey);
    assert.ok(beforeClaim.todos.find((todo) => todo.id === id), "checked temp todo should still be visible before claim");

    state = claimTempTodo(state, id, todayKey);
    const afterClaim = buildQuickTaskSnapshot(state, todayKey);
    assert.strictEqual(afterClaim.todos.find((todo) => todo.id === id), undefined);

    const stored = state.tasks.find((task) => task.id === id);
    assert.ok(stored.quickTask.cleaned);
    assert.strictEqual(stored.quickTask.cleanedByClaim, "quick-task-panel");
  });

  it("does nothing for non-temporary or unchecked todos", () => {
    const todayKey = getTodayKey();
    let state = addCustomTodo({}, { name: "周复盘", cadence: "weekly" }, todayKey);
    const weeklyId = state.tasks[0].id;
    state = setTodoChecked(state, weeklyId, true, todayKey);
    const beforeWeekly = JSON.stringify(state.tasks[0].quickTask);
    state = claimTempTodo(state, weeklyId, todayKey);
    assert.strictEqual(JSON.stringify(state.tasks[0].quickTask), beforeWeekly);

    state = addCustomTodo(state, { name: "倒杯水", cadence: "temporary" }, todayKey);
    const tempId = state.tasks[0].id;
    const beforeTemp = JSON.stringify(state.tasks[0].quickTask);
    state = claimTempTodo(state, tempId, todayKey);
    assert.strictEqual(JSON.stringify(state.tasks[0].quickTask), beforeTemp);
  });
});

describe("gowin-quick-tasks toggleWorkClock", () => {
  it("starts a work session in dashboard-compatible shape and closes it on second toggle", () => {
    const todayKey = getTodayKey();
    let state = {};
    state = toggleWorkClock(state, todayKey, 1_700_000_000_000);
    let sessions = state.workRecords[todayKey].sessions;
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].start, 1_700_000_000_000);
    // dashboard.html uses strict `=== null` to detect active sessions.
    assert.strictEqual(sessions[0].end, null);
    assert.strictEqual(typeof sessions[0].startTimeStr, "string");
    assert.match(sessions[0].startTimeStr, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.strictEqual(sessions[0].endTimeStr, null);
    assert.strictEqual(sessions[0].duration, 0);

    let snapshot = buildQuickTaskSnapshot(state, todayKey);
    assert.strictEqual(snapshot.workStatus.active, true);
    assert.strictEqual(snapshot.workStatus.hasClockIn, true);

    state = toggleWorkClock(state, todayKey, 1_700_000_000_000 + (45 * 60 * 1000));
    sessions = state.workRecords[todayKey].sessions;
    assert.strictEqual(sessions.length, 1);
    assert.ok(sessions[0].end > sessions[0].start);
    assert.match(sessions[0].endTimeStr, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.strictEqual(sessions[0].duration, 45);

    snapshot = buildQuickTaskSnapshot(state, todayKey);
    assert.strictEqual(snapshot.workStatus.active, false);
    assert.strictEqual(snapshot.workStatus.hasClockIn, true);
    assert.strictEqual(snapshot.workStatus.totalMinutes, 45);
  });

  it("starts a fresh session when previous session is already closed", () => {
    const todayKey = getTodayKey();
    const start1 = 1_700_000_000_000;
    let state = toggleWorkClock({}, todayKey, start1);
    state = toggleWorkClock(state, todayKey, start1 + 60 * 60 * 1000);
    state = toggleWorkClock(state, todayKey, start1 + 2 * 60 * 60 * 1000);
    const sessions = state.workRecords[todayKey].sessions;
    assert.strictEqual(sessions.length, 2);
    assert.strictEqual(sessions[1].start, start1 + 2 * 60 * 60 * 1000);
    assert.strictEqual(sessions[1].end, null);
  });
});
