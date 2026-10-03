"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

// ── Defaults (used when theme.json omits optional fields) ──

const DEFAULT_SOUNDS = {
  complete: "complete.wav",
  confirm:  "confirm.wav",
};

const DEFAULT_TIMINGS = {
  minDisplay: {
    attention: 4000, error: 5000, sweeping: 5500,
    notification: 2500, carrying: 3000, working: 1000, thinking: 1000,
  },
  autoReturn: {
    attention: 4000, error: 5000, sweeping: 300000,
    notification: 2500, carrying: 3000,
  },
  yawnDuration: 3000,
  wakeDuration: 1500,
  deepSleepTimeout: 600000,
  mouseIdleTimeout: 20000,
  mouseSleepTimeout: 60000,
};

const DEFAULT_HITBOXES = {
  default:  { x: -1, y: 5, w: 17, h: 12 },
  sleeping: { x: -2, y: 9, w: 19, h: 7 },
  wide:     { x: -3, y: 3, w: 21, h: 14 },
};

const DEFAULT_OBJECT_SCALE = {
  widthRatio: 1.9, heightRatio: 1.3,
  offsetX: -0.45, offsetY: -0.25,
};

const UI_VARIANTS = new Set(["grid", "night", "milk", "lab", "soda", "paper", "aurora", "cocoa"]);

const DEFAULT_DASHBOARD_THEME = {
  variant: "grid",
  pageStart: "#FFF7E8",
  pageEnd: "#FFFAF0",
  pageGlow: "rgba(255, 211, 130, 0.22)",
  surfaceBg: "rgba(255,255,255,0.78)",
  surfaceStrongBg: "rgba(255,255,255,0.96)",
  surfaceMutedBg: "rgba(255,249,240,0.95)",
  surfaceBorder: "rgba(255, 196, 102, 0.28)",
  surfaceShadow: "0 14px 30px rgba(255, 194, 99, 0.12)",
  textMain: "#24324a",
  textMuted: "#6b7280",
  accentStrong: "#FF8C42",
  accentAlt: "#FF6B8B",
  accentMint: "#43AA8B",
  accentSky: "#4D9DE0",
  accentPurple: "#9B5DE5",
  accentYellow: "#F9C74F",
  accentCoral: "#F48C6E",
  accentLime: "#A7C957",
  chipBg: "rgba(255, 247, 231, 0.92)",
  chipText: "#FF8C42",
  idleButtonFrom: "#43AA8B",
  idleButtonTo: "#22C55E",
  activeButtonFrom: "#FF6B8B",
  activeButtonTo: "#F43F5E",
  scrollbarTrack: "#FFE8D6",
  scrollbarThumb: "#FF8C42",
  modalBorder: "#FF8C42",
  ornament: "rgba(255, 255, 255, 0.56)",
};

const DEFAULT_THEME_PREVIEW = {
  swatches: ["#FF8C42", "#FF6B8B", "rgba(255,255,255,0.92)"],
  accent: "#DE886D",
  surface: "rgba(255,255,255,0.92)",
};

const DEFAULT_EYE_TRACKING = {
  enabled: false,
  states: [],
  eyeRatioX: 0.5,
  eyeRatioY: 0.5,
  maxOffset: 3,
  bodyScale: 0.33,
  shadowStretch: 0.15,
  shadowShift: 0.3,
  ids: { eyes: "eyes-js", body: "body-js", shadow: "shadow-js", dozeEyes: "eyes-doze" },
  shadowOrigin: "7.5px 15px",
};

const REQUIRED_STATES = ["idle", "working", "thinking", "sleeping", "waking"];

function normalizeText(value, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function normalizeDashboardTheme(theme = {}, quickTaskCard = {}, reminderCard = {}) {
  const raw = theme && typeof theme === "object" ? theme : {};
  const quick = quickTaskCard && typeof quickTaskCard === "object" ? quickTaskCard : {};
  const reminder = reminderCard && typeof reminderCard === "object" ? reminderCard : {};
  const variant = normalizeText(raw.variant || reminder.variant, DEFAULT_DASHBOARD_THEME.variant).toLowerCase();
  return {
    variant: UI_VARIANTS.has(variant) ? variant : DEFAULT_DASHBOARD_THEME.variant,
    pageStart: normalizeText(raw.pageStart, reminder.cardBg || quick.panelBg || DEFAULT_DASHBOARD_THEME.pageStart),
    pageEnd: normalizeText(raw.pageEnd, quick.summaryBg || DEFAULT_DASHBOARD_THEME.pageEnd),
    pageGlow: normalizeText(raw.pageGlow, reminder.accentSoft || DEFAULT_DASHBOARD_THEME.pageGlow),
    surfaceBg: normalizeText(raw.surfaceBg, quick.panelBg || reminder.cardBg || DEFAULT_DASHBOARD_THEME.surfaceBg),
    surfaceStrongBg: normalizeText(raw.surfaceStrongBg, quick.itemBg || DEFAULT_DASHBOARD_THEME.surfaceStrongBg),
    surfaceMutedBg: normalizeText(raw.surfaceMutedBg, quick.summaryBg || DEFAULT_DASHBOARD_THEME.surfaceMutedBg),
    surfaceBorder: normalizeText(raw.surfaceBorder, quick.panelBorder || reminder.cardBorder || DEFAULT_DASHBOARD_THEME.surfaceBorder),
    surfaceShadow: normalizeText(raw.surfaceShadow, quick.panelShadow || reminder.cardShadow || DEFAULT_DASHBOARD_THEME.surfaceShadow),
    textMain: normalizeText(raw.textMain, quick.textMain || reminder.titleColor || DEFAULT_DASHBOARD_THEME.textMain),
    textMuted: normalizeText(raw.textMuted, quick.textMuted || reminder.bodyColor || DEFAULT_DASHBOARD_THEME.textMuted),
    accentStrong: normalizeText(raw.accentStrong, reminder.accentStrong || quick.chipText || DEFAULT_DASHBOARD_THEME.accentStrong),
    accentAlt: normalizeText(raw.accentAlt, quick.autoDot || quick.success || DEFAULT_DASHBOARD_THEME.accentAlt),
    accentMint: normalizeText(raw.accentMint, quick.success || DEFAULT_DASHBOARD_THEME.accentMint),
    accentSky: normalizeText(raw.accentSky, quick.autoDot || DEFAULT_DASHBOARD_THEME.accentSky),
    accentPurple: normalizeText(raw.accentPurple, quick.autoDot || DEFAULT_DASHBOARD_THEME.accentPurple),
    accentYellow: normalizeText(raw.accentYellow, quick.chipText || DEFAULT_DASHBOARD_THEME.accentYellow),
    accentCoral: normalizeText(raw.accentCoral, raw.accentStrong || reminder.accentStrong || DEFAULT_DASHBOARD_THEME.accentCoral),
    accentLime: normalizeText(raw.accentLime, quick.success || DEFAULT_DASHBOARD_THEME.accentLime),
    chipBg: normalizeText(raw.chipBg, quick.chipBg || reminder.accentSoft || DEFAULT_DASHBOARD_THEME.chipBg),
    chipText: normalizeText(raw.chipText, quick.chipText || reminder.accentStrong || DEFAULT_DASHBOARD_THEME.chipText),
    idleButtonFrom: normalizeText(raw.idleButtonFrom, quick.success || DEFAULT_DASHBOARD_THEME.idleButtonFrom),
    idleButtonTo: normalizeText(raw.idleButtonTo, quick.autoDot || DEFAULT_DASHBOARD_THEME.idleButtonTo),
    activeButtonFrom: normalizeText(raw.activeButtonFrom, reminder.accentStrong || DEFAULT_DASHBOARD_THEME.activeButtonFrom),
    activeButtonTo: normalizeText(raw.activeButtonTo, quick.chipText || DEFAULT_DASHBOARD_THEME.activeButtonTo),
    scrollbarTrack: normalizeText(raw.scrollbarTrack, DEFAULT_DASHBOARD_THEME.scrollbarTrack),
    scrollbarThumb: normalizeText(raw.scrollbarThumb, quick.scrollThumb || DEFAULT_DASHBOARD_THEME.scrollbarThumb),
    modalBorder: normalizeText(raw.modalBorder, reminder.accentStrong || DEFAULT_DASHBOARD_THEME.modalBorder),
    ornament: normalizeText(raw.ornament, reminder.ornamentColor || quick.closeBg || DEFAULT_DASHBOARD_THEME.ornament),
  };
}

function normalizeThemePreview(preview = {}, dashboardTheme = {}) {
  const raw = preview && typeof preview === "object" ? preview : {};
  const dashboard = dashboardTheme && typeof dashboardTheme === "object" ? dashboardTheme : DEFAULT_DASHBOARD_THEME;
  const swatches = Array.isArray(raw.swatches)
    ? raw.swatches.map((item) => normalizeText(item)).filter(Boolean).slice(0, 3)
    : [];
  const fallbackSwatches = [
    dashboard.accentStrong || DEFAULT_THEME_PREVIEW.swatches[0],
    dashboard.accentAlt || DEFAULT_THEME_PREVIEW.swatches[1],
    dashboard.surfaceBg || DEFAULT_THEME_PREVIEW.swatches[2],
  ];
  while (swatches.length < 3) {
    swatches.push(fallbackSwatches[swatches.length]);
  }
  return {
    swatches,
    accent: normalizeText(raw.accent, dashboard.accentStrong || DEFAULT_THEME_PREVIEW.accent),
    surface: normalizeText(raw.surface, dashboard.surfaceBg || DEFAULT_THEME_PREVIEW.surface),
  };
}

// ── SVG sanitization config ──
const DANGEROUS_TAGS = new Set([
  "script", "foreignobject", "iframe", "embed", "object", "applet",
  "meta", "link", "base", "form", "input", "textarea", "button",
]);
const DANGEROUS_ATTR_RE = /^on/i;
const DANGEROUS_HREF_RE = /^\s*javascript\s*:/i;
const HREF_ATTRS = new Set(["href", "xlink:href", "src", "action", "formaction"]);

// ── State ──

let activeTheme = null;
let builtinThemesDir = null;   // set by init()
let assetsSvgDir = null;       // assets/svg/ for built-in theme
let assetsHiresDir = null;     // assets/hires/ for built-in raster/APNG theme assets
let assetsGifDir = null;       // assets/gif/ legacy animated assets
let assetsSoundsDir = null;    // assets/sounds/ for built-in theme
let userDataDir = null;        // app.getPath("userData") — set by init()
let userThemesDir = null;      // {userData}/themes/
let themeCacheDir = null;      // {userData}/theme-cache/

const MEDIA_ASSET_EXTENSIONS = new Set([".png", ".apng", ".gif", ".webp", ".jpg", ".jpeg"]);
const AUDIO_ASSET_EXTENSIONS = new Set([".mp3", ".wav", ".ogg"]);

// ── Public API ──

/**
 * Initialize the loader. Call once at startup from main.js.
 * @param {string} appDir - __dirname of the calling module (src/)
 * @param {string} userData - app.getPath("userData")
 */
function init(appDir, userData) {
  builtinThemesDir = path.join(appDir, "..", "themes");
  assetsSvgDir = path.join(appDir, "..", "assets", "svg");
  assetsHiresDir = path.join(appDir, "..", "assets", "hires");
  assetsGifDir = path.join(appDir, "..", "assets", "gif");
  assetsSoundsDir = path.join(appDir, "..", "assets", "sounds");
  if (userData) {
    userDataDir = userData;
    userThemesDir = path.join(userData, "themes");
    themeCacheDir = path.join(userData, "theme-cache");
  }
}

/**
 * Discover all available themes.
 * Scans built-in themes dir + {userData}/themes/
 * @returns {{ id: string, name: string, path: string, builtin: boolean }[]}
 */
function discoverThemes() {
  const themes = [];
  const seen = new Set();

  // Built-in themes
  if (builtinThemesDir) {
    _scanThemesDir(builtinThemesDir, true, themes, seen);
  }

  // User-installed themes (override built-in if same id)
  if (userThemesDir) {
    _scanThemesDir(userThemesDir, false, themes, seen);
  }

  themes.sort((left, right) => {
    const leftOrder = Number.isFinite(left.order) ? left.order : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isFinite(right.order) ? right.order : Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    if (left.builtin !== right.builtin) return left.builtin ? -1 : 1;
    return String(left.name || left.id || "").localeCompare(String(right.name || right.id || ""), "zh-Hans-CN", {
      sensitivity: "base",
      numeric: true,
    });
  });

  return themes;
}

function _scanThemesDir(dir, builtin, themes, seen) {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (seen.has(entry.name)) continue;
      const jsonPath = path.join(dir, entry.name, "theme.json");
      if (!fs.existsSync(jsonPath)) continue;
      try {
        const cfg = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
        if (cfg.discoverable === false) continue;
        const dashboardTheme = normalizeDashboardTheme(cfg.dashboardTheme, cfg.quickTaskCard, cfg.reminderCard);
        themes.push({
          id: entry.name,
          name: cfg.name || entry.name,
          path: jsonPath,
          builtin,
          description: cfg.description || "",
          order: Number.isFinite(cfg.order) ? cfg.order : Number.MAX_SAFE_INTEGER,
          preview: normalizeThemePreview(cfg.preview, dashboardTheme),
        });
        seen.add(entry.name);
      } catch { /* skip malformed */ }
    }
  } catch { /* dir not found */ }
}

/**
 * Load and activate a theme by ID.
 * @param {string} themeId
 * @returns {object} merged theme config
 */
function loadTheme(themeId) {
  // Try built-in first, then user themes dir
  const { raw, isBuiltin, themeDir } = _readThemeJson(themeId);

  if (!raw) {
    console.error(`[theme-loader] Theme "${themeId}" not found`);
    if (themeId !== "clawd") return loadTheme("clawd");
    throw new Error("Default theme 'clawd' not found");
  }

  const errors = validateTheme(raw, themeDir);
  if (errors.length > 0) {
    console.error(`[theme-loader] Theme "${themeId}" validation errors:`, errors);
    if (themeId !== "clawd") return loadTheme("clawd");
  }

  // Merge defaults for optional fields
  const theme = mergeDefaults(raw, themeId, isBuiltin);
  theme._themeDir = themeDir;

  // For external themes: sanitize SVGs + resolve asset paths
  if (!isBuiltin) {
    const assetsDir = _resolveExternalAssetsDir(themeId, themeDir);
    theme._assetsDir = assetsDir;
    theme._assetsFileUrl = pathToFileURL(assetsDir).href;
  } else {
    theme._assetsDir = assetsSvgDir;
    theme._assetsFileUrl = null; // built-in uses relative path
  }

  activeTheme = theme;
  return theme;
}

/**
 * Read theme.json from built-in or user themes directory.
 */
function _readThemeJson(themeId) {
  // Built-in first
  const builtinPath = path.join(builtinThemesDir, themeId, "theme.json");
  if (fs.existsSync(builtinPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(builtinPath, "utf8"));
      return { raw, isBuiltin: true, themeDir: path.join(builtinThemesDir, themeId) };
    } catch (e) {
      console.error(`[theme-loader] Failed to parse built-in theme "${themeId}":`, e.message);
    }
  }

  // User themes
  if (userThemesDir) {
    const userPath = path.join(userThemesDir, themeId, "theme.json");
    if (fs.existsSync(userPath)) {
      // Path traversal check: resolved path must be within userThemesDir
      const resolved = path.resolve(userPath);
      if (!resolved.startsWith(path.resolve(userThemesDir) + path.sep)) {
        console.error(`[theme-loader] Path traversal detected for theme "${themeId}"`);
        return { raw: null, isBuiltin: false, themeDir: null };
      }
      try {
        const raw = JSON.parse(fs.readFileSync(userPath, "utf8"));
        return { raw, isBuiltin: false, themeDir: path.join(userThemesDir, themeId) };
      } catch (e) {
        console.error(`[theme-loader] Failed to parse user theme "${themeId}":`, e.message);
      }
    }
  }

  return { raw: null, isBuiltin: false, themeDir: null };
}

/**
 * Resolve external theme assets: sanitize SVGs → cache dir, return cache path.
 * Non-SVG files (GIF/APNG/WebP) are used directly from theme dir (no sanitization needed).
 */
function _resolveExternalAssetsDir(themeId, themeDir) {
  const sourceAssetsDir = path.join(themeDir, "assets");
  if (!themeCacheDir) return sourceAssetsDir;

  const cacheDir = path.join(themeCacheDir, themeId, "assets");
  const cacheMetaPath = path.join(themeCacheDir, themeId, ".cache-meta.json");

  // Load existing cache meta
  let cacheMeta = {};
  try {
    cacheMeta = JSON.parse(fs.readFileSync(cacheMetaPath, "utf8"));
  } catch { /* no cache yet */ }

  // Ensure cache directory exists
  fs.mkdirSync(cacheDir, { recursive: true });

  // Scan source assets and sanitize SVGs
  let metaChanged = false;
  try {
    const files = fs.readdirSync(sourceAssetsDir);
    for (const file of files) {
      const srcFile = path.join(sourceAssetsDir, file);

      // Path traversal check
      const resolvedSrc = path.resolve(srcFile);
      if (!resolvedSrc.startsWith(path.resolve(sourceAssetsDir) + path.sep) &&
          resolvedSrc !== path.resolve(sourceAssetsDir)) {
        console.warn(`[theme-loader] Skipping suspicious path: ${file}`);
        continue;
      }

      let stat;
      try { stat = fs.statSync(srcFile); } catch { continue; }
      if (!stat.isFile()) continue;

      if (file.endsWith(".svg")) {
        // Check cache freshness
        const cached = cacheMeta[file];
        if (cached && cached.mtime === stat.mtimeMs && cached.size === stat.size) {
          // Cache is fresh
          continue;
        }

        // Sanitize and cache
        try {
          const svgContent = fs.readFileSync(srcFile, "utf8");
          const sanitized = sanitizeSvg(svgContent);
          fs.writeFileSync(path.join(cacheDir, file), sanitized, "utf8");
          cacheMeta[file] = { mtime: stat.mtimeMs, size: stat.size };
          metaChanged = true;
        } catch (e) {
          console.error(`[theme-loader] Failed to sanitize ${file}:`, e.message);
        }
      }
      // Non-SVG files are NOT copied — we serve them directly from source
    }
  } catch (e) {
    console.error(`[theme-loader] Failed to scan assets for theme "${themeId}":`, e.message);
  }

  if (metaChanged) {
    try {
      fs.writeFileSync(cacheMetaPath, JSON.stringify(cacheMeta, null, 2), "utf8");
    } catch {}
  }

  return cacheDir; // SVGs from cache, non-SVGs resolved at getAssetPath() time
}

// ── SVG Sanitization ──

/**
 * Sanitize SVG content by removing dangerous elements and attributes.
 * Uses htmlparser2 for robust parsing.
 * @param {string} svgContent - raw SVG string
 * @returns {string} sanitized SVG string
 */
function sanitizeSvg(svgContent) {
  const { parseDocument } = require("htmlparser2");
  const render = require("dom-serializer");

  const doc = parseDocument(svgContent, { xmlMode: true });
  _sanitizeNode(doc);
  return render.default(doc, { xmlMode: true });
}

/**
 * Recursively walk DOM tree and remove dangerous nodes/attributes.
 */
function _sanitizeNode(node) {
  if (!node.children) return;

  // Walk backwards so removal doesn't skip siblings
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i];

    // Remove dangerous elements entirely
    if (child.type === "tag" || child.type === "script" || child.type === "style") {
      const tagName = (child.name || "").toLowerCase();
      if (DANGEROUS_TAGS.has(tagName)) {
        node.children.splice(i, 1);
        continue;
      }
    }

    // Clean attributes on element nodes
    if (child.attribs) {
      const keys = Object.keys(child.attribs);
      for (const key of keys) {
        // Remove on* event handlers
        if (DANGEROUS_ATTR_RE.test(key)) {
          delete child.attribs[key];
          continue;
        }
        // Remove javascript: URLs
        if (HREF_ATTRS.has(key.toLowerCase()) && DANGEROUS_HREF_RE.test(child.attribs[key])) {
          delete child.attribs[key];
        }
      }
    }

    // Recurse into children
    _sanitizeNode(child);
  }
}

/**
 * @returns {object|null} current active theme config
 */
function getActiveTheme() {
  return activeTheme;
}

/**
 * Resolve a display hint filename to current theme's file.
 * @param {string} hookFilename - original filename from hook/server
 * @returns {string|null} theme-local filename, or null if not mapped
 */
function resolveHint(hookFilename) {
  if (!activeTheme || !activeTheme.displayHintMap) return null;
  return activeTheme.displayHintMap[hookFilename] || null;
}

/**
 * Get the absolute directory path for assets of the active theme.
 * Built-in: assets/svg/. External: theme-cache for SVGs, theme dir for non-SVGs.
 * @returns {string} absolute directory path
 */
function getAssetsDir() {
  if (!activeTheme) return assetsSvgDir;
  if (activeTheme._builtin) return assetsSvgDir;
  return activeTheme._assetsDir || assetsSvgDir;
}

/**
 * Get asset path for a specific file.
 * For external themes: SVGs come from cache, non-SVGs from source theme dir.
 * @param {string} filename
 * @returns {string} absolute file path
 */
function getAssetPath(filename) {
  if (!activeTheme || activeTheme._builtin) {
    return path.join(assetsSvgDir, filename);
  }

  // External theme: SVGs from cache, everything else from source
  if (filename.endsWith(".svg")) {
    return path.join(activeTheme._assetsDir, filename);
  }
  // Non-SVG: direct from theme's assets dir (no sanitization needed)
  return path.join(activeTheme._themeDir, "assets", filename);
}

/**
 * Get asset path prefix for renderer (used in <object data="..."> and <img src="...">).
 * Built-in: relative path. External: file:// URL.
 * @returns {string} path prefix
 */
function getRendererAssetsPath() {
  if (!activeTheme || activeTheme._builtin) {
    return "../assets/svg";
  }
  // External theme: return file:// URL to the cache dir for SVGs
  return activeTheme._assetsFileUrl || "../assets/svg";
}

/**
 * Get the base file:// URL for non-SVG assets of external themes.
 * For <img> loading of GIF/APNG/WebP files that live in the source theme dir.
 * @returns {string|null} file:// URL or null for built-in
 */
function getRendererSourceAssetsPath() {
  if (!activeTheme) return null;
  if (activeTheme._builtin) return "../assets/hires";
  return pathToFileURL(path.join(activeTheme._themeDir, "assets")).href;
}

function collectThemeAssetFiles(theme = activeTheme) {
  const files = new Set();
  const addFile = (file) => {
    const normalized = normalizeText(file);
    if (normalized) files.add(normalized);
  };
  const addStateFiles = (states) => {
    if (!states || typeof states !== "object") return;
    for (const value of Object.values(states)) {
      if (Array.isArray(value)) value.forEach(addFile);
    }
  };

  if (!theme || typeof theme !== "object") return [];
  addStateFiles(theme.states);
  if (theme.miniMode) addStateFiles(theme.miniMode.states);
  for (const tier of (theme.workingTiers || [])) addFile(tier && tier.file);
  for (const tier of (theme.jugglingTiers || [])) addFile(tier && tier.file);
  for (const item of (theme.idleAnimations || [])) addFile(item && item.file);
  if (theme.reactions && typeof theme.reactions === "object") {
    for (const reaction of Object.values(theme.reactions)) {
      if (!reaction || typeof reaction !== "object") continue;
      if (Array.isArray(reaction.files)) reaction.files.forEach(addFile);
      addFile(reaction.file);
    }
  }
  if (theme.displayHintMap && typeof theme.displayHintMap === "object") {
    for (const file of Object.values(theme.displayHintMap)) addFile(file);
  }
  return [...files];
}

function getBuiltInRendererMediaPath(file) {
  const hiresPath = assetsHiresDir ? path.join(assetsHiresDir, file) : null;
  if (hiresPath && fs.existsSync(hiresPath)) return "../assets/hires";
  const gifPath = assetsGifDir ? path.join(assetsGifDir, file) : null;
  if (gifPath && fs.existsSync(gifPath)) return "../assets/gif";
  return "../assets/svg";
}

function getRendererAssetUrl(file) {
  if (!file) return "";
  if (!activeTheme || activeTheme._builtin) {
    if (String(file).endsWith(".svg")) return `${getRendererAssetsPath()}/${file}`;
    return `${getBuiltInRendererMediaPath(file)}/${file}`;
  }
  if (String(file).endsWith(".svg")) return `${getRendererAssetsPath()}/${file}`;
  const sourceAssetsPath = getRendererSourceAssetsPath();
  return sourceAssetsPath ? `${sourceAssetsPath}/${file}` : `${getRendererAssetsPath()}/${file}`;
}

function getRendererAssetUrls() {
  const urls = {};
  for (const file of collectThemeAssetFiles(activeTheme)) {
    urls[file] = getRendererAssetUrl(file);
  }
  return urls;
}

/**
 * Build config object to inject into renderer process (via additionalArguments or IPC).
 * Contains only the subset renderer.js needs.
 */
function getRendererConfig() {
  if (!activeTheme) return null;
  const t = activeTheme;
  return {
    assetsPath: getRendererAssetsPath(),
    // For external themes: non-SVG assets served from source dir (not cache)
    sourceAssetsPath: getRendererSourceAssetsPath(),
    assetUrls: getRendererAssetUrls(),
    assetMetadata: t.animationMeta || {},
    visualQuality: t.visualQuality || null,
    eyeTracking: t.eyeTracking,
    glyphFlips: t.miniMode ? t.miniMode.glyphFlips : {},
    dragSvg: t.reactions && t.reactions.drag ? t.reactions.drag.file : null,
    idleFollowSvg: t.states.idle[0],
    // renderer needs to know which states need eye tracking (for <object> vs <img> decision)
    eyeTrackingStates: t.eyeTracking.enabled ? t.eyeTracking.states : [],
  };
}

/**
 * Build config object to inject into hit-renderer process.
 */
function getHitRendererConfig() {
  if (!activeTheme) return null;
  const t = activeTheme;
  return {
    reactions: t.reactions || {},
    idleFollowSvg: t.states.idle[0],
  };
}

/**
 * Ensure the user themes directory exists.
 * @returns {string} absolute path to user themes dir
 */
function ensureUserThemesDir() {
  if (!userThemesDir) return null;
  try {
    fs.mkdirSync(userThemesDir, { recursive: true });
  } catch {}
  return userThemesDir;
}

// ── Validation ──

function validateTheme(cfg, themeDir) {
  const errors = [];
  const hasAssetFile = (file) => {
    if (!file) return false;
    const normalized = String(file);
    const ext = path.extname(normalized).toLowerCase();
    const candidatePaths = [];
    if (themeDir) {
      candidatePaths.push(path.join(themeDir, "assets", normalized));
      candidatePaths.push(path.join(themeDir, "sounds", normalized));
    }
    if (normalized.endsWith(".svg") && assetsSvgDir) {
      candidatePaths.push(path.join(assetsSvgDir, normalized));
    }
    if (MEDIA_ASSET_EXTENSIONS.has(ext)) {
      if (assetsHiresDir) candidatePaths.push(path.join(assetsHiresDir, normalized));
      if (assetsGifDir) candidatePaths.push(path.join(assetsGifDir, normalized));
    }
    if (AUDIO_ASSET_EXTENSIONS.has(ext) && assetsSoundsDir) {
      candidatePaths.push(path.join(assetsSoundsDir, normalized));
    }
    return candidatePaths.some(candidate => fs.existsSync(candidate));
  };

  if (cfg.schemaVersion !== 1) {
    errors.push(`schemaVersion must be 1, got ${cfg.schemaVersion}`);
  }
  if (!cfg.name) errors.push("missing required field: name");
  if (!cfg.version) errors.push("missing required field: version");

  if (!cfg.viewBox || cfg.viewBox.width == null || cfg.viewBox.height == null ||
      cfg.viewBox.x == null || cfg.viewBox.y == null) {
    errors.push("missing or incomplete viewBox (need x, y, width, height)");
  }

  if (!cfg.states) {
    errors.push("missing required field: states");
  } else {
    for (const s of REQUIRED_STATES) {
      if (!cfg.states[s] || !Array.isArray(cfg.states[s]) || cfg.states[s].length === 0) {
        errors.push(`states.${s} must be a non-empty array`);
      }
    }
  }

  // eyeTracking.states listed states must use .svg if enabled
  if (cfg.eyeTracking && cfg.eyeTracking.enabled && cfg.states) {
    for (const stateName of (cfg.eyeTracking.states || [])) {
      const files = cfg.states[stateName] ||
                    (cfg.miniMode && cfg.miniMode.states && cfg.miniMode.states[stateName]);
      if (files) {
        for (const f of files) {
          if (!f.endsWith(".svg")) {
            errors.push(`eyeTracking state "${stateName}" file "${f}" must be .svg`);
          }
        }
      }
    }
  }

  if (cfg.states) {
    for (const stateName of Object.keys(cfg.states)) {
      const files = Array.isArray(cfg.states[stateName]) ? cfg.states[stateName] : [];
      for (const file of files) {
        if (!hasAssetFile(file)) {
          errors.push(`missing asset file for states.${stateName}: ${file}`);
        }
      }
    }
    for (const tier of (cfg.workingTiers || [])) {
      if (tier && tier.file && !hasAssetFile(tier.file)) {
        errors.push(`missing asset file for workingTiers: ${tier.file}`);
      }
    }
    for (const anim of (cfg.idleAnimations || [])) {
      if (anim && anim.file && !hasAssetFile(anim.file)) {
        errors.push(`missing asset file for idleAnimations: ${anim.file}`);
      }
    }
    const reactionEntries = cfg.reactions ? Object.values(cfg.reactions) : [];
    for (const reaction of reactionEntries) {
      const files = Array.isArray(reaction?.files)
        ? reaction.files
        : (reaction?.file ? [reaction.file] : []);
      for (const file of files) {
        if (!hasAssetFile(file)) {
          errors.push(`missing asset file for reactions: ${file}`);
        }
      }
    }
  }

  if (cfg.animationMeta && typeof cfg.animationMeta === "object") {
    for (const [file, meta] of Object.entries(cfg.animationMeta)) {
      if (!hasAssetFile(file)) {
        errors.push(`animationMeta references missing asset: ${file}`);
        continue;
      }
      const fps = Number(meta && meta.fps);
      const width = Number(meta && meta.width);
      const height = Number(meta && meta.height);
      if (!Number.isFinite(fps) || fps <= 0) {
        errors.push(`animationMeta.${file}.fps must be a positive number`);
      }
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        errors.push(`animationMeta.${file} must include positive width and height`);
      }
    }
  }

  return errors;
}

// ── Internal helpers ──

function mergeDefaults(raw, themeId, isBuiltin) {
  const theme = { ...raw, _id: themeId, _builtin: !!isBuiltin };

  // timings
  theme.timings = {
    ...DEFAULT_TIMINGS,
    ...(raw.timings || {}),
    minDisplay: { ...DEFAULT_TIMINGS.minDisplay, ...(raw.timings && raw.timings.minDisplay) },
    autoReturn: { ...DEFAULT_TIMINGS.autoReturn, ...(raw.timings && raw.timings.autoReturn) },
  };

  // hitBoxes
  theme.hitBoxes = { ...DEFAULT_HITBOXES, ...(raw.hitBoxes || {}) };
  theme.wideHitboxFiles = raw.wideHitboxFiles || [];
  theme.sleepingHitboxFiles = raw.sleepingHitboxFiles || [];

  // objectScale
  theme.objectScale = { ...DEFAULT_OBJECT_SCALE, ...(raw.objectScale || {}) };

  // eyeTracking
  theme.eyeTracking = { ...DEFAULT_EYE_TRACKING, ...(raw.eyeTracking || {}) };
  theme.eyeTracking.ids = {
    ...DEFAULT_EYE_TRACKING.ids,
    ...(raw.eyeTracking && raw.eyeTracking.ids || {}),
  };

  // miniMode
  if (raw.miniMode) {
    theme.miniMode = {
      supported: true,
      ...raw.miniMode,
      timings: {
        minDisplay: {},
        autoReturn: {},
        ...(raw.miniMode.timings || {}),
      },
      glyphFlips: raw.miniMode.glyphFlips || {},
    };
  } else {
    theme.miniMode = { supported: false, states: {}, timings: { minDisplay: {}, autoReturn: {} }, glyphFlips: {} };
  }

  // Merge mini timings into main timings for state.js convenience
  if (theme.miniMode.timings) {
    Object.assign(theme.timings.minDisplay, theme.miniMode.timings.minDisplay || {});
    Object.assign(theme.timings.autoReturn, theme.miniMode.timings.autoReturn || {});
  }

  // displayHintMap
  theme.displayHintMap = raw.displayHintMap || {};

  // sounds
  theme.sounds = { ...DEFAULT_SOUNDS, ...(raw.sounds || {}) };

  // reactions
  theme.reactions = raw.reactions || null;

  // workingTiers / jugglingTiers — auto sort descending by minSessions
  if (theme.workingTiers) {
    theme.workingTiers.sort((a, b) => b.minSessions - a.minSessions);
  }
  if (theme.jugglingTiers) {
    theme.jugglingTiers.sort((a, b) => b.minSessions - a.minSessions);
  }

  // idleAnimations
  theme.idleAnimations = raw.idleAnimations || [];

  theme.reminderCard = raw.reminderCard || null;
  theme.quickTaskCard = raw.quickTaskCard || null;
  theme.dashboardTheme = normalizeDashboardTheme(raw.dashboardTheme, raw.quickTaskCard, raw.reminderCard);
  theme.preview = normalizeThemePreview(raw.preview, theme.dashboardTheme);

  return theme;
}

/**
 * Resolve a logical sound name to an absolute file:// URL.
 * Built-in themes: assets/sounds/. External themes: {themeDir}/sounds/.
 * @param {string} soundName - logical name (e.g. "complete")
 * @returns {string|null} file:// URL, or null if sound not defined
 */
function getSoundUrl(soundName) {
  if (!activeTheme || !activeTheme.sounds) return null;
  const filename = activeTheme.sounds[soundName];
  if (!filename) return null;

  const absPath = activeTheme._builtin
    ? path.join(assetsSoundsDir, filename)
    : path.join(activeTheme._themeDir, "sounds", filename);

  if (fs.existsSync(absPath)) return pathToFileURL(absPath).href;

  // Fallback to built-in sounds for external themes that inherit defaults
  if (!activeTheme._builtin) {
    const fallback = path.join(assetsSoundsDir, filename);
    if (fs.existsSync(fallback)) return pathToFileURL(fallback).href;
  }

  return null;
}

module.exports = {
  init,
  discoverThemes,
  loadTheme,
  getActiveTheme,
  resolveHint,
  getAssetsDir,
  getAssetPath,
  getRendererAssetsPath,
  getRendererSourceAssetsPath,
  getRendererAssetUrl,
  getRendererAssetUrls,
  collectThemeAssetFiles,
  getRendererConfig,
  getHitRendererConfig,
  ensureUserThemesDir,
  validateTheme,
  sanitizeSvg,
  getSoundUrl,
};
