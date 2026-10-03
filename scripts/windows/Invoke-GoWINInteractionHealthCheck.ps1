param(
  [string]$Root = '',
  [int]$LaunchTimeoutSeconds = 25,
  [int]$WindowReadyTimeoutSeconds = 12,
  [switch]$KeepRunning
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'gowin-quality-common.ps1')

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class GoWinWin32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int x, int y);

  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
}
"@

function Get-GoWinVisibleWindows {
  param(
    [int[]]$ProcessIds
  )
  $pidSet = [System.Collections.Generic.HashSet[int]]::new()
  foreach ($processIdItem in $ProcessIds) {
    [void]$pidSet.Add([int]$processIdItem)
  }

  $windows = [System.Collections.Generic.List[object]]::new()
  $cb = [GoWinWin32+EnumWindowsProc]{
    param([IntPtr]$hWnd, [IntPtr]$lParam)

    $windowPid = [uint32]0
    [void][GoWinWin32]::GetWindowThreadProcessId($hWnd, [ref]$windowPid)
    if (-not $pidSet.Contains([int]$windowPid)) { return $true }
    if (-not [GoWinWin32]::IsWindowVisible($hWnd)) { return $true }

    $titleBuilder = [System.Text.StringBuilder]::new(260)
    [void][GoWinWin32]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity)
    $title = $titleBuilder.ToString()

    $rect = New-Object GoWinWin32+RECT
    [void][GoWinWin32]::GetWindowRect($hWnd, [ref]$rect)
    $windows.Add([pscustomobject]@{
      Handle = $hWnd
      ProcessId = [int]$windowPid
      Title = $title
      Left = $rect.Left
      Top = $rect.Top
      Width = ($rect.Right - $rect.Left)
      Height = ($rect.Bottom - $rect.Top)
    }) | Out-Null
    return $true
  }
  [void][GoWinWin32]::EnumWindows($cb, [IntPtr]::Zero)
  return @($windows)
}

function Get-WindowRectByHandle {
  param(
    [IntPtr]$Handle
  )
  $rect = New-Object GoWinWin32+RECT
  [void][GoWinWin32]::GetWindowRect($Handle, [ref]$rect)
  return [pscustomobject]@{
    Left = $rect.Left
    Top = $rect.Top
    Width = ($rect.Right - $rect.Left)
    Height = ($rect.Bottom - $rect.Top)
  }
}

function Invoke-MouseLeftClick {
  [GoWinWin32]::mouse_event([GoWinWin32]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 45
  [GoWinWin32]::mouse_event([GoWinWin32]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
}

function Read-InteractionEvents {
  param(
    [string]$LogPath
  )
  if (!(Test-Path $LogPath)) { return @() }
  $events = [System.Collections.Generic.List[object]]::new()
  foreach ($line in (Get-Content $LogPath -ErrorAction SilentlyContinue)) {
    if ($line -match '^(?<ts>\S+)\s+(?<name>\S+)(?:\s+(?<payload>\{.*\}))?$') {
      $payloadObj = $null
      $payloadRaw = if ($Matches.ContainsKey('payload')) { $Matches['payload'] } else { $null }
      if ($payloadRaw) {
        try { $payloadObj = $payloadRaw | ConvertFrom-Json } catch {}
      }
      $events.Add([pscustomobject]@{
        Timestamp = $Matches.ts
        Name = $Matches.name
        Payload = $payloadObj
      }) | Out-Null
    }
  }
  return @($events)
}

$resolvedRoot = Resolve-GoWinRoot -Root $Root -ScriptRoot $PSScriptRoot
$qualityDir = Get-GoWinQualityOutputDir -Root $resolvedRoot
$runStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportPath = Join-Path $qualityDir "interaction-health-$runStamp.json"
$interactionLogPath = if ($env:GOWIN_USER_DATA_ROOT) {
  Join-Path $env:GOWIN_USER_DATA_ROOT 'interaction-debug.log'
} elseif ($env:APPDATA) {
  Join-Path $env:APPDATA 'gowin-buddy-pet\interaction-debug.log'
} else {
  Join-Path $resolvedRoot 'logs\interaction-debug.log'
}

$stoppedBefore = Stop-GoWinMatchedProcesses -Root $resolvedRoot -IgnoreProcessIds @($PID)
if (Test-Path $interactionLogPath) {
  Remove-Item $interactionLogPath -Force -ErrorAction SilentlyContinue
}

$launcherProc = Start-GoWinLauncherHidden -Root $resolvedRoot -Environment @{ GOWIN_INTERACTION_DEBUG = '1' }
$ready = Wait-GoWinElectronReady -Root $resolvedRoot -TimeoutSeconds $LaunchTimeoutSeconds
if (-not $ready) {
  $report = [pscustomobject]@{
    ok = $false
    reason = "electron-not-ready-within-${LaunchTimeoutSeconds}s"
    root = $resolvedRoot
    stoppedBefore = $stoppedBefore
    reportPath = $reportPath
  }
  $report | ConvertTo-Json -Depth 6 | Set-Content -Path $reportPath -Encoding UTF8
  if (-not $KeepRunning) {
    Stop-GoWinMatchedProcesses -Root $resolvedRoot -IgnoreProcessIds @($PID) | Out-Null
  }
  Write-Host "FAIL: GoWIN interaction health check startup failed. Report: $reportPath"
  exit 2
}

Start-Sleep -Milliseconds 1200

$matched = @()
$windows = @()
$candidateWindows = @()
$hitWindow = $null
$mainWindow = $null
$windowDeadline = (Get-Date).AddSeconds([Math]::Max(1, $WindowReadyTimeoutSeconds))
do {
  $matched = Get-GoWinMatchedProcesses -Root $resolvedRoot
  $windows = Get-GoWinVisibleWindows -ProcessIds ($matched.ProcessId)

  $candidateWindows = @(
    $windows | Where-Object {
      $_.Width -ge 120 -and $_.Height -ge 120 -and (
        $_.Title -eq 'gowin-buddy-pet' -or
        $_.Title -eq 'Clawd' -or
        $_.Title -like '*GoWIN*'
      )
    }
  )

  $hitWindow = $windows | Where-Object { $_.Title -eq 'gowin-buddy-pet' } | Select-Object -First 1
  $mainWindow = $windows | Where-Object { $_.Title -eq 'Clawd' } | Select-Object -First 1

  if (-not $mainWindow -and $candidateWindows.Count -gt 0) {
    $mainWindow = $candidateWindows |
      Sort-Object { [int]$_.Width * [int]$_.Height } -Descending |
      Select-Object -First 1
  }

  if (-not $hitWindow -and $candidateWindows.Count -gt 0) {
    $hitWindow = $candidateWindows |
      Sort-Object { [int]$_.Width * [int]$_.Height } |
      Select-Object -First 1
  }

  if ($hitWindow -and $mainWindow -and $hitWindow.Handle -eq $mainWindow.Handle -and $candidateWindows.Count -gt 1) {
    $hitWindow = $candidateWindows |
      Where-Object { $_.Handle -ne $mainWindow.Handle } |
      Sort-Object { [int]$_.Width * [int]$_.Height } |
      Select-Object -First 1
  }

  if ($hitWindow -and $mainWindow) {
    break
  }
  Start-Sleep -Milliseconds 350
} while ((Get-Date) -lt $windowDeadline)

if (-not $hitWindow -or -not $mainWindow) {
  $report = [pscustomobject]@{
    ok = $false
    reason = 'missing-hit-or-main-window'
    matchedProcessIds = @($matched | Select-Object -ExpandProperty ProcessId)
    windows = $windows
    root = $resolvedRoot
    reportPath = $reportPath
  }
  $report | ConvertTo-Json -Depth 6 | Set-Content -Path $reportPath -Encoding UTF8
  if (-not $KeepRunning) {
    Stop-GoWinMatchedProcesses -Root $resolvedRoot -IgnoreProcessIds @($PID) | Out-Null
  }
  Write-Host "FAIL: GoWIN interaction windows not found. Report: $reportPath"
  exit 2
}

$originalCursor = [pscustomobject]@{
  X = 50
  Y = 50
}

$outsideX = [int][Math]::Max(10, $hitWindow.Left - 80)
$outsideY = [int][Math]::Max(10, $hitWindow.Top - 80)
$centerX = [int]($hitWindow.Left + [Math]::Floor($hitWindow.Width * 0.5))
$centerY = [int]($hitWindow.Top + [Math]::Floor($hitWindow.Height * 0.5))

# Hover in/out validation
[void][GoWinWin32]::SetCursorPos($outsideX, $outsideY)
Start-Sleep -Milliseconds 250
[void][GoWinWin32]::SetCursorPos($centerX, $centerY)
Start-Sleep -Milliseconds 380
[void][GoWinWin32]::SetCursorPos($outsideX, $outsideY)
Start-Sleep -Milliseconds 420

# Double-click validation
[void][GoWinWin32]::SetCursorPos($centerX, $centerY)
Start-Sleep -Milliseconds 120
Invoke-MouseLeftClick
Start-Sleep -Milliseconds 120
Invoke-MouseLeftClick
Start-Sleep -Milliseconds 450

# Drag validation
$mainBefore = Get-WindowRectByHandle -Handle $mainWindow.Handle
[void][GoWinWin32]::SetCursorPos($centerX, $centerY)
Start-Sleep -Milliseconds 120
[GoWinWin32]::mouse_event([GoWinWin32]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 90

$dragEndX = $centerX + 110
$dragEndY = $centerY + 55
for ($i = 1; $i -le 10; $i++) {
  $x = [int]($centerX + ($dragEndX - $centerX) * $i / 10)
  $y = [int]($centerY + ($dragEndY - $centerY) * $i / 10)
  [void][GoWinWin32]::SetCursorPos($x, $y)
  Start-Sleep -Milliseconds 35
}
Start-Sleep -Milliseconds 100
[GoWinWin32]::mouse_event([GoWinWin32]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 500
$mainAfter = Get-WindowRectByHandle -Handle $mainWindow.Handle

[void][GoWinWin32]::SetCursorPos($outsideX, $outsideY)

$events = Read-InteractionEvents -LogPath $interactionLogPath
$hoverEvents = @($events | Where-Object { $_.Name -eq 'quick-task:hover' })
$routerReady = @($events | Where-Object { $_.Name -eq 'router:ready' }).Count -gt 0
$hoverInside = @($hoverEvents | Where-Object { $_.Payload -and $_.Payload.inside -eq $true }).Count -gt 0
$hoverOutside = @($hoverEvents | Where-Object { $_.Payload -and $_.Payload.inside -eq $false }).Count -gt 0
$openDashboard = @($events | Where-Object { $_.Name -eq 'open-dashboard' }).Count -gt 0
$dragMove = @($events | Where-Object { $_.Name -eq 'move-window-by' }).Count -gt 0
$dragEnd = @($events | Where-Object { $_.Name -eq 'drag-end' }).Count -gt 0
$mainDeltaX = $mainAfter.Left - $mainBefore.Left
$mainDeltaY = $mainAfter.Top - $mainBefore.Top
$mainMoved = [Math]::Abs($mainDeltaX) -ge 2 -or [Math]::Abs($mainDeltaY) -ge 2

$checks = [ordered]@{
  routerReady = $routerReady
  hoverInside = $hoverInside
  hoverOutside = $hoverOutside
  openDashboard = $openDashboard
  dragMoveEvent = $dragMove
  dragEndEvent = $dragEnd
  mainWindowMoved = $mainMoved
}

$failedChecks = @($checks.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
$ok = $failedChecks.Count -eq 0

$report = [pscustomobject]@{
  ok = $ok
  checkedAt = (Get-Date).ToString('o')
  root = $resolvedRoot
  interactionLogPath = $interactionLogPath
  checks = $checks
  failedChecks = $failedChecks
  windowRect = @{
    mainBefore = $mainBefore
    mainAfter = $mainAfter
    delta = @{
      x = $mainDeltaX
      y = $mainDeltaY
    }
    hit = @{
      left = $hitWindow.Left
      top = $hitWindow.Top
      width = $hitWindow.Width
      height = $hitWindow.Height
    }
  }
  eventCount = $events.Count
  recentEvents = @($events | Select-Object -Last 80)
  reportPath = $reportPath
}

$report | ConvertTo-Json -Depth 8 | Set-Content -Path $reportPath -Encoding UTF8

if (-not $KeepRunning) {
  Stop-GoWinMatchedProcesses -Root $resolvedRoot -IgnoreProcessIds @($PID) | Out-Null
}

if ($ok) {
  Write-Host "PASS: GoWIN interaction health check succeeded. Report: $reportPath"
  exit 0
}

Write-Host "FAIL: GoWIN interaction health check failed => $($failedChecks -join ', '). Report: $reportPath"
exit 2
