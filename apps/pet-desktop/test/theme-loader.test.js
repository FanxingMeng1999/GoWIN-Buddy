const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");
const themeLoader = require("../src/theme-loader");

const REST_POSE_SUFFIXES = new Set(["sleeping.svg", "error.svg"]);

describe("theme-loader built-in themes", () => {
  it("discovers the newly added built-in themes", () => {
    const srcDir = path.resolve(__dirname, "..", "src");
    const fakeUserData = path.resolve(__dirname, "..", ".tmp-theme-test");
    themeLoader.init(srcDir, fakeUserData);

    const themes = themeLoader.discoverThemes();
    const ids = themes.map((theme) => theme.id);
    assert.strictEqual(themes[0].id, "clawd");
    assert.ok(ids.includes("clawd"));
    assert.ok(ids.includes("mint-chip"));
    assert.ok(ids.includes("blue-hour"));
    assert.ok(ids.includes("strawberry-milk"));
    assert.ok(ids.includes("matcha-lab"));
    assert.ok(ids.includes("sunset-soda"));
    assert.ok(ids.includes("paper-parade"));
    assert.ok(ids.includes("aurora-pop"));
    assert.ok(ids.includes("campfire-cocoa"));
    assert.ok(ids.includes("pixel-pro"));
    assert.ok(!ids.includes("template"));
    const matchaTheme = themes.find((theme) => theme.id === "matcha-lab");
    assert.ok(matchaTheme && matchaTheme.preview);
    assert.strictEqual(matchaTheme.preview.swatches.length, 3);
  });

  it("loads the original Sprout Pro SVG theme through the normal asset resolver", () => {
    themeLoader.init(path.resolve(__dirname, "..", "src"), path.resolve(__dirname, "..", ".tmp-theme-test"));
    const theme = themeLoader.loadTheme("pixel-pro");
    const cfg = themeLoader.getRendererConfig();
    const file = "pixel-pro-peach-working-focus.svg";
    assert.strictEqual(theme._builtin, true);
    assert.strictEqual(theme.visualQuality.style, "original-vector-sprout");
    assert.strictEqual(cfg.assetUrls[file], "../assets/svg/" + file);
    assert.ok(fs.existsSync(path.resolve(__dirname, "..", "assets", "svg", file)));
    assert.ok(themeLoader.collectThemeAssetFiles(theme).includes(file));
  });

  it("loads the default clawd theme with matching reminder and quick-task surfaces", () => {
    const srcDir = path.resolve(__dirname, "..", "src");
    const fakeUserData = path.resolve(__dirname, "..", ".tmp-theme-test");
    themeLoader.init(srcDir, fakeUserData);

    const theme = themeLoader.loadTheme("clawd");
    assert.strictEqual(theme._id, "clawd");
    assert.strictEqual(theme.reminderCard.variant, "grid");
    assert.strictEqual(theme.quickTaskCard.variant, "grid");
    assert.strictEqual(theme.quickTaskCard.textMain, "#2f3647");
  });

  it("loads a custom built-in palette without falling back to clawd", () => {
    const srcDir = path.resolve(__dirname, "..", "src");
    const fakeUserData = path.resolve(__dirname, "..", ".tmp-theme-test");
    themeLoader.init(srcDir, fakeUserData);

    const theme = themeLoader.loadTheme("blue-hour");
    assert.strictEqual(theme._id, "blue-hour");
    assert.strictEqual(theme._builtin, true);
    assert.strictEqual(theme.states.idle[0], "blue-hour-idle-follow.svg");
    assert.strictEqual(theme.reactions.drag.file, "blue-hour-react-drag.svg");
    assert.strictEqual(theme.miniMode.states["mini-idle"][0], "blue-hour-mini-idle.svg");
    assert.strictEqual(theme.reminderCard.variant, "night");
    assert.strictEqual(theme.dashboardTheme.variant, "night");
    assert.ok(Array.isArray(theme.preview.swatches));
  });

  it("loads the newly added richer built-in themes with their own reminder variants", () => {
    const srcDir = path.resolve(__dirname, "..", "src");
    const fakeUserData = path.resolve(__dirname, "..", ".tmp-theme-test");
    themeLoader.init(srcDir, fakeUserData);

    const theme = themeLoader.loadTheme("paper-parade");
    assert.strictEqual(theme._id, "paper-parade");
    assert.strictEqual(theme._builtin, true);
    assert.strictEqual(theme.states.idle[0], "paper-parade-idle-follow.svg");
    assert.strictEqual(theme.reactions.drag.file, "paper-parade-react-drag.svg");
    assert.strictEqual(theme.reminderCard.variant, "paper");
    assert.strictEqual(theme.quickTaskCard.variant, "paper");
    assert.strictEqual(theme.dashboardTheme.variant, "paper");
  });

  it("injects a theme decal into every generated action asset", () => {
    const svgDir = path.resolve(__dirname, "..", "assets", "svg");
    const themedFiles = fs
      .readdirSync(svgDir)
      .filter((name) => name.startsWith("mint-chip-") && name.endsWith(".svg"));

    for (const fileName of themedFiles) {
      const suffix = fileName.slice("mint-chip-".length);
      const svg = fs.readFileSync(path.join(svgDir, fileName), "utf8");
      const expectedId = suffix.startsWith("mini-")
        ? "mint-chip-mini-accent"
        : (/sleep|doze|collapse/.test(suffix) || REST_POSE_SUFFIXES.has(suffix))
          ? "mint-chip-rest-accent"
          : "mint-chip-idle-accent";

      assert.ok(svg.includes(`id="${expectedId}"`), `${fileName} should contain ${expectedId}`);
    }
  });

  it("keeps original accents and eyes inside the tracked animated body", () => {
    const dir = path.resolve(__dirname, "..", "assets", "svg");
    for (const name of fs.readdirSync(dir).filter(f => f.startsWith("mint-chip-"))) {
      const svg = fs.readFileSync(path.join(dir, name), "utf8");
      assert.ok(svg.indexOf('id="mint-chip-') > svg.indexOf('id="body-js"'), name);
      assert.ok(svg.indexOf('id="mint-chip-') < svg.indexOf('id="eyes-js"'), name);
      assert.ok(svg.includes('id="shadow-js"'), name);
      assert.ok(svg.includes("original artwork by FanxingMeng1999 (MIT)"), name);
    }
  });

  it("ships all referenced assets for every bundled original theme", () => {
    themeLoader.init(path.resolve(__dirname, "..", "src"), path.resolve(__dirname, "..", ".tmp-theme-test"));
    for (const entry of themeLoader.discoverThemes()) {
      const theme = themeLoader.loadTheme(entry.id);
      assert.strictEqual(theme.license, "MIT");
      for (const name of themeLoader.collectThemeAssetFiles(theme)) {
        assert.ok(fs.existsSync(path.resolve(__dirname, "..", "assets", "svg", name)), entry.id + ": " + name);
      }
    }
  });
});
