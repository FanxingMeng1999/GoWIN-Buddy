# Public release verification / 公开版验收

Version: **0.2.1**. Verification recorded on **2026-10-03 UTC**, on Windows x64. Results below are local checks of the public source and standalone installed runtime. GitHub Actions provides an additional source check after publication.

| Check | Result |
| --- | --- |
| Desktop runtime Node tests | 380 passed, 0 failed, 0 skipped |
| Python local-host tests | 11 passed |
| Dashboard browser tests | 5 passed, 0 skipped |
| Changed theme/Gemini fixtures after publication cleanup | 29 passed |
| Runtime discovery precedence | 7 passed |
| Process ownership/scope | 7 passed |
| Standalone installed smoke checks | 8 passed |
| Installed renderer errors | 0 |
| Ctrl+Alt+Q in the isolated final run | Registered |
| Reinstall/upgrade | State and preferences preserved |
| Uninstall | State, preferences and user-created files preserved; app-owned payload removed |
| Isolated /QA installation | Existing normal shortcut and registration unchanged |
| Production npm audit | 0 reported vulnerabilities |
| Original-art manifest | 372 SVG states; hashes checked; 0 identical to upstream restricted artwork |
| Public-source privacy gate | Passed; empty first-run records and required notices |

Installed checks exercise packaged resource discovery, offline task add/check/clear, work clock, drag IPC, repeated launch, bundled Python hosting, conditional writes, dashboard rendering and synchronization back to the pet. Core packaged source hashes and dashboard source content were compared with the reviewed checkout; Windows newline differences are normalized for script/text comparisons. The screenshot tools use Electron's native capturePage interface for hidden windows. Installation was also checked in a path containing Chinese characters, spaces and an exclamation mark.

The release installer is unsigned. Its exact SHA-256 and size are listed on the GitHub Release and in SHA256SUMS.txt. The build includes Electron 41.10.7, Node 24.14.0 and Python 3.11.9. Build timestamps and generated installer metadata mean separate builds can have different file hashes.

## Build dependency advisory

The development-only dependency graph reports eight high-severity entries from the http-cache-semantics chain used by Electron download/build tools. On the audit date, the latest published 4.2.0 version was affected and the [upstream advisory](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) listed no patched version. These download/build packages are not included as production application dependencies. The production audit returned zero. No forced downgrade was used to hide the build advisory.

## Publication boundary

The public snapshot contains product source, locked npm metadata, original art, vendor fonts with licenses, build/QA tools and bilingual documents. Personal task state, preferences, project research records, local logs, machine-resolved configuration, credentials, local runtimes and compiled installers are excluded from Git. Installers are distributed through Releases. Demonstrations use fresh fictional task data and capture app content only.

中文：公开版桌宠测试 380 项、Host 测试 11 项、浏览器测试 5 项均通过；安装版 8 个关键路径通过，渲染错误为 0。升级与卸载保留测试存档、偏好和用户文件，隔离安装不改变正常快捷方式及注册信息。源码隐私检查通过，372 个原创 SVG 的清单校验通过。运行依赖审计为 0；开发构建链中尚未有修复版本的缓存库告警单独记录。动图和截图均使用虚构演示任务。
