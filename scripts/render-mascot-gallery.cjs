// Render the original mascot lineup into its bilingual README preview.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("../apps/pet-desktop/node_modules/playwright-core");
const root = path.resolve(__dirname, "..");
const output = path.resolve(process.argv[2] || path.join(root, "docs/media/mascot-gallery.png"));
const candidates = [process.env.PLAYWRIGHT_CHROMIUM_PATH,
  path.join(process.env.PROGRAMFILES || "C:/Program Files", "Microsoft/Edge/Application/msedge.exe"),
  path.join(process.env["PROGRAMFILES(X86)"] || "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe")].filter(Boolean);
const executable = candidates.find(file => fs.existsSync(file));
if (!executable) throw Error("Install Microsoft Edge or set PLAYWRIGHT_CHROMIUM_PATH");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "assets/brand/extracted/manifest.json"), "utf8"));
const themes = Object.keys(manifest.characters).map(id => ({ id,
  theme: JSON.parse(fs.readFileSync(path.join(root, "apps/pet-desktop/themes", id, "theme.json"), "utf8"))
})).sort((a, b) => a.theme.order - b.theme.order);
const esc = value => String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[ch]);
const cards = themes.map(({ id, theme }) => {
  const svg = theme.states.idle[0];
  const image = pathToFileURL(path.join(root, "apps/pet-desktop/assets/svg", svg)).href;
  return "<article><div class=\"pet\"><img src=\"" + esc(image) + "\" alt=\"\"></div><strong>" + esc(theme.mascot.name) + "</strong><small>" + esc(theme.mascot.nameZh) + "</small></article>";
}).join("");
const html = "<!doctype html><meta charset=\"utf-8\"><style>*{box-sizing:border-box}body{margin:0;padding:30px;background:#f2f7ef;color:#24453f;font-family:Arial,sans-serif}h1{font-size:26px;margin:0 0 5px}p{margin:0 0 22px;color:#648078}main{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}article{background:white;border:1px solid #dce9df;border-radius:17px;overflow:hidden;padding:10px 10px 13px;text-align:center;box-shadow:0 4px 14px #254a4410}.pet{height:150px;overflow:hidden;position:relative;background:radial-gradient(ellipse at center,#eef7f0 0,#fff 75%);border-radius:11px}.pet img{width:240px;height:240px;position:absolute;left:50%;top:-72px;transform:translateX(-50%)}strong{display:block;font-size:15px;margin-top:9px}small{display:block;color:#7b9088;font-size:12px;margin-top:3px}footer{font-size:11px;color:#7b9088;margin-top:15px}</style><h1>GoWIN!Buddy — original desktop companions / 原创桌面伙伴</h1><p>Ten distinct silhouettes · compact legacy-scale footprint / 十种不同轮廓 · 与原版接近的可视尺寸</p><main>" + cards + "</main><footer>Original MIT artwork / 原创 MIT 美术素材 · English / 简体中文</footer>";
const htmlPath = path.join(root, "tmp", "mascot-gallery.html");
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
fs.writeFileSync(htmlPath, html, "utf8");
(async () => {
  const browser = await chromium.launch({ executablePath: executable, headless: true, args: ["--disable-extensions"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 545 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(htmlPath).href);
    await page.locator("article img").last().waitFor();
    await page.waitForFunction(() => Array.from(document.querySelectorAll("article img")).every(image => image.complete && image.naturalWidth > 0));
    await page.screenshot({ path: output, fullPage: true });
    console.log("Mascot gallery: " + themes.length + " original mascots, " + fs.statSync(output).size + " bytes — " + output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
