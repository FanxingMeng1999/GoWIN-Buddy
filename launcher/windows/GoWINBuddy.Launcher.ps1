param(
  [ValidateSet('launch','prepare','open-state','smoke','shortcut')]
  [string]$Action = 'launch',
  [string]$Root = $(if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'pet-dist')) { $PSScriptRoot } else { (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path })
)

$ErrorActionPreference = 'Stop'
$Root = "$Root".Trim().Trim('"')
$Root = (Resolve-Path $Root).Path
$petSourceDir = Join-Path $Root 'apps\pet-desktop'
$petPackagedExe = Join-Path $Root 'pet-dist\win-unpacked\GoWIN!Buddy.exe'
$petLockfile = Join-Path $petSourceDir 'package-lock.json'
$runtimeResolved = Join-Path $Root 'configs\runtime-paths.resolved.json'
$isSourceLayout = Test-Path $petSourceDir
$isPackagedLayout = Test-Path $petPackagedExe

function Resolve-Executable([string[]]$Candidates, [string]$FallbackCmd) {
  foreach($c in $Candidates){ if($c -and (Test-Path $c)){ return (Resolve-Path $c).Path } }
  $cmd = Get-Command $FallbackCmd -ErrorAction SilentlyContinue
  if($cmd){ return $cmd.Source }
  return $null
}

function Apply-ResolvedRuntime([string]$configPath) {
  if (!(Test-Path $configPath)) { return }
  try {
    $runtime = Get-Content $configPath -Raw | ConvertFrom-Json
    if (-not $env:GOWIN_NODE_PATH -and $runtime.node.path -and (Test-Path $runtime.node.path)) {
      $script:nodePath = (Resolve-Path $runtime.node.path).Path
    }
    if (-not $env:GOWIN_NPM_PATH -and $runtime.node.npm -and (Test-Path $runtime.node.npm)) {
      $script:npmPath = (Resolve-Path $runtime.node.npm).Path
    }
    if (-not $env:GOWIN_BUNDLED_PYTHON -and $runtime.python.path -and (Test-Path $runtime.python.path)) {
      $script:pythonPath = (Resolve-Path $runtime.python.path).Path
    }
  } catch {
    Write-Warning "failed to parse runtime config: $configPath"
  }
}

$nodePath = Resolve-Executable @(
  $env:GOWIN_NODE_PATH,
  (Join-Path $Root 'tools/runtime/node/node.exe'),
  (Join-Path $Root 'runtime/node/node.exe')
) 'node'

$npmPath = Resolve-Executable @(
  $env:GOWIN_NPM_PATH,
  (Join-Path $Root 'tools\runtime\node\npm.cmd'),
  (Join-Path $Root 'tools\runtime\node\npm')
) 'npm'

$pythonPath = Resolve-Executable @(
  $env:GOWIN_BUNDLED_PYTHON,
  (Join-Path $Root 'tools\runtime\python\windows-x64\3.11.9\python.exe'),
  (Join-Path $Root 'runtime\python\windows-x64\3.11.9\python.exe')
) 'python'
if (-not $isPackagedLayout) { Apply-ResolvedRuntime $runtimeResolved }

$dashboardStatePath = ''
$dashboardRuntimePath = ''
$dashboardThemePath = ''
if ($isPackagedLayout) {
  $userDataRoot = if ($env:GOWIN_USER_DATA_ROOT) {
    $env:GOWIN_USER_DATA_ROOT
  } elseif ($env:APPDATA) {
    Join-Path $env:APPDATA 'gowin-buddy-pet'
  } else {
    Join-Path $Root 'runtime\gowin-user-data'
  }
  $dashboardStatePath = Join-Path $userDataRoot 'state\game_state.json'
  $dashboardRuntimePath = Join-Path $userDataRoot 'runtime\rpg_hub\runtime.json'
  $dashboardThemePath = Join-Path $userDataRoot 'runtime/rpg_hub/theme.json'
  New-Item -ItemType Directory -Path (Split-Path $dashboardStatePath -Parent) -Force | Out-Null
  New-Item -ItemType Directory -Path (Split-Path $dashboardRuntimePath -Parent) -Force | Out-Null
}

if ($Action -eq 'prepare') {
  if ($isSourceLayout -and !(Test-Path $runtimeResolved)) {
    Write-Host 'Preparing local runtimes...'
    & (Join-Path $Root 'scripts\bootstrap-local-deps.ps1') -Root $Root
  }
  Apply-ResolvedRuntime $runtimeResolved
  if ($isPackagedLayout) {
    Write-Host "Packaged runtime: $petPackagedExe"
  }
  Write-Host "Node  : $nodePath"
  Write-Host "npm   : $npmPath"
  Write-Host "Python: $pythonPath"
  exit 0
}

if ($Action -eq 'open-state') {
  $statePath = if ($dashboardStatePath) { $dashboardStatePath } else { Join-Path $Root 'data\state\game_state.json' }
  if (!(Test-Path $statePath)) {
    New-Item -ItemType Directory -Path (Split-Path $statePath -Parent) -Force | Out-Null
    '{"tasks":[],"gameState":{}}' | Set-Content $statePath -Encoding UTF8
  }
  Start-Process notepad.exe $statePath
  exit 0
}

if ($Action -eq 'shortcut') {
  $desktopPath = [Environment]::GetFolderPath('Desktop')
  $shortcutPath = Join-Path $desktopPath 'GoWIN!Buddy.lnk'
  $silentEntryPath = Join-Path $Root 'GoWINBuddy.vbs'
  $targetPath = $silentEntryPath
  $targetArgs = ''
  if (Test-Path $silentEntryPath) {
    $targetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
    $targetArgs = "`"$silentEntryPath`""
  } else {
    $targetPath = Join-Path $Root 'bin\GoWINBuddy.bat'
    if (!(Test-Path $targetPath)) {
      $targetPath = Join-Path $Root 'GoWINBuddy.bat'
    }
  }
  $iconCandidates = @(
    (Join-Path $Root 'apps\pet-desktop\assets\icon.ico'),
    (Join-Path $Root 'brand-assets\runtime\gowin-app-icon.ico'),
    $petPackagedExe
  )
  $iconPath = $null
  foreach ($candidatePath in $iconCandidates) {
    if ($candidatePath -and (Test-Path $candidatePath)) {
      $iconPath = (Resolve-Path $candidatePath).Path
      break
    }
  }
  if (!(Test-Path $targetPath)) { throw "launcher target not found: $targetPath" }
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $targetPath
  if ($targetArgs) {
    $shortcut.Arguments = $targetArgs
  }
  $shortcut.WorkingDirectory = $Root
  $shortcut.Description = 'Launch GoWIN!Buddy'
  if (Test-Path $iconPath) {
    $shortcut.IconLocation = "$iconPath,0"
  }
  $shortcut.Save()
  Write-Host "Desktop shortcut created: $shortcutPath"
  exit 0
}

$env:GOWIN_BUDDY_ROOT = $Root
if($pythonPath){ $env:GOWIN_BUNDLED_PYTHON = $pythonPath }
$env:GOWIN_BUDDY_MODE = 'dashboard'
if ($dashboardStatePath) { $env:GOWIN_DASHBOARD_STATE_PATH = $dashboardStatePath }
if ($dashboardRuntimePath) { $env:GOWIN_DASHBOARD_RUNTIME_PATH = $dashboardRuntimePath }
if ($dashboardThemePath) { $env:GOWIN_DASHBOARD_THEME_PATH = $dashboardThemePath }

if ($Action -eq 'smoke') {
  if (-not $isSourceLayout) {
    if ($isPackagedLayout) {
      Write-Host "Packaged mode detected: $petPackagedExe"
      exit 0
    }
    throw "pet runtime not found: $petSourceDir"
  }
  if (-not $npmPath) { throw 'npm not found. Run scripts/bootstrap-local-deps.ps1 first.' }
  & $npmPath run test --prefix $petSourceDir
  exit $LASTEXITCODE
}

if (-not ($isSourceLayout -or $isPackagedLayout)) {
  throw "pet runtime not found: expected $petSourceDir or $petPackagedExe"
}

Write-Host 'Launching GoWIN!Buddy pet...'

if ($isPackagedLayout) {
  Start-Process -FilePath $petPackagedExe -WindowStyle Hidden -WorkingDirectory (Split-Path $petPackagedExe -Parent) | Out-Null
  exit 0
}

if (!(Test-Path (Join-Path $petSourceDir 'node_modules'))) {
  if (-not $npmPath) { throw 'npm not found. Run scripts/bootstrap-local-deps.ps1 first.' }
  Write-Host 'Installing pet dependencies locally...'
  if (Test-Path $petLockfile) {
    & $npmPath ci --prefix $petSourceDir
  } else {
    & $npmPath install --prefix $petSourceDir
  }
  if ($LASTEXITCODE -ne 0) { throw "npm dependency installation failed with exit code $LASTEXITCODE" }
}

if ($nodePath) {
  Push-Location $petSourceDir
  try {
    & $nodePath (Join-Path $petSourceDir 'launch.js')
    exit $LASTEXITCODE
  } finally {
    Pop-Location
  }
}

if (-not $npmPath) { throw 'node/npm not found. Run scripts/bootstrap-local-deps.ps1 first.' }
& $npmPath run start --prefix $petSourceDir
exit $LASTEXITCODE
