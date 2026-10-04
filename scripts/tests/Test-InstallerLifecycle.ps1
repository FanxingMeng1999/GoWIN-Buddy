param([Parameter(Mandatory=$true)][string]$InstallRoot,[string]$SetupPath)
$ErrorActionPreference='Stop'
$workspaceRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$InstallRoot=(Resolve-Path -LiteralPath $InstallRoot).Path
$allowed=[IO.Path]::GetFullPath((Join-Path $workspaceRoot 'tmp')).TrimEnd('\')+'\'
if (-not $InstallRoot.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)) { throw 'Lifecycle checks require a fixture under this checkout tmp/' }
if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot 'qa-install.marker'))) { throw 'Isolated /QA installation marker required' }
if (-not $SetupPath) { $SetupPath=Join-Path $workspaceRoot 'installer/windows/dist/GoWINBuddy-Setup.exe' }
$setup=(Resolve-Path -LiteralPath $SetupPath).Path
$profile=Join-Path (Split-Path $InstallRoot -Parent) 'test-user-data'
$state=Join-Path $profile 'state/game_state.json'
$prefs=Join-Path $profile 'gowin-prefs.json'
foreach ($file in @($state,$prefs)) { if (-not (Test-Path -LiteralPath $file)) { throw 'Run packaged-smoke.e2e.js before lifecycle checks' } }
$beforeState=(Get-FileHash -LiteralPath $state -Algorithm SHA256).Hash
$beforePrefs=(Get-FileHash -LiteralPath $prefs -Algorithm SHA256).Hash
$shortcut=Join-Path ([Environment]::GetFolderPath('Desktop')) 'GoWIN!Buddy.lnk'
$shortcutBefore=if(Test-Path -LiteralPath $shortcut){(Get-FileHash -LiteralPath $shortcut -Algorithm SHA256).Hash}else{''}
$registration='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\GoWINBuddy'
$registrationBefore=if(Test-Path -LiteralPath $registration){Get-ItemProperty -LiteralPath $registration | ConvertTo-Json -Compress}else{''}
$upgrade=Start-Process -FilePath $setup -ArgumentList ('/S /QA /D='+$InstallRoot) -WindowStyle Hidden -PassThru -Wait
if($upgrade.ExitCode -ne 0){throw 'Fixture upgrade failed'}
if((Get-FileHash -LiteralPath $state).Hash -ne $beforeState -or (Get-FileHash -LiteralPath $prefs).Hash -ne $beforePrefs){throw 'Upgrade changed personal state or preferences'}
$sentinel=Join-Path $InstallRoot 'user-created-note.txt'
[IO.File]::WriteAllText($sentinel,'User-owned fixture; preserve during uninstall.')
$uninstaller=Join-Path $InstallRoot 'Uninstall.exe'
$uninstall=Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -PassThru -Wait
if($uninstall.ExitCode -ne 0){throw 'Fixture uninstall failed'}
$exe=Join-Path $InstallRoot 'pet-dist/win-unpacked/GoWIN!Buddy.exe'
for($i=0;$i -lt 100 -and (Test-Path -LiteralPath $exe);$i++){Start-Sleep -Milliseconds 200}
if(Test-Path -LiteralPath $exe){throw 'Application binary remains after uninstall'}
if((Get-FileHash -LiteralPath $state).Hash -ne $beforeState -or (Get-FileHash -LiteralPath $prefs).Hash -ne $beforePrefs){throw 'Uninstall changed personal state or preferences'}
if(-not(Test-Path -LiteralPath $sentinel)){throw 'Uninstall removed user-created file'}
$shortcutAfter=if(Test-Path -LiteralPath $shortcut){(Get-FileHash -LiteralPath $shortcut -Algorithm SHA256).Hash}else{''}
$registrationAfter=if(Test-Path -LiteralPath $registration){Get-ItemProperty -LiteralPath $registration | ConvertTo-Json -Compress}else{''}
if($shortcutAfter -ne $shortcutBefore -or $registrationAfter -ne $registrationBefore){throw '/QA fixture modified normal registration or shortcut'}
foreach($owned in @('docs/user-guide.en.md','docs/user-guide.zh-CN.md','THIRD_PARTY_NOTICES.md','apps/rpg-hub','brand-assets')){if(Test-Path -LiteralPath (Join-Path $InstallRoot $owned)){throw ('Owned payload remains: '+$owned)}}
Write-Host 'PASS: upgrade and uninstall preserve state, preferences and user files; /QA leaves normal registration unchanged.'
