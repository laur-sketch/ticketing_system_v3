# Interactive setup for UGREEN NAS database backup mirror.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/setup-backup-nas.ps1
#
# Creates/updates .env keys:
#   DB_BACKUP_NAS_HOST, DB_BACKUP_NAS_SHARE, DB_BACKUP_MIRROR_DIR, DB_BACKUP_NAS_USER
# Stores the NAS password in Windows Credential Manager (not written to .env).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"

function Read-DotEnvValue([string]$Key) {
  if (-not (Test-Path $envFile)) { return "" }
  foreach ($lineRaw in Get-Content $envFile) {
    $line = $lineRaw.Trim()
    if (-not $line -or $line.StartsWith("#")) { continue }
    $eq = $line.IndexOf("=")
    if ($eq -le 0) { continue }
    $name = $line.Substring(0, $eq).Trim()
    if ($name -ne $Key) { continue }
    $value = $line.Substring($eq + 1).Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"')) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    return $value
  }
  return ""
}

function Set-DotEnvValue([string]$Key, [string]$Value) {
  $quoted = '"' + ($Value -replace '"', '\"') + '"'
  $lines = @()
  if (Test-Path $envFile) { $lines = [System.Collections.Generic.List[string]]@(Get-Content $envFile) }
  else { $lines = [System.Collections.Generic.List[string]]@() }

  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i].Trim()
    if ($line.StartsWith("#") -or -not $line.Contains("=")) { continue }
    $name = $line.Split("=", 2)[0].Trim()
    if ($name -eq $Key) {
      $lines[$i] = "$Key=$quoted"
      $found = $true
      break
    }
  }
  if (-not $found) { $lines.Add("$Key=$quoted") }
  Set-Content -Path $envFile -Value $lines -Encoding UTF8
}

function Remove-DotEnvValue([string]$Key) {
  if (-not (Test-Path $envFile)) { return }
  $lines = Get-Content $envFile | Where-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return $true }
    ($line.Split("=", 2)[0].Trim() -ne $Key)
  }
  Set-Content -Path $envFile -Value $lines -Encoding UTF8
}

Write-Host "UGREEN NAS backup mirror setup"
Write-Host ""

function Get-LocalIPv4 {
  $ips = @()
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  foreach ($line in (ipconfig | Out-String).Split("`n")) {
    if ($line -match 'IPv4 Address[^:]*:\s*(\d+\.\d+\.\d+\.\d+)') {
      $ips += $Matches[1]
    }
  }
  $ErrorActionPreference = $prev
  return @($ips | Select-Object -Unique)
}

$localIps = Get-LocalIPv4
Write-Host "You are on server: $env:COMPUTERNAME"
Write-Host "This server IP(s): $($localIps -join ', ')"
Write-Host "UGOS SMB settings show: \\AGC-NAS or \\10.10.5.120 (workgroup AGC)"
Write-Host ""

$defaultHost = Read-DotEnvValue "DB_BACKUP_NAS_HOST"
if (-not $defaultHost -or ($defaultHost -in $localIps)) {
  if ($defaultHost -in $localIps) {
    Write-Host "WARNING: Saved NAS IP $defaultHost is this server - using 10.10.5.120"
  }
  $defaultHost = "10.10.5.120"
}

Write-Host "If 10.10.5.120 is unreachable, run as Admin: npm run db:backup:add-nas-route"
Write-Host ""

$hostInput = Read-Host "NAS IP from UGOS SMB settings [$defaultHost]"
$nasHost = if ($hostInput) { $hostInput.Trim() } else { $defaultHost }
if ($nasHost -in $localIps) {
  throw "Wrong IP: $nasHost is THIS server ($env:COMPUTERNAME). Use the NAS IP (10.10.5.120)."
}

Write-Host "Detecting SMB NetBIOS name..."
$netbios = ""
$raw = & nbtstat.exe -A $nasHost 2>&1 | Out-String
if ($raw -match '(\S+)\s+<20>\s+UNIQUE') {
  $netbios = $Matches[1].Trim()
  Write-Host "  Found: $netbios (use this as COMPUTER\\user for SMB, not the ug.link name)"
} else {
  Write-Host "  Could not auto-detect; will try configured device name."
}

$defaultShare = Read-DotEnvValue "DB_BACKUP_NAS_SHARE"
$shareInput = Read-Host "SMB shared folder name on the NAS [$defaultShare]"
$nasShare = if ($shareInput) { $shareInput.Trim() } else { $defaultShare }
if (-not $nasShare) { throw "Shared folder name is required (create one in UGOS, e.g. backups)." }

$defaultSubdir = "ticket-system-backups"
$existingMirror = Read-DotEnvValue "DB_BACKUP_MIRROR_DIR"
if ($existingMirror -match '\\[^\\]+$') {
  $defaultSubdir = ($existingMirror -replace '\\', '/') -replace '.*/', ''
}
$subdirInput = Read-Host "Subfolder on the share [$defaultSubdir]"
$subdir = if ($subdirInput) { $subdirInput.Trim() } else { $defaultSubdir }

$defaultUser = Read-DotEnvValue "DB_BACKUP_NAS_USER"
if (-not $defaultUser) { $defaultUser = "lau" }
$userInput = Read-Host "NAS username [$defaultUser]"
$nasUser = if ($userInput) { $userInput.Trim() } else { $defaultUser }
if (-not $nasUser) { throw "NAS username is required." }

$defaultDevice = Read-DotEnvValue "DB_BACKUP_NAS_NETBIOS_NAME"
if (-not $defaultDevice) { $defaultDevice = "AGC-NAS" }
$deviceInput = Read-Host "SMB name from UGOS (AGC-NAS) [$defaultDevice]"
$nasDevice = if ($deviceInput) { $deviceInput.Trim() } else { $defaultDevice }

$securePass = Read-Host "NAS password" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePass)
try {
  $nasPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
if (-not $nasPass) { throw "NAS password is required." }

$mirrorDir = "//$nasHost/$nasShare/$subdir"

Set-DotEnvValue "DB_BACKUP_NAS_HOST" $nasHost
Set-DotEnvValue "DB_BACKUP_NAS_SHARE" $nasShare
Set-DotEnvValue "DB_BACKUP_MIRROR_DIR" $mirrorDir
Set-DotEnvValue "DB_BACKUP_NAS_USER" $nasUser
Set-DotEnvValue "DB_BACKUP_NAS_DEVICE_NAME" $nasDevice
Set-DotEnvValue "DB_BACKUP_NAS_NETBIOS_NAME" $nasDevice
Set-DotEnvValue "DB_BACKUP_NAS_WORKGROUP" "AGC"
Set-DotEnvValue "DB_BACKUP_MIRROR_MODE" "smb"
Set-DotEnvValue "DB_BACKUP_NAS_PASS" $nasPass

Write-Host ""
Write-Host "Testing NAS connection..."
$mountScript = Join-Path $root "scripts\mount-backup-nas.ps1"
$env:DB_BACKUP_MIRROR_DIR = $mirrorDir
$env:DB_BACKUP_NAS_HOST = $nasHost
$env:DB_BACKUP_NAS_USER = $nasUser
$env:DB_BACKUP_NAS_DEVICE_NAME = "agc-nas"
if ($netbios) { $env:DB_BACKUP_NAS_NETBIOS_NAME = $netbios } else { $env:DB_BACKUP_NAS_NETBIOS_NAME = $nasDevice }
$env:DB_BACKUP_NAS_PASS = $nasPass
& $mountScript

Write-Host ""
Write-Host "Saved to .env:"
Write-Host "  DB_BACKUP_NAS_HOST=$nasHost"
Write-Host "  DB_BACKUP_NAS_SHARE=$nasShare"
Write-Host "  DB_BACKUP_MIRROR_DIR=$mirrorDir"
Write-Host "  DB_BACKUP_NAS_USER=$nasUser"
Write-Host ""
Write-Host "Password stored in .env (DB_BACKUP_NAS_PASS) and Credential Manager."
Write-Host "Run a backup now with: npm run db:backup"
