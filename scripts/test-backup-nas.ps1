# Try SMB login to UGREEN NAS with common username formats (no .env changes).
param(
  [string]$Password
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"

function Remove-NetUseQuiet([string]$RemotePath) {
  Remove-SmbMapping -RemotePath $RemotePath -Force -ErrorAction SilentlyContinue | Out-Null
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  try {
    & net.exe use $RemotePath /delete /y 2>&1 | Out-Null
  } finally {
    $ErrorActionPreference = $prev
  }
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

$nasHost = Read-DotEnvValue "DB_BACKUP_NAS_HOST"
$nasShare = Read-DotEnvValue "DB_BACKUP_NAS_SHARE"
$nasUser = Read-DotEnvValue "DB_BACKUP_NAS_USER"
$device = Read-DotEnvValue "DB_BACKUP_NAS_NETBIOS_NAME"
if (-not $device) { $device = Read-DotEnvValue "DB_BACKUP_NAS_DEVICE_NAME" }
if (-not $device) { $device = "LOWRINS" }
if (-not $nasHost) { $nasHost = "192.168.50.21" }
if (-not $nasShare) { $nasShare = "DB's updated" }
if (-not $nasUser) { $nasUser = "lau" }

if (-not $Password) {
  $securePass = Read-Host "NAS password for $nasUser" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePass)
  try {
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

$remotePath = "\\$nasHost\$nasShare"
Write-Host "Testing SMB login to $remotePath"

$smb = Test-NetConnection $nasHost -Port 445 -WarningAction SilentlyContinue
if (-not $smb.TcpTestSucceeded) {
  Write-Host "WARNING: NAS is not reachable on SMB port 445 at $nasHost"
} else {
  Write-Host "SMB port 445 on $nasHost is reachable."
}
Write-Host ""

$candidates = @(
  "$device\$nasUser",
  $nasUser,
  "agc-nas\$nasUser",
  ".\$nasUser",
  "$nasHost\$nasUser",
  "WORKGROUP\$nasUser"
) | Select-Object -Unique

foreach ($candidate in $candidates) {
  Remove-NetUseQuiet -RemotePath $remotePath
  Remove-NetUseQuiet -RemotePath "\\$nasHost"
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = & net.exe use $remotePath $Password "/user:$candidate" "/persistent:no" 2>&1 | Out-String
  $ErrorActionPreference = $prev
  if ($LASTEXITCODE -eq 0 -or $output -match 'already connected|command completed successfully') {
    Write-Host "SUCCESS with username: $candidate"
    Remove-NetUseQuiet -RemotePath $remotePath
    Write-Host ""
    Write-Host "Set in .env:"
    Write-Host "  DB_BACKUP_NAS_USER=`"$candidate`""
    exit 0
  }
  Write-Host "FAILED  $candidate"
  Write-Host "        $($output.Trim())"
  Write-Host ""
}

Write-Host "None of the username formats worked."
Write-Host "Confirm SMB is enabled in UGOS and lau has write access to '$nasShare'."
exit 1
