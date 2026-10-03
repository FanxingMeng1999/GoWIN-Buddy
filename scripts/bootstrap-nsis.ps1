param(
  [string]$Root = $(Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$Version = $env:GOWIN_NSIS_VERSION,
  [string]$DownloadUrl = $env:GOWIN_NSIS_ZIP_URL,
  [switch]$ForceRefresh,
  [switch]$EmitPathOnly
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path $Root).Path
if (-not $Version) { $Version = '3.10' }
if (-not $DownloadUrl) {
  $DownloadUrl = "https://prdownloads.sourceforge.net/nsis/nsis-$Version.zip"
}

$runtimeBase = Join-Path $Root 'tools\runtime\nsis\windows-x64'
$versionRoot = Join-Path $runtimeBase $Version
$extractRoot = Join-Path $versionRoot "nsis-$Version"
$zipPath = Join-Path $versionRoot "nsis-$Version.zip"
$runtimeConfigPath = Join-Path $Root 'configs\runtime-paths.resolved.json'

function Resolve-MakeNSISPath([string[]]$Candidates) {
  foreach ($candidate in $Candidates) {
    if (-not $candidate) { continue }
    if (Test-Path $candidate) {
      return (Resolve-Path $candidate).Path
    }
  }
  return $null
}

function Get-MakeNSISCandidates {
  param(
    [string]$RootPath,
    [string]$VersionPath,
    [string]$ExtractPath
  )

  $candidates = @(
    $env:GOWIN_NSIS_EXE,
    (Join-Path $ExtractPath 'makensis.exe'),
    (Join-Path $VersionPath 'makensis.exe'),
    (Join-Path $RootPath 'tools\runtime\nsis\makensis.exe'),
    'C:\Program Files (x86)\NSIS\makensis.exe',
    'C:\Program Files\NSIS\makensis.exe'
  )

  $fromPath = Get-Command makensis -ErrorAction SilentlyContinue
  if ($fromPath) {
    $candidates += $fromPath.Source
  }
  return $candidates
}

function Ensure-ParentDir([string]$Path) {
  $parent = Split-Path $Path -Parent
  if ($parent -and !(Test-Path $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
}

function Test-ZipFile([string]$Path) {
  if (!(Test-Path $Path)) { return $false }
  try {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
      $header = New-Object byte[] 4
      $read = $stream.Read($header, 0, 4)
      if ($read -lt 4) { return $false }
    } finally {
      $stream.Dispose()
    }
    $signature = ($header | ForEach-Object { $_.ToString('X2') }) -join ''
    return $signature -eq '504B0304'
  } catch {
    return $false
  }
}

function Download-NSISZip([string]$Url, [string]$OutFile) {
  Ensure-ParentDir $OutFile
  if (Test-Path $OutFile) {
    Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue
  }

  $invokeOk = $false
  try {
    Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
    $invokeOk = Test-ZipFile $OutFile
  } catch {
    $invokeOk = $false
  }
  if ($invokeOk) {
    return
  }

  $curlCmd = Get-Command curl.exe -ErrorAction SilentlyContinue
  if (-not $curlCmd) {
    throw "Download failed via Invoke-WebRequest and curl.exe is unavailable: $Url"
  }

  if (Test-Path $OutFile) {
    Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue
  }
  & $curlCmd.Source -L $Url -o $OutFile | Out-Null
  if (-not (Test-ZipFile $OutFile)) {
    throw "Failed to download valid NSIS zip from $Url"
  }
}

if ($ForceRefresh -and (Test-Path $versionRoot)) {
  Remove-Item -LiteralPath $versionRoot -Recurse -Force -ErrorAction SilentlyContinue
}

$resolved = Resolve-MakeNSISPath (Get-MakeNSISCandidates -RootPath $Root -VersionPath $versionRoot -ExtractPath $extractRoot)
if (-not $resolved) {
  New-Item -ItemType Directory -Path $versionRoot -Force | Out-Null
  if ($ForceRefresh -or !(Test-Path $zipPath) -or -not (Test-ZipFile $zipPath)) {
    Download-NSISZip -Url $DownloadUrl -OutFile $zipPath
  }

  if (Test-Path $extractRoot) {
    Remove-Item -LiteralPath $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  Expand-Archive -Path $zipPath -DestinationPath $versionRoot -Force

  $resolved = Resolve-MakeNSISPath (Get-MakeNSISCandidates -RootPath $Root -VersionPath $versionRoot -ExtractPath $extractRoot)
}

if (-not $resolved) {
  $fallback = Get-ChildItem -Path $versionRoot -Filter 'makensis.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($fallback) {
    $resolved = $fallback.FullName
  }
}

if (-not $resolved) {
  throw "Failed to resolve makensis.exe. Tried local cache and download URL: $DownloadUrl"
}

$runtime = $null
if (Test-Path $runtimeConfigPath) {
  try {
    $runtime = Get-Content $runtimeConfigPath -Raw | ConvertFrom-Json
  } catch {
    $runtime = $null
  }
}
if (-not $runtime) {
  $runtime = [ordered]@{
    generated_at = (Get-Date).ToString('o')
    root = $Root
  }
}
$runtime.generated_at = (Get-Date).ToString('o')
$runtime.root = $Root
$runtime | Add-Member -NotePropertyName nsis -NotePropertyValue ([ordered]@{}) -Force
$runtime.nsis = [ordered]@{
  path = $resolved
  version = $Version
  root = $versionRoot
  zip = $zipPath
  source = $DownloadUrl
}
$runtime | ConvertTo-Json -Depth 8 | Set-Content -Path $runtimeConfigPath -Encoding UTF8

if ($EmitPathOnly) {
  Write-Output $resolved
  exit 0
}

Write-Host "Resolved MakeNSIS: $resolved"
Write-Host "Runtime config updated: $runtimeConfigPath"
