# Ensures the UGREEN NAS (or any SMB share) is reachable before db-backup runs.
# Scheduled tasks do not see mapped drive letters — use a UNC path in DB_BACKUP_MIRROR_DIR.
#
# One-time setup:
#   npm run db:backup:setup-nas
#
# Diagnose SMB login (tries multiple username formats):
#   npm run db:backup:test-nas

param(
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"

function Write-Info([string]$Message) {
  if (-not $Quiet) { Write-Host $Message }
}

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

function Read-ConfigValue([string]$Key) {
  $fromEnv = [Environment]::GetEnvironmentVariable($Key)
  if ($fromEnv) { return $fromEnv.Trim() }
  return (Read-DotEnvValue $Key).Trim()
}

function Normalize-UncPath([string]$PathValue) {
  if (-not $PathValue) { return "" }
  $normalized = $PathValue.Trim()
  if ($normalized -match '^//|^\\\\') {
    $body = ($normalized -replace '^/+|^\\+', '').Replace("/", "\")
    return "\\$body"
  }
  return $normalized.Replace("/", "\")
}

function Get-NasRootUnc([string]$MirrorDir) {
  $nasHost = Read-ConfigValue "DB_BACKUP_NAS_HOST"
  $nasShare = Read-ConfigValue "DB_BACKUP_NAS_SHARE"
  if ($nasHost -and $nasShare) {
    return "\\$nasHost\$nasShare"
  }

  $unc = Normalize-UncPath $MirrorDir
  if ($unc -notmatch '^\\\\([^\\]+)\\([^\\]+)(\\.*)?$') {
    throw "DB_BACKUP_MIRROR_DIR must be a UNC path like //192.168.50.21/ShareName/ticket-system-backups"
  }
  return "\\$($Matches[1])\$($Matches[2])"
}

function Resolve-NasNetbiosName([string]$NasHost) {
  $configured = Read-ConfigValue "DB_BACKUP_NAS_NETBIOS_NAME"
  if ($configured) { return $configured }

  $prev = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  $raw = & nbtstat.exe -A $NasHost 2>&1 | Out-String
  $ErrorActionPreference = $prev
  if ($raw -match '(\S+)\s+<20>\s+UNIQUE') {
    return $Matches[1].Trim()
  }

  $fallback = Read-ConfigValue "DB_BACKUP_NAS_DEVICE_NAME"
  return $fallback
}

function Get-UsernameCandidates([string]$User, [string]$NasHost, [string]$NetbiosName, [string]$DeviceName) {
  $candidates = New-Object System.Collections.Generic.List[string]
  if ($User -match '[\\@]') {
    $candidates.Add($User) | Out-Null
    return @($candidates)
  }

  $workgroup = Read-ConfigValue "DB_BACKUP_NAS_WORKGROUP"
  $prefixes = @()
  if ($NetbiosName) { $prefixes += $NetbiosName }
  $deviceName = Read-ConfigValue "DB_BACKUP_NAS_DEVICE_NAME"
  if ($deviceName -and $deviceName -ne $NetbiosName) { $prefixes += $deviceName.ToUpper() }
  if ($deviceName -and $deviceName -ne $NetbiosName) { $prefixes += $deviceName }
  foreach ($prefix in @("AGC-NAS", "LOWRINS")) {
    if ($prefix -and $prefixes -notcontains $prefix) { $prefixes += $prefix }
  }
  if ($workgroup) { $prefixes += $workgroup }
  foreach ($prefix in $prefixes) {
    $candidate = "$prefix\$User"
    if ($candidates -notcontains $candidate) { $candidates.Add($candidate) | Out-Null }
  }

  foreach ($candidate in @($User, ".\$User", "$NasHost\$User", "WORKGROUP\$User")) {
    if (-not $candidate) { continue }
    if ($candidates -notcontains $candidate) { $candidates.Add($candidate) | Out-Null }
  }
  return @($candidates)
}

function Clear-NasCredentials([string]$HostName, [string]$DeviceName, [string]$NetbiosName) {
  foreach ($target in @($HostName, $DeviceName, $NetbiosName, "TERMSRV/$HostName")) {
    if (-not $target) { continue }
    cmdkey /delete:$target 2>$null | Out-Null
  }
  Remove-NasMapping -RemotePath "\\$HostName"
  Remove-NasMapping -RemotePath "\\$HostName\IPC$"
}

function Store-NasCredentials([string]$HostName, [string]$User, [string]$Pass) {
  if (-not $User -or -not $Pass -or -not $HostName) { return }
  cmdkey /delete:$HostName 2>$null | Out-Null
  cmdkey /add:$HostName /user:$User /pass:$Pass | Out-Null
  Write-Info "Stored NAS credentials in Windows Credential Manager for $HostName as $User"
}

function Test-SmbConnect([string]$RemotePath, [string]$User, [string]$Pass, [string]$NasHost) {
  Remove-NasMapping -RemotePath $RemotePath
  Remove-NasMapping -RemotePath "\\$NasHost"
  Remove-NasMapping -RemotePath "\\$NasHost\IPC$"

  try {
    $secure = ConvertTo-SecureString $Pass -AsPlainText -Force
    $cred = New-Object System.Management.Automation.PSCredential($User, $secure)
    New-SmbMapping -RemotePath $RemotePath -Credential $cred -Persistent $false -ErrorAction Stop | Out-Null
    return @{ Ok = $true; Detail = "Connected via SMB mapping" }
  } catch {
    $detail = $_.Exception.Message
  }

  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = & net.exe use $RemotePath $Pass "/user:$User" "/persistent:no" 2>&1 | Out-String
  $ErrorActionPreference = $prev
  if ($LASTEXITCODE -eq 0 -or $output -match 'already connected|Multiple connections|command completed successfully') {
    return @{ Ok = $true; Detail = $output.Trim() }
  }
  return @{ Ok = $false; Detail = if ($detail) { $detail } else { $output.Trim() } }
}

function Remove-NasMapping([string]$RemotePath) {
  Remove-SmbMapping -RemotePath $RemotePath -Force -ErrorAction SilentlyContinue | Out-Null
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  try {
    & net.exe use $RemotePath /delete /y 2>&1 | Out-Null
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Connect-NasShare([string]$RemotePath, [string]$User, [string]$Pass, [string]$NasHost, [string]$DeviceName, [string]$NetbiosName) {
  if (-not $User) { throw "DB_BACKUP_NAS_USER is not set." }

  $attempts = Get-UsernameCandidates -User $User -NasHost $NasHost -NetbiosName $NetbiosName -DeviceName $DeviceName
  $errors = New-Object System.Collections.Generic.List[string]

  if ($Pass) {
    Clear-NasCredentials -HostName $NasHost -DeviceName $DeviceName -NetbiosName $NetbiosName
    foreach ($candidate in $attempts) {
      $ipcResult = Test-SmbConnect -RemotePath "\\$NasHost\IPC$" -User $candidate -Pass $Pass -NasHost $NasHost
      if (-not $ipcResult.Ok) {
        $errors.Add("IPC$ ${candidate}: $($ipcResult.Detail)") | Out-Null
        continue
      }
      $result = Test-SmbConnect -RemotePath $RemotePath -User $candidate -Pass $Pass -NasHost $NasHost
      Remove-NasMapping -RemotePath "\\$NasHost\IPC$"
      if ($result.Ok) {
        Store-NasCredentials -HostName $NasHost -User $candidate -Pass $Pass
        return $candidate
      }
      $errors.Add("share ${candidate}: $($result.Detail)") | Out-Null
    }
  } else {
    foreach ($candidate in $attempts) {
      Remove-NasMapping -RemotePath $RemotePath
      try {
        New-SmbMapping -RemotePath $RemotePath -UserName $candidate -Persistent $false -ErrorAction Stop | Out-Null
        return $candidate
      } catch {
        $errors.Add("${candidate}: $($_.Exception.Message)") | Out-Null
      }
    }
  }

  $hint = @(
    "Could not authenticate to $RemotePath.",
    "From UGOS SMB settings use: AGC-NAS\lau or AGC\lau (workgroup AGC).",
    "Server must use reachable IP 192.168.50.21 (10.10.5.120 is another network segment).",
    "Test in File Explorer on THIS server: \\192.168.50.21 with AGC-NAS\lau",
    "",
    "Attempts:"
  ) + $errors
  throw ($hint -join [Environment]::NewLine)
}

$mirrorDir = Normalize-UncPath (Read-ConfigValue "DB_BACKUP_MIRROR_DIR")
if (-not $mirrorDir) {
  Write-Info "DB_BACKUP_MIRROR_DIR is not set; skipping NAS mount."
  exit 0
}
if ($mirrorDir -match "REPLACE_WITH") {
  Write-Info "DB_BACKUP_MIRROR_DIR is still a placeholder. Run: npm run db:backup:setup-nas"
  exit 0
}

$nasHost = Read-ConfigValue "DB_BACKUP_NAS_HOST"
$nasUser = Read-ConfigValue "DB_BACKUP_NAS_USER"
$nasPass = Read-ConfigValue "DB_BACKUP_NAS_PASS"
$nasDevice = Read-ConfigValue "DB_BACKUP_NAS_DEVICE_NAME"
if (-not $nasDevice) { $nasDevice = "agc-nas" }
$nasNetbios = Resolve-NasNetbiosName -NasHost $nasHost
if ($nasNetbios -and -not $Quiet) {
  Write-Info "NAS SMB NetBIOS name: $nasNetbios"
}
$nasRoot = Get-NasRootUnc $mirrorDir
if (-not $nasHost) {
  if ($nasRoot -match '^\\([^\\]+)\\') { $nasHost = $Matches[1] }
}

$connectedAs = Connect-NasShare -RemotePath $nasRoot -User $nasUser -Pass $nasPass -NasHost $nasHost -DeviceName $nasDevice -NetbiosName $nasNetbios
if ($connectedAs -and $connectedAs -ne $nasUser) {
  Write-Info "Connected using username format: $connectedAs"
}

New-Item -ItemType Directory -Force -Path $mirrorDir | Out-Null

$probe = Join-Path $mirrorDir ".write-test-$([guid]::NewGuid().ToString('N')).tmp"
try {
  [System.IO.File]::WriteAllText($probe, "ok")
  Remove-Item $probe -Force
} catch {
  throw "NAS path exists but is not writable: $mirrorDir. $_"
}

Write-Info "NAS mirror ready: $mirrorDir"
