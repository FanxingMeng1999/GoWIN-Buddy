# GoWIN!Buddy 0.2.1 — Sprout public edition / 小芽公开版

The first public GoWIN!Buddy release combines a desktop companion, quick tasks and a local RPG dashboard with original MIT-licensed Sprout Buddy artwork.

## English

- Original leaf-and-seed mascot, ten bundled themes, new app icons and generated notification tones.
- Temporary/daily/weekly/long-term tasks, work clock, check-ins, XP, stars, titles and milestones.
- Atomic state saves, previous-state backup, corrupted-file preservation and independent-edit merge.
- Visible save/conflict feedback and retained input after a failed quick-task save.
- Standalone Windows x64 installer with Node/Python included; English and Simplified Chinese installer pages.
- Clean first-run state, editable general goals, bilingual README/guides, real demonstration GIF and repeatable build scripts.
- Windows process discovery uses a cached ancestor snapshot from one PowerShell call and no longer requires WMIC.
- Original-art sources/manifests and upstream/third-party notices included.

Download the versioned EXE from Release assets, install for the current user and launch from the desktop or Start menu. Hover over the pet for quick tasks, use Ctrl+Alt+Q to pin them, or double-click the pet for the dashboard. The dashboard currently uses Chinese labels; the English guide explains the controls. The installer is unsigned and uses manual release downloads for updates.

## 中文

- 全新原创小芽角色、十套主题、应用图标和生成式提示音。
- 临时/每日/每周/长期任务、上下班记录、签到、经验、星尘、称号与里程碑。
- 原子保存、上一份有效状态备份、损坏文件保留和独立修改合并。
- 保存失败与冲突有明确提示，速勾保存失败保留输入。
- Windows x64 独立安装包，内置 Node/Python，安装界面支持简体中文和 English。
- 首启存档清空，长期目标改为通用可编辑示例；提供双语 README、指南、实际演示和构建脚本。
- Windows 进程识别改用一次 PowerShell 调用中取得并缓存的 CIM 祖先进程链，适配没有 WMIC 的新环境。
- 原创素材源文件、清单与上游/第三方许可证一起提供。

从 Release 资源下载带版本号的 EXE，安装后使用桌面或开始菜单启动。鼠标移到宠物上可展开速勾，Ctrl+Alt+Q 固定面板，双击打开本机仪表盘。安装器未做代码签名，通过 Release 手动下载更新。更新前退出宠物并导出 JSON 备份；卸载保留个人存档。

## Verification / 验收

383 desktop tests + 11 host tests + 5 browser tests passed. Eight installed smoke paths, shortcut registration, upgrade/data retention and uninstall checks passed; zero renderer errors. Production dependency audit: zero. [Full validation](validation.md) records the development-only build advisory separately.

Code, documentation and original artwork: MIT. Third-party fonts/runtimes retain their own licenses. See [notices](../THIRD_PARTY_NOTICES.md), [English guide](user-guide.en.md) and [中文指南](user-guide.zh-CN.md).
