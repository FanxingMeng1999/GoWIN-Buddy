const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  DEFAULT_RIOS_LEGACY_PROFILE,
  resolveRiosLegacyProfile,
} = require("../src/rios-legacy-profile");

describe("rios-legacy-profile", () => {
  it("returns defaults when env is empty", () => {
    const profile = resolveRiosLegacyProfile({});
    assert.strictEqual(profile.profileId, DEFAULT_RIOS_LEGACY_PROFILE.profileId);
    assert.strictEqual(profile.dashboardClickWindowMs, DEFAULT_RIOS_LEGACY_PROFILE.dashboardClickWindowMs);
    assert.strictEqual(profile.defaultClickWindowMs, DEFAULT_RIOS_LEGACY_PROFILE.defaultClickWindowMs);
    assert.strictEqual(profile.dashboardHoverCards, true);
    assert.strictEqual(profile.dashboardDoubleClickOpen, true);
    assert.strictEqual(profile.reactionDurationScale, 1);
    assert.strictEqual(profile.rewardSignalCooldownMs, 0);
    assert.strictEqual(profile.wellnessReminderEnabled, true);
    assert.strictEqual(profile.wellnessReminderIntervalMs, DEFAULT_RIOS_LEGACY_PROFILE.wellnessReminderIntervalMs);
    assert.strictEqual(profile.wellnessReminderDurationMs, DEFAULT_RIOS_LEGACY_PROFILE.wellnessReminderDurationMs);
    assert.strictEqual(profile.wellnessReminderStartupDelayMs, DEFAULT_RIOS_LEGACY_PROFILE.wellnessReminderStartupDelayMs);
    assert.deepStrictEqual(profile.statePriorityOverrides, {});
  });

  it("accepts numeric and boolean overrides", () => {
    const profile = resolveRiosLegacyProfile({
      GOWIN_DASHBOARD_CLICK_WINDOW_MS: "310",
      GOWIN_DEFAULT_CLICK_WINDOW_MS: "450",
      GOWIN_DASHBOARD_HOVER_CARDS: "false",
      GOWIN_DASHBOARD_DOUBLE_CLICK_OPEN: "0",
      GOWIN_REACTION_DURATION_SCALE: "1.35",
      GOWIN_REWARD_SIGNAL_COOLDOWN_MS: "12000",
      GOWIN_WELLNESS_REMINDER_ENABLED: "false",
      GOWIN_WELLNESS_REMINDER_INTERVAL_MS: "2400000",
      GOWIN_WELLNESS_REMINDER_DURATION_MS: "7800",
      GOWIN_WELLNESS_REMINDER_STARTUP_DELAY_MS: "240000",
      GOWIN_STATE_PRIORITY_OVERRIDES: "{\"working\":10,\"attention\":6,\"bad\":2}",
    });
    assert.strictEqual(profile.dashboardClickWindowMs, 310);
    assert.strictEqual(profile.defaultClickWindowMs, 450);
    assert.strictEqual(profile.dashboardHoverCards, false);
    assert.strictEqual(profile.dashboardDoubleClickOpen, false);
    assert.strictEqual(profile.reactionDurationScale, 1.35);
    assert.strictEqual(profile.rewardSignalCooldownMs, 12000);
    assert.strictEqual(profile.wellnessReminderEnabled, false);
    assert.strictEqual(profile.wellnessReminderIntervalMs, 2400000);
    assert.strictEqual(profile.wellnessReminderDurationMs, 7800);
    assert.strictEqual(profile.wellnessReminderStartupDelayMs, 240000);
    assert.deepStrictEqual(profile.statePriorityOverrides, { working: 10, attention: 6 });
  });

  it("falls back when extra profile overrides are invalid", () => {
    const profile = resolveRiosLegacyProfile({
      GOWIN_REACTION_DURATION_SCALE: "-2",
      GOWIN_REWARD_SIGNAL_COOLDOWN_MS: "-1",
      GOWIN_WELLNESS_REMINDER_INTERVAL_MS: "0",
      GOWIN_WELLNESS_REMINDER_DURATION_MS: "-90",
      GOWIN_WELLNESS_REMINDER_STARTUP_DELAY_MS: "",
      GOWIN_STATE_PRIORITY_OVERRIDES: "{invalid-json",
    });
    assert.strictEqual(profile.reactionDurationScale, 1);
    assert.strictEqual(profile.rewardSignalCooldownMs, 0);
    assert.strictEqual(profile.wellnessReminderIntervalMs, DEFAULT_RIOS_LEGACY_PROFILE.wellnessReminderIntervalMs);
    assert.strictEqual(profile.wellnessReminderDurationMs, DEFAULT_RIOS_LEGACY_PROFILE.wellnessReminderDurationMs);
    assert.strictEqual(profile.wellnessReminderStartupDelayMs, DEFAULT_RIOS_LEGACY_PROFILE.wellnessReminderStartupDelayMs);
    assert.deepStrictEqual(profile.statePriorityOverrides, {});
  });
});
