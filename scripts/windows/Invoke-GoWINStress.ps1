param(
  [string]$Root = '',
  [double]$DurationMinutes = 30,
  [int]$SampleSeconds = 5,
  [int]$LaunchTimeoutSeconds = 25,
  [switch]$KeepRunning
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($DurationMinutes -le 0) {
  throw "DurationMinutes must be > 0, got: $DurationMinutes"
}
if ($SampleSeconds -le 0) {
  throw "SampleSeconds must be > 0, got: $SampleSeconds"
}

. (Join-Path $PSScriptRoot 'gowin-quality-common.ps1')

$resolvedRoot = Resolve-GoWinRoot -Root $Root -ScriptRoot $PSScriptRoot
$qualityDir = Get-GoWinQualityOutputDir -Root $resolvedRoot
$runStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportPath = Join-Path $qualityDir "stress-$runStamp.json"

$stoppedBefore = Stop-GoWinMatchedProcesses -Root $resolvedRoot -IgnoreProcessIds @($PID)
$launcherProc = Start-GoWinLauncherHidden -Root $resolvedRoot -Environment @{ GOWIN_INTERACTION_DEBUG = '0' }
$ready = Wait-GoWinElectronReady -Root $resolvedRoot -TimeoutSeconds $LaunchTimeoutSeconds

if (-not $ready) {
  $failReport = [pscustomobject]@{
    ok = $false
    reason = "electron-not-ready-within-${LaunchTimeoutSeconds}s"
    root = $resolvedRoot
    stoppedBefore = $stoppedBefore
    reportPath = $reportPath
  }
  $failReport | ConvertTo-Json -Depth 6 | Set-Content -Path $reportPath -Encoding UTF8
  if (-not $KeepRunning) {
    Stop-GoWinMatchedProcesses -Root $resolvedRoot -IgnoreProcessIds @($PID) | Out-Null
  }
  Write-Host "FAIL: GoWIN stress run startup failed. Report: $reportPath"
  exit 2
}

$start = Get-Date
$deadline = $start.AddMinutes($DurationMinutes)
$samples = [System.Collections.Generic.List[object]]::new()
$warnings = [System.Collections.Generic.List[object]]::new()

while ((Get-Date) -lt $deadline) {
  $timestamp = (Get-Date).ToString('o')
  $matched = Get-GoWinMatchedProcesses -Root $resolvedRoot
  $runtimeCount = @($matched | Where-Object { Test-GoWinRuntimeProcessName -Name $_.Name }).Count

  if ($runtimeCount -eq 0) {
    $warnings.Add([pscustomobject]@{
      timestamp = $timestamp
      type = 'runtime-missing'
      message = 'No GoWIN runtime process detected during stress run.'
    }) | Out-Null
    break
  }

  $processStats = [System.Collections.Generic.List[object]]::new()
  foreach ($proc in $matched) {
    try {
      $runtimeProc = Get-Process -Id $proc.ProcessId -ErrorAction Stop
      $processStats.Add([pscustomobject]@{
        processId = $proc.ProcessId
        name = $proc.Name
        workingSetMB = [Math]::Round(($runtimeProc.WorkingSet64 / 1MB), 2)
        privateMemoryMB = [Math]::Round(($runtimeProc.PrivateMemorySize64 / 1MB), 2)
        cpuSeconds = [Math]::Round([double]($runtimeProc.CPU | ForEach-Object { $_ }), 2)
      }) | Out-Null
    } catch {}
  }

  $totalWorkingSetMB = [Math]::Round((@($processStats | Measure-Object -Property workingSetMB -Sum).Sum), 2)
  $samples.Add([pscustomobject]@{
    timestamp = $timestamp
    processCount = $processStats.Count
    runtimeCount = $runtimeCount
    totalWorkingSetMB = $totalWorkingSetMB
    processes = @($processStats)
  }) | Out-Null

  Start-Sleep -Seconds $SampleSeconds
}

$end = Get-Date
$sampleArray = @($samples)
$warningArray = @($warnings)

$peakTotalWorkingSetMB = if ($sampleArray.Count -gt 0) {
  [Math]::Round((@($sampleArray | Measure-Object -Property totalWorkingSetMB -Maximum).Maximum), 2)
} else {
  0
}

$peakByProcess = @{}
foreach ($sample in $sampleArray) {
  foreach ($proc in $sample.processes) {
    $key = "$($proc.name)#$($proc.processId)"
    if (-not $peakByProcess.ContainsKey($key)) {
      $peakByProcess[$key] = $proc.workingSetMB
    } elseif ($proc.workingSetMB -gt $peakByProcess[$key]) {
      $peakByProcess[$key] = $proc.workingSetMB
    }
  }
}

$summary = [pscustomobject]@{
  requestedDurationMinutes = $DurationMinutes
  actualDurationSeconds = [Math]::Round((($end - $start).TotalSeconds), 2)
  sampleIntervalSeconds = $SampleSeconds
  sampleCount = $sampleArray.Count
  peakTotalWorkingSetMB = $peakTotalWorkingSetMB
  warningCount = $warningArray.Count
  peakWorkingSetByProcess = $peakByProcess
}

$ok = $warningArray.Count -eq 0
$report = [pscustomobject]@{
  ok = $ok
  root = $resolvedRoot
  startedAt = $start.ToString('o')
  endedAt = $end.ToString('o')
  summary = $summary
  warnings = $warningArray
  samples = $sampleArray
  reportPath = $reportPath
}

$report | ConvertTo-Json -Depth 10 | Set-Content -Path $reportPath -Encoding UTF8

if (-not $KeepRunning) {
  Stop-GoWinMatchedProcesses -Root $resolvedRoot -IgnoreProcessIds @($PID) | Out-Null
}

if ($ok) {
  Write-Host "PASS: GoWIN stress run completed. Report: $reportPath"
  exit 0
}

Write-Host "FAIL: GoWIN stress run finished with warnings. Report: $reportPath"
exit 2
