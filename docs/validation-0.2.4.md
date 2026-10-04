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
| Packaged installer smoke | 9 checks passed, including visible motion, 140 ms crossfade and reduced-motion handling; no renderer errors |
| Installer lifecycle | Upgrade and uninstall preserve personal state, preferences and user files; QA mode leaves normal shortcuts and registration unchanged |

## Windows x64 package

Installer: `GoWINBuddy-Setup-0.2.4.exe`<br>
Size: **151,852,493 bytes**<br>
SHA-256: `2591ADAD39E4C6211829A831DC9A0CD3E7433E1977118FA42D31D0C58100863A`

The build uses Node 24.14.0, Electron 41.10.7 and bundled Python 3.11.9. The installer is unsigned. The release includes a SHA-256 checksum file; see the [bilingual release notes](release-0.2.4.md). Earlier verification remains in [validation-0.2.3.md](validation-0.2.3.md).
