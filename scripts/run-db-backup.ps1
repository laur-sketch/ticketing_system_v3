# Runs NAS mount (if configured) then database backup.
param([switch]$DryRun, [switch]$List)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$mountScript = Join-Path $root "scripts\mount-backup-nas.ps1"
$backupScript = Join-Path $root "scripts\db-backup.cjs"

function Resolve-NodeExecutable {
  $candidates = @()
  if ($env:ProgramFiles) {
    $candidates += Join-Path $env:ProgramFiles "nodejs\node.exe"
  }
  foreach ($cmd in (Get-Command node -All -ErrorAction SilentlyContinue)) {
    $candidates += $cmd.Source
  }
  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if (-not $candidate) { continue }
    if ($candidate -match "\\cursor\\|\\vscode\\") { continue }
    if (Test-Path $candidate) { return $candidate }
  }
  return (Get-Command node -ErrorAction Stop).Source
}

$node = Resolve-NodeExecutable

if (-not $DryRun -and -not $List) {
  $envFile = Join-Path $root ".env"
  $mirrorMode = ""
  if (Test-Path $envFile) {
    foreach ($lineRaw in Get-Content $envFile) {
      $line = $lineRaw.Trim()
      if ($line -match '^DB_BACKUP_MIRROR_MODE="?([^"]+)"?$') { $mirrorMode = $Matches[1].Trim().ToLower(); break }
    }
    if (-not $mirrorMode -and (Select-String -Path $envFile -Pattern '^DB_BACKUP_WEBDAV_URL=' -Quiet)) {
      $mirrorMode = "webdav"
    }
  }
  if ($mirrorMode -ne "webdav") {
    & $mountScript -Quiet
  }
}

$args = @($backupScript)
if ($DryRun) { $args += "--dry-run" }
if ($List) { $args += "--list" }

& $node @args
exit $LASTEXITCODE
