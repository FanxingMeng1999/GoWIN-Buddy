# Build and test

The supported installer target is Windows 10/11 x64. The runtime is Electron + a Python standard-library HTTP host; no database or hosted backend is required.

## Get the source

~~~powershell
git clone https://github.com/FanxingMeng1999/GoWIN-Buddy.git
cd GoWIN-Buddy
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap-local-deps.ps1
~~~

The bootstrap prepares Node 24.14.0 and Python 3.11.9 from official Windows archives under tools/runtime/. Those binaries and download caches are ignored by Git. The Node archive is checked against its pinned SHA-256. The Python host has no pip dependencies. NSIS 3.10 is resolved or downloaded when building the installer.

## Run from source

~~~powershell
$env:PATH = (Join-Path (Get-Location) 'tools/runtime/node') + ';' + $env:PATH
& ./tools/runtime/node/npm.cmd ci --prefix apps/pet-desktop
& ./tools/runtime/node/npm.cmd run start --prefix apps/pet-desktop
~~~

Quit a running source instance before reinstalling its dependencies. The installer build uses a separate dependency directory, so it can run while a different installed copy is open. The launcher resolves tools in this order: explicit GoWIN environment path, bundled runtime, then system fallback. A build always prepares the bundled runtimes needed for a standalone installer.

## Verify

~~~powershell
& ./tools/runtime/node/npm.cmd test --prefix apps/pet-desktop
& ./tools/runtime/python/windows-x64/3.11.9/python.exe scripts/tests/test_dashboard_host.py
& ./tools/runtime/node/npm.cmd run test:e2e:dashboard --prefix apps/pet-desktop
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tests/Test-QualityProcessScope.ps1
~~~

The browser tests require an installed Edge/Chrome or PLAYWRIGHT_CHROMIUM_PATH pointing to Chromium. They create disposable test data. See [release verification](validation.md) for the actual published-version results.

## Build the installer

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File installer/windows/build-installer.ps1
~~~

Output: installer/windows/dist/GoWINBuddy-Setup.exe. The build installs locked npm dependencies in installer/windows/build/pet-VERSION/, packages Electron, adds the local host, original brand assets, runtime licenses and user guides, then compiles a per-user NSIS installer. Compilation-only Koffi vendor/source/doc files are excluded from the packaged runtime. Machine-resolved configuration and user state are not included.

If GitHub downloads are inaccessible, the Electron installer supports the existing mirror variables:

~~~powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_CUSTOM_DIR = '41.10.7'
~~~

Build-tool overrides: GOWIN_NPM_PATH and GOWIN_NSIS_PATH. Runtime overrides: GOWIN_NODE_PATH and GOWIN_BUNDLED_PYTHON. GOWIN_USER_DATA_ROOT selects a separate profile for development or tests. These are optional paths, never embedded developer-machine defaults.

“Reproducible” here means a repeatable source/lockfile/build procedure. The output includes build timestamps and generated installer metadata, so byte-for-byte identical installers are not promised.

## Regenerate original art (optional)

Committed art and icons are sufficient for a normal build. To edit and regenerate them, use Python 3.9+ with Pillow:

~~~powershell
python -m pip install 'Pillow>=9.5,<13'
python scripts/generate-public-art.py --root .
node scripts/render-mascot-gallery.cjs  # bilingual character lineup; needs Microsoft Edge
node scripts/render-mascot-preview.cjs  # measured 25 fps motion frames; needs Microsoft Edge
python scripts/render-mascot-preview.py  # compose mascot and crab GIF previews
python scripts/sync-brand-icons.py --root .
~~~

Keep design sources in assets/brand/source/, SVG/PNG exports and their manifest in assets/brand/extracted/. Only assets you can license for redistribution should be added.

## Layout

| Path | Purpose |
| --- | --- |
| apps/pet-desktop/ | Electron pet, panels, themes, optional agent hooks and tests |
| apps/rpg-hub/ | Local Python host and dashboard web UI |
| scripts/ | Bootstrap, original art generator, QA and benchmark tools |
| launcher/windows/ | Standalone launcher |
| installer/windows/ | NSIS source, build procedure and ignored outputs |
| assets/brand/ | Original design source, exports, manifest and runtime icons |
| docs/ | English/Chinese guides, actual demo images and release verification |

No external RIOS checkout or directory layout is required. Some inherited internal identifiers retain their old names for compatibility.

## Automated release

Push a tag matching the app version (for example, `v0.2.4`) to run the Windows installer workflow. It builds and checksums the versioned EXE, publishes a GitHub Release using `docs/release-<version>.md`, and verifies that both release assets are present. Manually dispatching the workflow builds the same assets without publishing a release.
