# Mascot motion verification / 桌宠动作流畅度验证

Version: **0.2.4**. Verified on Windows x64, **October 4, 2026**.

Version 0.2.3 corrected the flattened character artwork. Version 0.2.4 improves the motion itself: idle breathing, work gestures, happy hops and resting movement have clearer eased travel, and changing states crossfades over 140 ms. When Windows requests reduced motion, state changes remain immediate. The SVG art is resolution-independent; this update changes motion timing and travel, not display DPI, hitboxes or the compact window size.

On the 380×260 reference SVG stage, Chromium measured minimum vertical travel across all ten mascots: 3.68 px idle, 3.04 px working, 10.67 px happy and 2.12 px resting. The ten-character overview and Rosy Crab close-up are sampled at 25 fps, with 342 frames over a 13.68-second seamless loop. The browser preview also verifies matching horizontal and vertical scale for every character.

| Check | Result |
| --- | --- |
| Desktop unit tests | 383 passed, 0 failed |
| Python local-host tests | 11 passed |
| Dashboard browser tests | 5 passed, 0 failed |
| Mascot artwork checks | 10 distinct silhouettes; all 372 SVG states pass proportions, gradients, interaction-anchor and SHA-256 checks |
| Animated previews | 342 frames at 25 fps; 13.68-second loop; ten-character and Rosy Crab previews verified |
| Transparent artwork exports | Ten 384×384 PNG files; pixel dimensions and alpha preserved |
| Packaged installer smoke | GitHub Release installer downloaded, installed and passed 9 checks; no renderer errors |
| Installer lifecycle | GitHub Release installer upgrade and uninstall preserve personal state, preferences and user files; QA mode leaves normal shortcuts and registration unchanged |

## Windows x64 package

GitHub Release installer: `GoWINBuddy-Setup-0.2.4.exe`<br>
Size: **144,440,234 bytes**<br>
SHA-256: `908101F55C53103B201E487646159B1E20DBD25C0C45A95BAF473DDA55530B82`

The checksum above matches the `SHA256SUMS.txt` attached to the v0.2.4 GitHub Release. The downloaded release installer passed both packaged smoke and upgrade/uninstall lifecycle checks. Windows checkouts may normalize line endings in HTML and CSS, so packaged source comparisons normalize CRLF to LF before hashing.

The build uses Node 24.14.0, Electron 41.10.7 and bundled Python 3.11.9. The installer is unsigned. See the [bilingual release notes](release-0.2.4.md).
