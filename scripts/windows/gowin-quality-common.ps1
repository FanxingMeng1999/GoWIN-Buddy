Set-StrictMode -Version Latest

function Resolve-GoWinRoot {
  param(
    [string]$Root,
    [string]$ScriptRoot
  )
  $candidate = if ($Root) {
    $Root
  } else {
    Join-Path $ScriptRoot '..\..'
  }
  $normalized = "$candidate".Trim().Trim('"')
  return (Resolve-Path $normalized).Path
}

function Get-GoWinQualityOutputDir {
  param(
    [string]$Root
  )
  $dir = Join-Path $Root 'logs\quality'
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
  return $dir
}

function Get-GoWinMatchContext {
  param(
    [string]$Root
  )
  $rootNormalized = "$Root".Trim().Trim('"')
  $rootBackslash = $rootNormalized.ToLowerInvariant()
  $rootSlash = ($rootNormalized -replace '\\', '/').ToLowerInvariant()
  $userDataMarker = ''
  if ($env:APPDATA) {
    $userDataMarker = (Join-Path $env:APPDATA 'gowin-buddy-pet').ToLowerInvariant()
  }
  return @{
    rootBackslash = $rootBackslash
    rootSlash = $rootSlash
    userDataMarker = $userDataMarker
  }
}

function Test-GoWinProcessMatch {
  param([object]$ProcessItem, [hashtable]$Context)
  if (-not $ProcessItem) { return $false }
  $cmdLower = ([string]$ProcessItem.CommandLine).ToLowerInvariant()
  $exeLower = ([string]$ProcessItem.ExecutablePath).ToLowerInvariant()
  $nameLower = ([string]$ProcessItem.Name).ToLowerInvariant()
  $rootBack = [string]$Context.rootBackslash
  $rootForward = [string]$Context.rootSlash
  # Match an actual path boundary, so a neighboring workspace is excluded.
  $inRoot = $exeLower.StartsWith($rootBack + '\') -or $exeLower.StartsWith($rootForward + '/') -or
    ($cmdLower -match ([regex]::Escape($rootBack) + '(?=[\\/"\s]|$)')) -or
    ($cmdLower -match ([regex]::Escape($rootForward) + '(?=[\\/"\s]|$)'))
  if (-not $inRoot) { return $false }
  if ($nameLower -in @('electron.exe', 'gowin!buddy.exe', 'gowinbuddy.exe')) { return $true }
  if ($nameLower -in @('python.exe', 'pythonw.exe')) {
    return $cmdLower.Contains('personal_dashboard_host.py')
  }
  if ($nameLower -in @('powershell.exe', 'pwsh.exe', 'wscript.exe')) {
    return $cmdLower.Contains('gowinbuddy.launcher.ps1') -or $cmdLower.Contains('gowinbuddy.vbs')
  }
  return $false
}

function Get-GoWinMatchedProcesses {
  param(
    [string]$Root
  )
  $context = Get-GoWinMatchContext -Root $Root
  $candidates = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -and (
      $_.Name -match 'electron|node|python|GoWIN|gowin|wscript|powershell|pwsh|cmd' -or
      $_.ExecutablePath -match 'GoWIN|gowin'
    )
  }
  return @($candidates | Where-Object { Test-GoWinProcessMatch -ProcessItem $_ -Context $context })
}

function Test-GoWinRuntimeProcessName {
  param(
    [string]$Name
  )
  if (-not $Name) { return $false }
  $n = $Name.ToLowerInvariant()
  return (
    $n -eq 'electron.exe' -or
    $n -eq 'gowin!buddy.exe' -or
    $n -eq 'gowinbuddy.exe'
  )
}

function Stop-GoWinMatchedProcesses {
  param(
    [string]$Root,
    [int[]]$IgnoreProcessIds = @(),
    [int]$WaitMs = 500
  )
  $targets = Get-GoWinMatchedProcesses -Root $Root | Where-Object {
    $IgnoreProcessIds -notcontains $_.ProcessId
  }
  foreach ($proc in $targets) {
    try {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    } catch {}
  }
  if ($WaitMs -gt 0) {
    Start-Sleep -Milliseconds $WaitMs
  }
  return @($targets).Count
}

function Start-GoWinLauncherHidden {
  param(
    [string]$Root,
    [hashtable]$Environment = @{}
  )
  $launcherCandidates = @(
    (Join-Path $Root 'launcher\windows\GoWINBuddy.Launcher.ps1'),
    (Join-Path $Root 'GoWINBuddy.Launcher.ps1')
  )
  $launcherPath = $null
  foreach ($candidatePath in $launcherCandidates) {
    if (Test-Path $candidatePath) {
      $launcherPath = (Resolve-Path $candidatePath).Path
      break
    }
  }
  if (-not $launcherPath) {
    throw "launcher not found in root: $Root"
  }

  $envBackup = @{}
  foreach ($key in $Environment.Keys) {
    if (Test-Path "Env:$key") {
      $envBackup[$key] = (Get-Item "Env:$key").Value
    } else {
      $envBackup[$key] = $null
    }
    [Environment]::SetEnvironmentVariable($key, [string]$Environment[$key], 'Process')
  }

  try {
    return Start-Process -FilePath powershell.exe -ArgumentList @(
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-WindowStyle', 'Hidden',
      '-File', ('"' + $launcherPath + '"'),
      '-Action', 'launch',
      '-Root', ('"' + $Root + '"')
    ) -WindowStyle Hidden -PassThru
  } finally {
    foreach ($key in $Environment.Keys) {
      $previous = $envBackup[$key]
      if ($null -eq $previous) {
        Remove-Item "Env:$key" -ErrorAction SilentlyContinue
      } else {
        [Environment]::SetEnvironmentVariable($key, [string]$previous, 'Process')
      }
    }
  }
}

function Wait-GoWinElectronReady {
  param(
    [string]$Root,
    [int]$TimeoutSeconds = 25
  )
  $deadline = (Get-Date).AddSeconds([Math]::Max(1, $TimeoutSeconds))
  do {
    $matched = Get-GoWinMatchedProcesses -Root $Root
    if ($matched | Where-Object { Test-GoWinRuntimeProcessName -Name $_.Name }) {
      return $true
    }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  return $false
}
