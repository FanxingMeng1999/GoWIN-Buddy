const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  getLevelSnapshot,
  getXpRequirementForLevel,
  getLevelTitle,
} = require("../src/pet-level");

describe("pet-level requirement formula", () => {
  it("matches dashboard formula 80 + (level-1)*25", () => {
    assert.strictEqual(getXpRequirementForLevel(1), 80);
    assert.strictEqual(getXpRequirementForLevel(2), 105);
    assert.strictEqual(getXpRequirementForLevel(5), 180);
  });
});

describe("pet-level snapshot edges", () => {
  it("returns level 1 with zero progress for empty xp", () => {
    const snap = getLevelSnapshot(0);
    assert.strictEqual(snap.level, 1);
    assert.strictEqual(snap.currentXp, 0);
    assert.strictEqual(snap.nextXp, 80);
    assert.strictEqual(snap.percent, 0);
    assert.strictEqual(snap.title, "科研萌新");
  });

  it("levels up the moment xp reaches the requirement", () => {
    const snap = getLevelSnapshot(80);
    assert.strictEqual(snap.level, 2);
    assert.strictEqual(snap.currentXp, 0);
    assert.strictEqual(snap.nextXp, 105);
    assert.strictEqual(snap.percent, 0);
  });

  it("computes mid-level percent rounded", () => {
    const snap = getLevelSnapshot(80 + 50);
    assert.strictEqual(snap.level, 2);
    assert.strictEqual(snap.currentXp, 50);
    assert.strictEqual(snap.nextXp, 105);
    assert.strictEqual(snap.percent, Math.round((50 / 105) * 100));
  });

  it("clamps negative or non-numeric input", () => {
    const negSnap = getLevelSnapshot(-5);
    assert.strictEqual(negSnap.level, 1);
    assert.strictEqual(negSnap.totalXp, 0);
    const nanSnap = getLevelSnapshot("abc");
    assert.strictEqual(nanSnap.level, 1);
    assert.strictEqual(nanSnap.totalXp, 0);
  });

  it("caps title catalogue at the highest entry", () => {
    assert.strictEqual(getLevelTitle(1), "科研萌新");
    assert.strictEqual(getLevelTitle(8), "科研统帅");
    assert.strictEqual(getLevelTitle(99), "科研统帅");
  });
});
