# Mascot redesign verification / 桌宠重绘验证

Version: **0.2.3**. Verified on Windows x64, **October 4, 2026**.

The v0.2.2 SVG generator wrapped each character in `scale(1 .62)`, compressing height by 38%. Version 0.2.3 redraws all ten characters as rounded, species-specific bodies with continuous shading, layered highlights, expressive faces and gentle CSS-keyframed movement. Each complete character uses one `scale(.78)` transform and explicit `preserveAspectRatio="xMidYMid meet"`; the shared 45×45 viewBox, 17×12 hitbox, existing object-window geometry and eye-tracking anchors remain intact.

At the reference 380×260 SVG object stage, the ten measured art bounds range from 48–75 px wide and 53–69 px high. Browser geometry reports the same horizontal and vertical scale for all characters. The Rosy Crab keeps a warm pink body, dark eyes and pincers, with a softly shaded rounded form and claw-wave motion.

| Check | Result |
| --- | --- |
| Desktop unit tests | 383 passed, 0 failed |
| Python local-host tests | 11 passed |
| Dashboard browser tests | 5 passed, 0 failed |
| Mascot artwork checks | 10 silhouettes; all 372 SVG states pass proportions, gradients, interaction-anchor and SHA-256 checks |
| Animated preview | 114 frames; idle/work/happy/rest phases; 13.68-second seamless loop; crab close-up verified |
| Transparent artwork exports | Ten 384×384 PNG files; pixel dimensions and alpha preserved |
| Packaged installer smoke | 8 checks passed; no renderer errors |
| Packaged Electron demo | Captured from installed v0.2.3 fixture, 28 frames; rendererErrors empty |
| Installer lifecycle | Upgrade and uninstall preserve state, preferences and user files; QA mode leaves shortcuts and registration untouched |

The animated previews and PNGs are rendered from the same SVGs used at runtime. All character transforms use a single uniform scale; preview rendering checks this condition in Chromium before exporting. Runtime movement, hit areas and window placement are not changed.

## Windows x64 package

Installer: `GoWINBuddy-Setup-0.2.3.exe`<br>
Size: **151,822,529 bytes**<br>
SHA-256: `0F64A935AC2CE9B9F467D4D6AAEF15ACF4E6BD238A6A67F05C37C46EB5EEAEDF`

The build uses Node 24.14.0, Electron 41.10.7 and bundled Python 3.11.9. The installer is unsigned. The source privacy gate is run after staging, before publication.
