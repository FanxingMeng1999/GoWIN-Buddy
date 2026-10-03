param(
  [string]$Root = '',
  [int]$LaunchTimeoutSeconds = 30
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'gowin-quality-common.ps1')

function Resolve-GoWinNpmPath {
  param(
    [string]$ResolvedRoot
  )
  $runtimeConfigPath = Join-Path $ResolvedRoot 'configs\runtime-paths.resolved.json'
  if (Test-Path $runtimeConfigPath) {
    try {
      $runtime = Get-Content $runtimeConfigPath -Raw | ConvertFrom-Json
      if ($runtime.node.npm -and (Test-Path $runtime.node.npm)) {
        return (Resolve-Path $runtime.node.npm).Path
      }
    } catch {}
  }

  $candidates = @(
    (Join-Path $ResolvedRoot 'tools\runtime\node\npm.cmd'),
    (Join-Path $ResolvedRoot 'runtime\runtime\node\npm.cmd'),
    (Join-Path $ResolvedRoot 'runtime\node\npm.cmd')
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return (Resolve-Path $candidate).Path
    }
  }

  $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
  if ($npmCommand) { return $npmCommand.Source }
  return ''
}

function Resolve-GoWinPythonPath {
  param(
    [string]$ResolvedRoot
  )
  $runtimeConfigPath = Join-Path $ResolvedRoot 'configs\runtime-paths.resolved.json'
  if (Test-Path $runtimeConfigPath) {
    try {
      $runtime = Get-Content $runtimeConfigPath -Raw | ConvertFrom-Json
      if ($runtime.python.path -and (Test-Path $runtime.python.path)) {
        return (Resolve-Path $runtime.python.path).Path
      }
    } catch {}
  }

  $candidates = @(
    $env:GOWIN_DASHBOARD_PYTHON,
    (Join-Path $ResolvedRoot '.venv\Scripts\python.exe'),
    (Join-Path $ResolvedRoot 'tools\runtime\python\windows-x64\3.11.9\python.exe'),
    (Join-Path $ResolvedRoot 'runtime\runtime\python\windows-x64\3.11.9\python.exe'),
    (Join-Path $ResolvedRoot 'runtime\python\windows-x64\3.11.9\python.exe')
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return (Resolve-Path $candidate).Path
    }
  }

  $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
  if ($pythonCommand) { return $pythonCommand.Source }
  return ''
}

$resolvedRoot = Resolve-GoWinRoot -Root $Root -ScriptRoot $PSScriptRoot
$qualityDir = Get-GoWinQualityOutputDir -Root $resolvedRoot
$runStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportPath = Join-Path $qualityDir "dashboard-sync-check-$runStamp.json"

$e2eTestPath = Join-Path $resolvedRoot 'apps\pet-desktop\test-e2e\dashboard-sync.e2e.test.js'
$rootPackageJson = Join-Path $resolvedRoot 'package.json'

if ((Test-Path $e2eTestPath) -and (Test-Path $rootPackageJson)) {
  $npmPath = Resolve-GoWinNpmPath -ResolvedRoot $resolvedRoot
  if (-not $npmPath) {
    $report = [pscustomobject]@{
      ok = $false
      mode = 'e2e'
      reason = 'npm-not-found'
      root = $resolvedRoot
      reportPath = $reportPath
    }
    $report | ConvertTo-Json -Depth 6 | Set-Content -Path $reportPath -Encoding UTF8
    Write-Host "FAIL: Dashboard sync e2e npm runtime missing. Report: $reportPath"
    exit 2
  }

  Push-Location $resolvedRoot
  try {
    & $npmPath run quality:dashboard-sync-e2e
    $exitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }

  $report = [pscustomobject]@{
    ok = ($exitCode -eq 0)
    mode = 'e2e'
    root = $resolvedRoot
    npm = $npmPath
    exitCode = $exitCode
    reportPath = $reportPath
  }
  $report | ConvertTo-Json -Depth 6 | Set-Content -Path $reportPath -Encoding UTF8

  if ($exitCode -eq 0) {
    Write-Host "PASS: Dashboard sync check (e2e) succeeded. Report: $reportPath"
    exit 0
  }
  Write-Host "FAIL: Dashboard sync check (e2e) failed. Report: $reportPath"
  exit $exitCode
}

$hostScript = Join-Path $resolvedRoot 'apps\rpg-hub\host\personal_dashboard_host.py'
if (!(Test-Path $hostScript)) {
  $report = [pscustomobject]@{
    ok = $false
    mode = 'smoke'
    reason = 'dashboard-host-script-missing'
    hostScript = $hostScript
    root = $resolvedRoot
    reportPath = $reportPath
  }
  $report | ConvertTo-Json -Depth 6 | Set-Content -Path $reportPath -Encoding UTF8
  Write-Host "FAIL: Dashboard sync smoke host missing. Report: $reportPath"
  exit 2
}

$pythonPath = Resolve-GoWinPythonPath -ResolvedRoot $resolvedRoot
if (-not $pythonPath) {
  $report = [pscustomobject]@{
    ok = $false
    mode = 'smoke'
    reason = 'python-not-found'
    root = $resolvedRoot
    reportPath = $reportPath
  }
  $report | ConvertTo-Json -Depth 6 | Set-Content -Path $reportPath -Encoding UTF8
  Write-Host "FAIL: Dashboard sync smoke python runtime missing. Report: $reportPath"
  exit 2
}

$runtimePath = Join-Path $resolvedRoot 'runtime\rpg_hub\runtime.json'
if (Test-Path $runtimePath) {
  Remove-Item $runtimePath -Force -ErrorAction SilentlyContinue
}

$proc = $null
$url = ''
$healthOk = $false
$hasSyncMarker = $false
$hasWatchHandler = $false
$htmlStatus = 0
$errorText = ''

try {
  $proc = Start-Process -FilePath $pythonPath -ArgumentList @(
    $hostScript,
    'launch',
    '--workspace-root',
    $resolvedRoot,
    '--no-open'
  ) -PassThru -WindowStyle Hidden

  $deadline = (Get-Date).AddSeconds([Math]::Max(5, $LaunchTimeoutSeconds))
  while ((Get-Date) -lt $deadline) {
    if ($proc.HasExited) {
      $errorText = "host-exited-early:$($proc.ExitCode)"
      break
    }
    if (Test-Path $runtimePath) {
      try {
        $runtime = Get-Content $runtimePath -Raw | ConvertFrom-Json
        if ($runtime.url -and ($runtime.url -is [string])) {
          $candidateUrl = $runtime.url
          try {
            $healthResponse = Invoke-WebRequest -Uri ($candidateUrl.TrimEnd('/') + '/health') -UseBasicParsing -TimeoutSec 2
            if ([int]$healthResponse.StatusCode -eq 200) {
              $url = $candidateUrl
              $healthOk = $true
              break
            }
          } catch {}
        }
      } catch {}
    }
    Start-Sleep -Milliseconds 250
  }

  if ($healthOk -and $url) {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
    $htmlStatus = [int]$response.StatusCode
    $content = [string]$response.Content
    $hasSyncMarker = $content.Contains('id="remoteSyncStatus"')
    $hasWatchHandler = $content.Contains('watchRemoteStateChanges')
  }
} catch {
  $errorText = $_.Exception.Message
} finally {
  if ($proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  }
}

$ok = $healthOk -and ($htmlStatus -eq 200) -and $hasSyncMarker -and $hasWatchHandler
$report = [pscustomobject]@{
  ok = $ok
  mode = 'smoke'
  root = $resolvedRoot
  hostScript = $hostScript
  python = $pythonPath
  runtimeUrl = $url
  healthOk = $healthOk
  htmlStatus = $htmlStatus
  hasSyncMarker = $hasSyncMarker
  hasWatchHandler = $hasWatchHandler
  error = $errorText
  reportPath = $reportPath
}
$report | ConvertTo-Json -Depth 6 | Set-Content -Path $reportPath -Encoding UTF8

if ($ok) {
  Write-Host "PASS: Dashboard sync check (smoke) succeeded. Report: $reportPath"
  exit 0
}
Write-Host "FAIL: Dashboard sync check (smoke) failed. Report: $reportPath"
exit 2
