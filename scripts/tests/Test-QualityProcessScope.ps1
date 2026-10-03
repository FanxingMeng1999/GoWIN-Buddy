$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\windows\gowin-quality-common.ps1')
$context = Get-GoWinMatchContext -Root 'C:\example\GoWIN-Buddy'
$cases = @(
  @{ Name='electron.exe'; ExecutablePath='C:\example\GoWIN-Buddy\apps\pet-desktop\node_modules\electron\dist\electron.exe'; CommandLine='electron.exe C:\example\GoWIN-Buddy\apps\pet-desktop'; Expected=$true },
  @{ Name='GoWIN!Buddy.exe'; ExecutablePath='C:\example\GoWIN-Buddy\pet-dist\win-unpacked\GoWIN!Buddy.exe'; CommandLine='GoWIN!Buddy.exe'; Expected=$true },
  @{ Name='python.exe'; ExecutablePath='C:\Python\python.exe'; CommandLine='python C:\example\GoWIN-Buddy\apps\rpg-hub\host\personal_dashboard_host.py'; Expected=$true },
  @{ Name='node.exe'; ExecutablePath='C:\node\node.exe'; CommandLine='node C:\example\GoWIN-Buddy\apps\pet-desktop\node_modules\electron-builder\cli.js'; Expected=$false },
  @{ Name='powershell.exe'; ExecutablePath='C:\Windows\powershell.exe'; CommandLine='powershell -File C:\example\GoWIN-Buddy\installer\windows\build-installer.ps1'; Expected=$false },
  @{ Name='electron.exe'; ExecutablePath='C:\example\GoWIN-Buddy-other\app\electron.exe'; CommandLine='electron.exe C:\example\GoWIN-Buddy-other\app'; Expected=$false },
  @{ Name='GoWIN!Buddy.exe'; ExecutablePath='D:\Other\GoWIN!Buddy.exe'; CommandLine='GoWIN!Buddy.exe --user-data-dir C:\example\profile\gowin-buddy-pet'; Expected=$false }
)
foreach ($case in $cases) {
  $result = Test-GoWinProcessMatch -ProcessItem ([pscustomobject]$case) -Context $context
  if ($result -ne $case.Expected) { throw ('Process scope mismatch: ' + $case.CommandLine) }
}
Write-Output ('PASS: ' + $cases.Count + ' process scope regression cases')
