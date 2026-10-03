param(
  [string]$Root = $(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath $Root).Path
$petDir = Join-Path $Root 'apps/pet-desktop'
$releaseVersion = (Get-Content -LiteralPath (Join-Path $petDir 'package.json') -Raw | ConvertFrom-Json).version
$distDir = Join-Path $Root 'installer/windows/dist'
$bundleRoot = Join-Path $distDir ('GoWINBuddy-Windows-' + $releaseVersion)
$petBuildDir = Join-Path $Root ('installer/windows/build/pet-' + $releaseVersion)
$localNpm = Join-Path $Root 'tools/runtime/node/npm.cmd'
$localPython = Join-Path $Root 'tools/runtime/python/windows-x64/3.11.9/python.exe'
$localNsis = Join-Path $Root 'tools/runtime/nsis/windows-x64/3.10/nsis-3.10/makensis.exe'

function Resolve-BuildTool([string]$Explicit, [string]$Bundled, [string]$Fallback) {
  foreach ($candidate in @($Explicit, $Bundled)) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { return (Resolve-Path -LiteralPath $candidate).Path }
  }
  $command = Get-Command $Fallback -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  return $null
}
function Remove-BuildDirectory([string]$Target) {
  $absolute = [IO.Path]::GetFullPath($Target).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $allowed = @([IO.Path]::GetFullPath((Join-Path $petDir 'dist')), [IO.Path]::GetFullPath($bundleRoot), [IO.Path]::GetFullPath($petBuildDir))
  if ($allowed -notcontains $absolute) { throw "Refusing unexpected build cleanup: $absolute" }
  if (Test-Path -LiteralPath $absolute) { Remove-Item -LiteralPath $absolute -Recurse -Force }
}
function Copy-RuntimeTree([string]$Source, [string]$Target, [string[]]$Excluded = @('__pycache__')) {
  New-Item -ItemType Directory -Path $Target -Force | Out-Null
  $arguments = @($Source, $Target, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/XD') + $Excluded
  & robocopy @arguments | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Runtime copy failed: $Source" }
  $global:LASTEXITCODE = 0
}

New-Item -ItemType Directory -Path $distDir,(Join-Path $Root 'logs/quality') -Force | Out-Null
Write-Host '[1/5] Resolve local dependencies'
if (-not ((Test-Path -LiteralPath $localPython) -and (Test-Path -LiteralPath $localNpm))) {
  & (Join-Path $Root 'scripts/bootstrap-local-deps.ps1') -Root $Root
}
$npmCmd = Resolve-BuildTool $env:GOWIN_NPM_PATH $localNpm 'npm'
if (-not $npmCmd) { throw 'npm is required to build the desktop app' }
$makensisPath = Resolve-BuildTool $env:GOWIN_NSIS_PATH $localNsis 'makensis'
if (-not $makensisPath) {
  $result = & (Join-Path $Root 'scripts/bootstrap-nsis.ps1') -Root $Root -EmitPathOnly
  if ($LASTEXITCODE -ne 0) { throw 'NSIS bootstrap failed' }
  $makensisPath = ($result | Select-Object -Last 1).ToString().Trim()
}
if (-not (Test-Path -LiteralPath $makensisPath -PathType Leaf)) { throw 'NSIS compiler is missing' }

# Original icons are committed; asset regeneration is an optional developer step.
if (-not (Test-Path -LiteralPath (Join-Path $petDir "assets/icon.ico"))) { throw "Committed brand icon is missing; run scripts/generate-public-art.py then scripts/sync-brand-icons.py" }
$env:PATH = (Split-Path $npmCmd -Parent) + [IO.Path]::PathSeparator + $env:PATH

Write-Host '[2/5] Install locked dependencies in the isolated build directory'
Remove-BuildDirectory $petBuildDir
New-Item -ItemType Directory -Path $petBuildDir -Force | Out-Null
foreach ($entry in @('src','assets','hooks','extensions','agents','themes','package.json','package-lock.json','LICENSE')) {
  Copy-Item -LiteralPath (Join-Path $petDir $entry) -Destination (Join-Path $petBuildDir $entry) -Recurse
}

if (-not (Test-Path -LiteralPath (Join-Path $petDir 'package-lock.json'))) { throw 'A package-lock.json is required for a reproducible build' }
& $npmCmd ci --prefix $petBuildDir
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
Write-Host '[3/5] Build Electron app'
& $npmCmd run build --prefix $petBuildDir
if ($LASTEXITCODE -ne 0) { throw 'Electron build failed' }
$winUnpacked = Join-Path $petBuildDir 'dist/win-unpacked'
if (-not (Test-Path -LiteralPath (Join-Path $winUnpacked 'GoWIN!Buddy.exe'))) { throw 'Electron executable is missing' }
Write-Host '[4/5] Assemble standalone bundle'
Remove-BuildDirectory $bundleRoot
New-Item -ItemType Directory -Path (Join-Path $bundleRoot 'pet-dist') -Force | Out-Null
Copy-RuntimeTree $winUnpacked (Join-Path $bundleRoot 'pet-dist/win-unpacked')
Copy-Item -LiteralPath (Join-Path $Root 'launcher/windows/GoWINBuddy.Launcher.ps1') -Destination $bundleRoot
Copy-Item -LiteralPath (Join-Path $Root 'GoWINBuddy.vbs') -Destination $bundleRoot
Copy-Item -LiteralPath (Join-Path $Root 'bin') -Destination (Join-Path $bundleRoot 'bin') -Recurse
Copy-RuntimeTree (Join-Path $Root 'scripts/windows') (Join-Path $bundleRoot 'scripts/windows')
Copy-RuntimeTree (Join-Path $Root 'apps/rpg-hub') (Join-Path $bundleRoot 'apps/rpg-hub')
New-Item -ItemType Directory -Path (Join-Path $bundleRoot 'configs') -Force | Out-Null
# Never distribute runtime-paths.resolved.json with developer-machine paths.
Copy-Item -LiteralPath (Join-Path $Root 'configs/runtime-paths.json') -Destination (Join-Path $bundleRoot 'configs/runtime-paths.json')
if (Test-Path -LiteralPath (Join-Path $Root 'assets/brand/runtime')) {
  Copy-RuntimeTree (Join-Path $Root 'assets/brand/runtime') (Join-Path $bundleRoot 'brand-assets/runtime')
}
$bundledNode = Join-Path $Root 'tools/runtime/node/node.exe'
$pythonSource = Split-Path $localPython -Parent
if (-not ((Test-Path -LiteralPath $bundledNode) -and (Test-Path -LiteralPath $localPython))) { throw 'Standalone Node and Python runtimes are missing' }
$nodeTarget = Join-Path $bundleRoot 'runtime/node'
$pythonTarget = Join-Path $bundleRoot 'runtime/python/windows-x64/3.11.9'
New-Item -ItemType Directory -Path $nodeTarget,$pythonTarget -Force | Out-Null
Copy-Item -LiteralPath $bundledNode -Destination $nodeTarget
$nodeLicense = Join-Path $Root 'tools/runtime/node/LICENSE.txt'
if (Test-Path -LiteralPath $nodeLicense) { Copy-Item -LiteralPath $nodeLicense -Destination $nodeTarget }
Get-ChildItem -LiteralPath $pythonSource -File | Copy-Item -Destination $pythonTarget
if (Test-Path -LiteralPath (Join-Path $pythonSource 'Lib')) { Copy-RuntimeTree (Join-Path $pythonSource 'Lib') (Join-Path $pythonTarget 'Lib') @('site-packages','__pycache__') }
# npm, NSIS and image-generation packages are intentionally absent from the runtime bundle.
New-Item -ItemType Directory -Path (Join-Path $bundleRoot 'docs') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $Root 'docs/user-guide.zh-CN.md') -Destination (Join-Path $bundleRoot 'docs/user-guide.zh-CN.md')
Copy-Item -LiteralPath (Join-Path $Root 'docs/user-guide.en.md') -Destination (Join-Path $bundleRoot 'docs/user-guide.en.md')
Copy-Item -LiteralPath (Join-Path $Root 'LICENSE') -Destination (Join-Path $bundleRoot 'LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $Root 'THIRD_PARTY_NOTICES.md') -Destination $bundleRoot
Copy-Item -LiteralPath (Join-Path $Root 'assets/LICENSE') -Destination (Join-Path $bundleRoot 'brand-assets/LICENSE')
$packageInfo = Get-Content -LiteralPath (Join-Path $petBuildDir 'package.json') -Raw | ConvertFrom-Json
$appVersion = $packageInfo.version
$manifest = [ordered]@{
  product = 'GoWIN!Buddy'
  version = $appVersion
  builtAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  electron = (Get-Content -LiteralPath (Join-Path $petBuildDir 'node_modules/electron/package.json') -Raw | ConvertFrom-Json).version
  node = (& $bundledNode --version)
  python = (& $localPython --version)
  dashboardHostSha256 = (Get-FileHash -LiteralPath (Join-Path $bundleRoot 'apps/rpg-hub/host/personal_dashboard_host.py') -Algorithm SHA256).Hash
  petTickSha256 = (Get-FileHash -LiteralPath (Join-Path $petBuildDir 'src/tick.js') -Algorithm SHA256).Hash
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $bundleRoot 'build-manifest.json') -Encoding UTF8
$estimatedSizeKB = [int][Math]::Ceiling((Get-ChildItem -LiteralPath $bundleRoot -File -Recurse | Measure-Object -Property Length -Sum).Sum / 1KB)

Write-Host '[5/5] Build Windows installer'
& $makensisPath /INPUTCHARSET UTF8 /DROOT=$Root /DDISTDIR=$distDir /DBUNDLEROOT=$bundleRoot /DAPPVERSION=$appVersion /DESTSIZEKB=$estimatedSizeKB (Join-Path $Root 'installer/windows/nsis/gowin-buddy.nsi')
if ($LASTEXITCODE -ne 0) { throw 'NSIS build failed' }
$setupPath = Join-Path $distDir 'GoWINBuddy-Setup.exe'
if (-not (Test-Path -LiteralPath $setupPath)) { throw 'Windows installer is missing' }
$manifest.installerBytes = (Get-Item -LiteralPath $setupPath).Length
$manifest.installerSha256 = (Get-FileHash -LiteralPath $setupPath -Algorithm SHA256).Hash
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Root 'logs/quality/build-latest.json') -Encoding UTF8
Remove-BuildDirectory $bundleRoot
$zipPath = Join-Path $distDir 'GoWINBuddy-Windows.zip'
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Write-Host "Setup ready: $setupPath"
