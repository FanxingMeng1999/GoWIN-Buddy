const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  createQuickTaskShortcutController,
  DEFAULT_QUICK_TASK_SHORTCUT,
} = require("../src/quick-task-shortcut");

function makeFakeShortcut(opts = {}) {
  const { registerReturn = true } = opts;
  const calls = { register: [], unregister: [] };
  const handlers = new Map();
  return {
    calls,
    handlers,
    register(accelerator, handler) {
      calls.register.push(accelerator);
      handlers.set(accelerator, handler);
      return registerReturn;
    },
    unregister(accelerator) {
      calls.unregister.push(accelerator);
      handlers.delete(accelerator);
    },
    fire(accelerator) {
      const handler = handlers.get(accelerator);
      if (handler) handler();
    },
  };
}

describe("quick-task-shortcut", () => {
  it("registers and unregisters with the default accelerator", () => {
    const fake = makeFakeShortcut();
    const ctrl = createQuickTaskShortcutController({
      globalShortcut: fake,
      getQuickTaskPanel: () => null,
    });
    ctrl.register();
    assert.deepStrictEqual(fake.calls.register, [DEFAULT_QUICK_TASK_SHORTCUT]);
    ctrl.unregister();
    assert.deepStrictEqual(fake.calls.unregister, [DEFAULT_QUICK_TASK_SHORTCUT]);
  });

  it("opens the quick-task panel pinned and immediately when triggered", () => {
    const fake = makeFakeShortcut();
    const showCalls = [];
    const panel = { show: (opts) => { showCalls.push(opts); } };
    const ctrl = createQuickTaskShortcutController({
      globalShortcut: fake,
      getQuickTaskPanel: () => panel,
    });
    ctrl.register();
    fake.fire(DEFAULT_QUICK_TASK_SHORTCUT);
    assert.strictEqual(showCalls.length, 1);
    assert.deepStrictEqual(showCalls[0], { pinned: true, immediate: true });
  });

  it("is a no-op when no quick-task panel is available", () => {
    const fake = makeFakeShortcut();
    const ctrl = createQuickTaskShortcutController({
      globalShortcut: fake,
      getQuickTaskPanel: () => null,
    });
    ctrl.register();
    assert.doesNotThrow(() => fake.fire(DEFAULT_QUICK_TASK_SHORTCUT));
  });

  it("is a no-op when panel object lacks show", () => {
    const fake = makeFakeShortcut();
    const ctrl = createQuickTaskShortcutController({
      globalShortcut: fake,
      getQuickTaskPanel: () => ({}),
    });
    ctrl.register();
    assert.doesNotThrow(() => fake.fire(DEFAULT_QUICK_TASK_SHORTCUT));
  });

  it("logs a warning instead of throwing when register fails", () => {
    const fake = {
      register: () => { throw new Error("conflict"); },
      unregister: () => {},
    };
    const warnCalls = [];
    const ctrl = createQuickTaskShortcutController({
      globalShortcut: fake,
      getQuickTaskPanel: () => null,
      logger: { warn: (...args) => warnCalls.push(args) },
    });
    ctrl.register();
    assert.strictEqual(warnCalls.length, 1);
  });

  it("supports a custom accelerator", () => {
    const fake = makeFakeShortcut();
    const ctrl = createQuickTaskShortcutController({
      globalShortcut: fake,
      getQuickTaskPanel: () => null,
      shortcut: "CommandOrControl+Shift+T",
    });
    ctrl.register();
    assert.deepStrictEqual(fake.calls.register, ["CommandOrControl+Shift+T"]);
  });

  it("does not register or unregister when enabled is false", () => {
    const fake = makeFakeShortcut();
    const ctrl = createQuickTaskShortcutController({
      globalShortcut: fake,
      getQuickTaskPanel: () => null,
      enabled: false,
    });
    ctrl.register();
    ctrl.unregister();
    assert.strictEqual(fake.calls.register.length, 0);
    assert.strictEqual(fake.calls.unregister.length, 0);
    assert.strictEqual(ctrl.didLastRegisterFail(), false);
  });

  it("flags a register failure when globalShortcut.register returns false", () => {
    const fake = makeFakeShortcut({ registerReturn: false });
    const warnCalls = [];
    const ctrl = createQuickTaskShortcutController({
      globalShortcut: fake,
      getQuickTaskPanel: () => null,
      logger: { warn: (...args) => warnCalls.push(args) },
    });
    ctrl.register();
    assert.strictEqual(ctrl.didLastRegisterFail(), true);
    assert.strictEqual(warnCalls.length, 1);
    assert.match(String(warnCalls[0][0]), /taken by another application/);
  });

  it("flags failure also when register throws", () => {
    const fake = {
      register: () => { throw new Error("conflict"); },
      unregister: () => {},
    };
    const ctrl = createQuickTaskShortcutController({
      globalShortcut: fake,
      getQuickTaskPanel: () => null,
      logger: { warn: () => {} },
    });
    ctrl.register();
    assert.strictEqual(ctrl.didLastRegisterFail(), true);
  });
});
