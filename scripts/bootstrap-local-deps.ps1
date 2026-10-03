param([string]$Root = $(Resolve-Path (Join-Path $PSScriptRoot '..')).Path)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath $Root).Path
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$cache = Join-Path $Root 'tools/downloads'
$nodeDir = Join-Path $Root 'tools/runtime/node'
$pythonDir = Join-Path $Root 'tools/runtime/python/windows-x64/3.11.9'
New-Item -ItemType Directory -Path $cache,$nodeDir,$pythonDir -Force | Out-Null
function Get-Archive([string]$Url, [string]$File, [string]$Sha256 = '') {
  if (-not (Test-Path -LiteralPath $File)) {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curl) {
      & $curl.Source --fail --location --retry 2 --output $File $Url
      if ($LASTEXITCODE -ne 0) { throw "Download failed: $Url" }
    } else { Invoke-WebRequest -Uri $Url -OutFile $File -UseBasicParsing }
  }
  if ($Sha256 -and ((Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash -ne $Sha256)) { throw "Checksum mismatch: $File" }
}
if (-not (Test-Path -LiteralPath (Join-Path $nodeDir 'node.exe'))) {
  $zip = Join-Path $cache 'node-v24.14.0-win-x64.zip'
  Get-Archive 'https://nodejs.org/dist/v24.14.0/node-v24.14.0-win-x64.zip' $zip '313fa40c0d7b18575821de8cb17483031fe07d95de5994f6f435f3b345f85c66'
  $extract = Join-Path $cache 'node-v24.14.0'
  Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
  $source = Join-Path $extract 'node-v24.14.0-win-x64'
  Get-ChildItem -LiteralPath $source | Copy-Item -Destination $nodeDir -Recurse -Force
}
if (-not (Test-Path -LiteralPath (Join-Path $pythonDir 'python.exe'))) {
  $zip = Join-Path $cache 'python-3.11.9-embed-amd64.zip'
  Get-Archive 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip' $zip
  Expand-Archive -LiteralPath $zip -DestinationPath $pythonDir -Force
}
function Resolve-Runtime([string]$Explicit, [string]$Bundled, [string]$Fallback) {
  foreach ($candidate in @($Explicit,$Bundled)) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { return (Resolve-Path -LiteralPath $candidate).Path }
  }
  $command = Get-Command $Fallback -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  throw "Runtime tool not found: $Fallback"
}
$resolved = [ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString('o')
  root = $Root
  node = [ordered]@{
    path = Resolve-Runtime $env:GOWIN_NODE_PATH (Join-Path $nodeDir 'node.exe') 'node'
    npm = Resolve-Runtime $env:GOWIN_NPM_PATH (Join-Path $nodeDir 'npm.cmd') 'npm'
  }
  python = [ordered]@{
    path = Resolve-Runtime $env:GOWIN_BUNDLED_PYTHON (Join-Path $pythonDir 'python.exe') 'python'
  }
}
New-Item -ItemType Directory -Path (Join-Path $Root 'configs') -Force | Out-Null
$resolved | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $Root 'configs/runtime-paths.resolved.json') -Encoding UTF8
$global:LASTEXITCODE = 0
Write-Host 'Local build/runtime dependencies are ready.'
