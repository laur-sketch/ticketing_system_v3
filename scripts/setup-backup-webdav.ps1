# Setup WebDAV mirror using your UGOS web login (same as https://agc-nas.aar3.ug.link).
# Enable WebDAV first: UGOS Control Panel -> File Service -> WebDAV -> Enable.

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
    if ($line.Split("=", 2)[0].Trim() -eq $Key) {
      $lines[$i] = "$Key=$quoted"
      $found = $true
      break
    }
  }
  if (-not $found) { $lines.Add("$Key=$quoted") }
  Set-Content -Path $envFile -Value $lines -Encoding UTF8
}

Write-Host "UGREEN NAS WebDAV backup setup"
Write-Host "(Uses the same username/password as UGOS web login)"
Write-Host ""
Write-Host "In UGOS first: Control Panel -> File Service -> WebDAV -> Enable"
Write-Host ""

$defaultHost = Read-DotEnvValue "DB_BACKUP_NAS_HOST"
if (-not $defaultHost) { $defaultHost = "192.168.50.21" }

$hostInput = Read-Host "NAS LAN IP [$defaultHost]"
$nasHost = if ($hostInput) { $hostInput.Trim() } else { $defaultHost }

$defaultPort = Read-DotEnvValue "DB_BACKUP_WEBDAV_PORT"
if (-not $defaultPort) { $defaultPort = "5005" }
$portInput = Read-Host "WebDAV HTTP port (UGOS default 5005) [$defaultPort]"
$webdavPort = if ($portInput) { $portInput.Trim() } else { $defaultPort }

$defaultShare = Read-DotEnvValue "DB_BACKUP_NAS_SHARE"
if (-not $defaultShare) { $defaultShare = "DB's updated" }
$shareInput = Read-Host "Shared folder name [$defaultShare]"
$nasShare = if ($shareInput) { $shareInput.Trim() } else { $defaultShare }

$defaultSubdir = "ticket-system-backups"
$subdirInput = Read-Host "Subfolder on the share [$defaultSubdir]"
$subdir = if ($subdirInput) { $subdirInput.Trim() } else { $defaultSubdir }

$defaultUser = Read-DotEnvValue "DB_BACKUP_WEBDAV_USER"
if (-not $defaultUser) { $defaultUser = Read-DotEnvValue "DB_BACKUP_NAS_USER" }
if (-not $defaultUser) { $defaultUser = "lau" }
$userInput = Read-Host "UGOS web username [$defaultUser]"
$webdavUser = if ($userInput) { $userInput.Trim() } else { $defaultUser }

$securePass = Read-Host "UGOS web password" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePass)
try {
  $webdavPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
if (-not $webdavPass) { throw "Password is required." }

$webdavUrl = "http://${nasHost}:${webdavPort}/${nasShare}/${subdir}"

Set-DotEnvValue "DB_BACKUP_MIRROR_MODE" "webdav"
Set-DotEnvValue "DB_BACKUP_NAS_HOST" $nasHost
Set-DotEnvValue "DB_BACKUP_NAS_SHARE" $nasShare
Set-DotEnvValue "DB_BACKUP_WEBDAV_URL" $webdavUrl
Set-DotEnvValue "DB_BACKUP_WEBDAV_USER" $webdavUser
Set-DotEnvValue "DB_BACKUP_WEBDAV_PASS" $webdavPass
Set-DotEnvValue "DB_BACKUP_WEBDAV_PORT" $webdavPort
Set-DotEnvValue "DB_BACKUP_MIRROR_DIR" ""

Write-Host ""
Write-Host "Testing WebDAV connection..."
$node = (Get-Command node -ErrorAction Stop).Source
$testScript = Join-Path $root "scripts\test-backup-webdav.cjs"
& $node $testScript
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Saved to .env (password stored in .env only, not committed to git):"
Write-Host "  DB_BACKUP_MIRROR_MODE=webdav"
Write-Host "  DB_BACKUP_WEBDAV_URL=$webdavUrl"
Write-Host "  DB_BACKUP_WEBDAV_USER=$webdavUser"
Write-Host ""
Write-Host "Run backup now: npm run db:backup"
