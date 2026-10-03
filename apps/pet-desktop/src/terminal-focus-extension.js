const path = require("path");
const fs = require("fs");
const os = require("os");

const EXT_ID = "clawd.clawd-terminal-focus";
const EXT_VERSION = "0.1.0";
const EXT_DIR_NAME = `${EXT_ID}-${EXT_VERSION}`;

function installTerminalFocusExtension({ baseDir, logger = console }) {
  const home = os.homedir();
  let extSrc = path.join(baseDir, "..", "extensions", "vscode");
  extSrc = extSrc.replace("app.asar" + path.sep, "app.asar.unpacked" + path.sep);

  if (!fs.existsSync(extSrc)) {
    logger.log("GoWIN!Buddy: terminal-focus extension source not found, skipping auto-install");
    return 0;
  }

  const targets = [
    path.join(home, ".vscode", "extensions"),
    path.join(home, ".cursor", "extensions"),
  ];

  const filesToCopy = ["package.json", "extension.js"];
  let installed = 0;

  for (const extRoot of targets) {
    if (!fs.existsSync(extRoot)) continue;
    const dest = path.join(extRoot, EXT_DIR_NAME);
    if (fs.existsSync(path.join(dest, "package.json"))) continue;
    try {
      fs.mkdirSync(dest, { recursive: true });
      for (const file of filesToCopy) {
        fs.copyFileSync(path.join(extSrc, file), path.join(dest, file));
      }
      installed++;
      logger.log(`GoWIN!Buddy: installed terminal-focus extension to ${dest}`);
    } catch (err) {
      logger.warn(`GoWIN!Buddy: failed to install extension to ${dest}:`, err.message);
    }
  }

  if (installed > 0) {
    logger.log(`GoWIN!Buddy: terminal-focus extension installed to ${installed} editor(s). Restart VS Code/Cursor to activate.`);
  }
  return installed;
}

module.exports = {
  installTerminalFocusExtension,
};
