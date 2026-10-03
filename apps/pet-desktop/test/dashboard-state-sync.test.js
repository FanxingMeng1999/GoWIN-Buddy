const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { mergeDashboardState } = require("../../rpg-hub/web/state-sync");

describe("dashboard state conflict handling", () => {
  it("preserves two independently added tasks", () => {
    const result = mergeDashboardState({ tasks: [] }, { tasks: [{ id: "local", name: "local" }] }, { tasks: [{ id: "remote", name: "remote" }] });
    assert.deepEqual(result.conflicts, []);
    assert.deepEqual(result.state.tasks.map(task => task.id).sort(), ["local", "remote"]);
  });
  it("keeps a remote reward when the local user edits a task", () => {
    const base = { tasks: [{ id: 1, name: "original" }], gameState: { xp: 0 } };
    const result = mergeDashboardState(base, { ...base, tasks: [{ id: 1, name: "edited" }] }, { ...base, gameState: { xp: 80 } });
    assert.deepEqual(result.conflicts, []);
    assert.equal(result.state.tasks[0].name, "edited");
    assert.equal(result.state.gameState.xp, 80);
    assert.equal(base.tasks[0].name, "original");
  });
  it("reports conflicting rewards instead of duplicating or discarding them", () => {
    const result = mergeDashboardState({ xp: 0 }, { xp: 10 }, { xp: 20 });
    assert.deepEqual(result.conflicts, [".xp"]);
  });
  it("merges an independent deletion and addition", () => {
    const result = mergeDashboardState({ tasks: [{ id: 1, name: "old" }] }, { tasks: [] }, { tasks: [{ id: 1, name: "old" }, { id: 2, name: "new" }] });
    assert.deepEqual(result.conflicts, []);
    assert.deepEqual(result.state.tasks, [{ id: 2, name: "new" }]);
  });
  it("does not silently delete a task another client changed", () => {
    const result = mergeDashboardState({ tasks: [{ id: 1, name: "old" }] }, { tasks: [] }, { tasks: [{ id: 1, name: "edited" }] });
    assert.equal(result.conflicts.length, 1);
  });
  it("handles identical edits and missing object fields", () => {
    const result = mergeDashboardState({}, { meta: { local: true } }, { meta: { remote: true } });
    assert.deepEqual(result, { state: { meta: { local: true, remote: true } }, conflicts: [] });
    assert.deepEqual(mergeDashboardState({ value: 1 }, { value: 2 }, { value: 2 }).conflicts, []);
  });
  it("treats ambiguous arrays and duplicate identifiers as a conflict", () => {
    assert.equal(mergeDashboardState([1], [2], [3]).conflicts.length, 1);
    assert.equal(mergeDashboardState([], [{ id: 1 }, { id: 1 }], [{ id: 2 }]).conflicts.length, 1);
  });
});
