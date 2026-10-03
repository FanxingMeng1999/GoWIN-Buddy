$ErrorActionPreference = 'Stop'
$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
New-Item -ItemType Directory -Path (Join-Path $workspaceRoot 'logs/quality') -Force | Out-Null
$fixtureRoot = Join-Path $workspaceRoot 'tmp/runtime-priority-qa-20261003'
$pythonRoot = Join-Path $fixtureRoot 'tools/runtime/python/windows-x64/3.11.9'
$nodeRoot = Join-Path $fixtureRoot 'tools/runtime/node'
$explicitRoot = Join-Path $fixtureRoot 'explicit'
New-Item -ItemType Directory -Path $pythonRoot,$nodeRoot,$explicitRoot,(Join-Path $fixtureRoot 'configs') -Force | Out-Null
foreach ($fixtureFile in @((Join-Path $pythonRoot 'python.exe'),(Join-Path $nodeRoot 'node.exe'),(Join-Path $nodeRoot 'npm.cmd'),(Join-Path $explicitRoot 'python.exe'),(Join-Path $explicitRoot 'node.exe'),(Join-Path $explicitRoot 'npm.cmd'))) {
  [IO.File]::WriteAllText($fixtureFile, 'Runtime discovery fixture; not an executable')
}
$environmentKeys = @('GOWIN_BUNDLED_PYTHON','GOWIN_NODE_PATH','GOWIN_NPM_PATH','GOWIN_PYTHON_RUNTIME_SEED','GOWIN_LEGACY_RIOS_ROOT','RIOS_PYTHON_RUNTIME_SEED')
$previous = @{}
foreach ($key in $environmentKeys) {
  $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
  [Environment]::SetEnvironmentVariable($key, $null, 'Process')
}
$checks = [System.Collections.Generic.List[string]]::new()
function Assert-RuntimePath([string]$Actual, [string]$Expected, [string]$Name) {
  if ([IO.Path]::GetFullPath($Actual) -ine [IO.Path]::GetFullPath($Expected)) { throw "$Name expected $Expected but got $Actual" }
  $checks.Add($Name)
}
try {
  $env:RIOS_PYTHON_RUNTIME_SEED = $explicitRoot
  & (Join-Path $workspaceRoot 'scripts/bootstrap-local-deps.ps1') -Root $fixtureRoot
  $bundled = Get-Content -LiteralPath (Join-Path $fixtureRoot 'configs/runtime-paths.resolved.json') -Raw | ConvertFrom-Json
  Assert-RuntimePath $bundled.python.path (Join-Path $pythonRoot 'python.exe') 'Bundled Python works without optional scientific packages'
  Assert-RuntimePath $bundled.node.path (Join-Path $nodeRoot 'node.exe') 'Bundled Node precedes system Node'
  Assert-RuntimePath $bundled.node.npm (Join-Path $nodeRoot 'npm.cmd') 'Bundled npm precedes system npm'
  if ($bundled.python.path -like '*explicit*') { throw 'RIOS seed unexpectedly overrides standalone runtime' }
  $checks.Add('Unrelated RIOS seed is ignored')
  $env:GOWIN_BUNDLED_PYTHON = Join-Path $explicitRoot 'python.exe'
  $env:GOWIN_NODE_PATH = Join-Path $explicitRoot 'node.exe'
  $env:GOWIN_NPM_PATH = Join-Path $explicitRoot 'npm.cmd'
  & (Join-Path $workspaceRoot 'scripts/bootstrap-local-deps.ps1') -Root $fixtureRoot
  $explicit = Get-Content -LiteralPath (Join-Path $fixtureRoot 'configs/runtime-paths.resolved.json') -Raw | ConvertFrom-Json
  Assert-RuntimePath $explicit.python.path $env:GOWIN_BUNDLED_PYTHON 'Explicit Python precedes bundled runtime'
  Assert-RuntimePath $explicit.node.path $env:GOWIN_NODE_PATH 'Explicit Node precedes bundled runtime'
  Assert-RuntimePath $explicit.node.npm $env:GOWIN_NPM_PATH 'Explicit npm precedes bundled runtime'
  [pscustomobject]@{ ok = $true; checks = $checks.ToArray() } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $workspaceRoot 'logs/quality/runtime-priority-20261003.json') -Encoding UTF8
  Write-Host "PASS: $($checks.Count) runtime discovery checks"
} finally {
  foreach ($key in $environmentKeys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
}
