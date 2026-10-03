# GoWIN!Buddy 0.2.1 — User guide

GoWIN!Buddy combines an original Sprout Buddy desktop pet, a quick task panel and a local RPG dashboard. The release installer is for Windows 10/11 x64 and includes Node.js and Python.

## Install and start

Download **GoWINBuddy-Setup-0.2.1.exe** from the GitHub Releases page. Run it, choose English or Simplified Chinese, select a folder, and launch GoWIN!Buddy. Installation is per user. Use the desktop or Start menu shortcut afterwards. This release is unsigned; the executable SHA-256 is published with the release.

## Everyday controls

| Action | Result |
| --- | --- |
| Hover over the pet | Show today's quick tasks; moving away hides the panel |
| Ctrl+Alt+Q | Open and pin the quick task panel |
| Drag the pet | Reposition it; dragging near an edge can enter mini mode |
| Double-click the pet | Open the local RPG dashboard |
| Right-click / tray menu | Change theme or size, sleep, mute, autostart, or quit |
| Add a task in the quick panel | Choose temporary, daily, weekly or long-term; temporary tasks can have a deadline |
| Clock in / out | Record work time and synchronize it with the dashboard |

The dashboard currently uses Chinese labels. “今日速勾” means quick tasks, “上班/下班” means clock in/out, “每日/每周” means daily/weekly, and “收起” removes completed temporary tasks. Removing a temporary task does not itself grant an RPG reward. The dashboard grants XP and stars through its quest, check-in and milestone rules.

## Data and recovery

Normal installed use stores state in **%APPDATA%\gowin-buddy-pet\state\game_state.json** and preferences in **%APPDATA%\gowin-buddy-pet\gowin-prefs.json**. The dashboard runs on the loopback interface. Core task and RPG use needs no cloud account.

The dashboard and pet merge independent edits. If both edit the same field, the dashboard reports a conflict and keeps its local cache. Export that cache before refreshing. Failed quick-panel saves keep your input for retry. Successful atomic writes retain the previous valid state in **game_state.json.bak**. A malformed state file is preserved as **game_state.json.corrupt-TIMESTAMP** and recovered from the backup where available.

Export JSON from the dashboard regularly for a separate backup. Uninstalling preserves personal state; reinstalling can resume it. Launching a second copy brings the existing pet forward. If Ctrl+Alt+Q is used by another application, use the tray menu.

## Update

Quit the pet from its tray menu, download a newer release installer and install it to the same folder. Keep a JSON export before upgrading. This installer uses manual release downloads.

## Optional developer integrations

The source retains upstream agent hooks and terminal integration code. These are optional, require local tool configuration, and are outside the desktop/RPG install workflow. The Windows release verification covers the pet, task panel, local dashboard and installer.

See [the build guide](building.en.md), [Chinese instructions](user-guide.zh-CN.md), [license](../LICENSE) and [third-party notices](../THIRD_PARTY_NOTICES.md).
