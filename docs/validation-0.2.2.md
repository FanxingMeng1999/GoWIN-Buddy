# Public release verification / 公开版验收

Version: **0.2.2**. Verified on **2026-10-04** on Windows x64.

| Check | Result |
| --- | --- |
| Desktop runtime Node tests | 383 passed, 0 failed, 0 skipped |
| Python local-host tests | 11 passed |
| Dashboard browser tests | 5 passed, 0 skipped |
| Mascot art/manifest check | 10 distinct silhouettes; 372 SVG states; XML, interaction anchors and all SHA-256 entries valid |
| Runtime discovery precedence | 7 passed |
| Process ownership/scope | 7 passed |
| Standalone installed smoke checks | 8 passed from a path containing Chinese characters, spaces and `!` |
| Installed renderer errors | 0 |
| Upgrade/uninstall retention | Passed; state, preferences and user files retained, normal registration unchanged |
| Production npm audit | 0 reported vulnerabilities |
| Public-source privacy gate | Passed; empty first-run records and required notices |

The installed capture measured the mascot silhouette, including its shadow, at 86×56 pixels in a 200×200 window. The original SVG occupied 15×9 units at the same effective render scale (about 87×52 pixels). The new characters keep that compact footprint, the original 45×45 canvas, 1.9×/1.3× object placement and 17×12 default hitbox. The pet size menu, level badge and task/RPG window interaction remain unchanged. The bilingual screenshots and 28-frame demo GIF were recaptured from the installed 0.2.2 build using fictional tasks; the captured dashboard reported zero renderer errors.

The installer bundles Node 24.14.0 and Python 3.11.9; developer runtimes stay out of the public Git source. The package contains no personal user profile and is unsigned. Its SHA-256 is published in the Release assets.

## Build dependency advisory

The development-only dependency graph reports eight high-severity entries from the http-cache-semantics chain used by Electron download/build tools. On the audit date, the published 4.2.0 version was affected and the upstream advisory listed no patched version. These build-only packages are not included as production application dependencies. The production audit returned zero. No forced downgrade was used to hide the build advisory.

## Publication boundary

Public first-run records remain empty. All 10 character silhouettes, mascot source SVGs and preview PNG are original MIT artwork; third-party font/runtime licenses remain in THIRD_PARTY_NOTICES.md. Screenshot/GIF scenes use fictional tasks. Personal state, research records, local paths, credentials, runtimes, dependencies and logs are excluded from Git.
